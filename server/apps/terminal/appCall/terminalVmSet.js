import Joi from "joi"
import appManager from "../../appManager.js"
import waitConfirm from "../../../tools/waitConfirm.js"
// 【架构铁律】严禁通过 terminalBackend 触碰任何终端 session 或内部状态！
// 此处仅借用 cleanTerminalContent 这一无状态纯函数，通信与状态获取一律走 appManager.dispatch。
import terminalBackend from "../backend.js"
import pathLib from "path"
import workDirTool from "../../../tools/workDirTool.js"
import qemuManager from "../../../tools/vm/qemuManager.js"

function decodeLsofPath(rawPath) {
  if (!rawPath || typeof rawPath !== "string" || !rawPath.includes("\\x")) return rawPath
  try {
    const byteList = []
    for (let i = 0; i < rawPath.length; ) {
      if (rawPath[i] === "\\" && rawPath[i + 1] === "x" && i + 3 < rawPath.length) {
        const hex = rawPath.slice(i + 2, i + 4)
        const byte = parseInt(hex, 16)
        if (!isNaN(byte)) {
          byteList.push(byte)
          i += 4
          continue
        }
      }
      const buf = Buffer.from(rawPath[i], "utf8")
      for (const b of buf) byteList.push(b)
      i++
    }
    return Buffer.from(byteList).toString("utf8")
  } catch (e) {
    return rawPath
  }
}

export default {
  name: "执行微虚拟机终端命令",
  id: "terminalVmSet",
  mode: {
    read: true,
    write: true
  },

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    let { appId, waitSec, commands, minimized, force } = value

    // 强制安全校验 1：多命令流水线中，除了最后一条，前面的子命令必须提供有效的连接符 op
    for (let i = 0; i < commands.length - 1; i++) {
      if (!commands[i].op) {
        return `参数错误：在多命令流水线中，除最后一条命令外，前面的每一条子命令（例如第 ${i + 1} 条的 \`${commands[i].bin}\`）都必须显式提供连接符 'op' (如 '&&', ';', '|', '||' 等)，否则会导致危险的无连接符黏连执行！`
      }
    }

    // 强制安全校验 2：检测未被引号包裹的敏感特殊字符与空格（防止命令注入与语法混淆）
    const dangerousPattern = /[ \t\n\r&|;`$<>(){}!]/
    const pureRedirToken = /^(<<<|&>>?|\d*(>>?|<<?)|\d*>&\d*|\d*<&\d*)$/
    for (const item of commands) {
      for (const rawArg of (item.args || [])) {
        const s = String(rawArg === null || rawArg === undefined ? "" : rawArg)
        const isQuoted = (s.startsWith("'") && s.endsWith("'") && s.length >= 2) ||
          (s.startsWith('"') && s.endsWith('"') && s.length >= 2)

        if (!isQuoted && (s === "" || (dangerousPattern.test(s) && !pureRedirToken.test(s)))) {
          const detail = s === "" ? "空字符串" : `"${s}"`
          return `参数安全校验失败：子命令 '${item.bin}' 的参数 ${detail} 包含空格或特殊控制字符（如 &、|、;、$、反引号等），但首尾未被引号包裹！
【修复指引】：
1. 若该参数是字面量文本、含空格路径或包含特殊符号，必须显式使用单引号包裹，例如 args: ["'${s}'"]；
2. 若是纯空格参数（如 tr ' '），请显式写为 args: ["' '"]；
3. 若试图执行多条命令，请拆分为 commands 数组中的独立命令对象，并使用 'op' 连接符。
4. 若该参数是纯重定向符号（如 >、>>、2>、2>>、<、<<、<<<、&>、2>&1 等独立 token），可直接裸传，无需引号包裹。`
        }
      }
    }

    // 结构化流水线拼接算法
    const segments = []
    for (let i = 0; i < commands.length; i++) {
      const item = commands[i]
      const cmdTokens = [item.bin, ...(item.args || [])]
      segments.push(cmdTokens.join(" "))
      if (item.op && i < commands.length - 1) {
        segments.push(item.op)
      }
    }
    const fullCommand = segments.join(" ")

    const currentListId = metaData?.listId
    if (typeof currentListId !== "number") {
      throw new Error(`[terminalVmSet] 系统错误：metaData 中缺少必需的 listId 参数 (当前值为: ${currentListId})`)
    }
    const toolCallGroupId = metaData?.toolCallGroupId
    const deferredFns = metaData?.deferredFns

    // 授权审批中的管理员留言前缀：函数顶层声明，供后续所有返回路径统一复用
    let commentPrefix = ""

    // 计算目标运行目录 targetCwd（统一使用主队列 0 的主工作目录，无则默认 aiWork）
    const mainWorkDir = workDirTool.getMainWorkDir(0)
    const defaultCwd = pathLib.resolve(process.cwd(), "..", "aiWork")
    let targetCwd = mainWorkDir || defaultCwd

    let termApp = null

    if (appId === "-1") {
      // 启动前门禁：若新建虚拟终端，但 QEMU 引擎或镜像尚未就绪，阻断启动并在聊天流中唤起审批卡片
      if (!qemuManager.isQemuBinReady() || !qemuManager.isQemuImageReady()) {
        const authConfirm = await waitConfirm({
          type: "tip",
          title: "开启微虚拟机免审终端",
          content: "缺少 QEMU 虚拟机软件和虚拟机镜像，是否下载并让 AI 安装？",
          listId: currentListId,
          ext: { identifier: "app:terminal:qemu_install", toolId: this.id }
        })

        commentPrefix = authConfirm.comment ? `【管理员留言】：${authConfirm.comment}\n\n` : ""

        if (!authConfirm.ok) {
          return commentPrefix + "管理员已拒绝授权下载与安装微虚拟机。"
        }

        // 管理员在聊天审批卡片批准后，联动前端唤起【虚拟机管理面板】并启动下载
        if (appManager.io) {
          appManager.io.emit("terminal:openVmManager", { autoStartDownload: true })
        }

        return commentPrefix + "管理员已授权。系统已唤起【虚拟机管理面板】自动开始下载镜像与软件源码，下载完成后管理员将在面板中点击召唤按钮唤醒你编译安装。请向管理员汇报当前正在管理面板下载中，并耐心等待下载就绪。"
      }

      // 必须明确传入 -1 来新建全新的纯净终端
      let launchRes
      try {
        launchRes = await appManager.launch("terminal", {
          data: {
            mode: "vm",
            window: { minimized },
            cwd: mainWorkDir,
            listId: currentListId,
            toolCallGroupId,
            deferredFns
          }
        })
        if (!launchRes?.ok) {
          return commentPrefix + `启动微虚拟机终端失败: ${launchRes?.msg || "未知错误"}\n原始返回:\n${JSON.stringify(launchRes, null, 2)}`
        }
        termApp = launchRes.app
        await new Promise(res => setTimeout(res, 1000))
      } catch (err) {
        return commentPrefix + `启动微虚拟机终端异常抛出: ${err.message}\n堆栈:\n${err.stack}`
      }
    } else {
      // 指定 appId 模式：严格校验必须是虚拟系统终端（完全对齐 terminalSet）
      termApp = appManager.get(appId)
      if (!termApp) return commentPrefix + `未找到 appId 为 ${appId} 的终端`
      if (termApp.data.listId !== currentListId) {
        return commentPrefix + "权限不足：该终端不属于当前智能体会话列表。"
      }

      const session = (await appManager.dispatch(termApp.id, "getSession")).data
      if (!session || !session.shell) {
        return commentPrefix + `无法执行：终端 (appId="${termApp.id}") 的底层物理进程已断开（由于系统重启变为僵尸终端）。请留空 appId 让系统自动分配，或传入 appId="-1" 强制新建终端。`
      }

      const isTargetVm = Boolean(session?.isVirtual || termApp.data?.mode === "vm")
      if (!isTargetVm) {
        return commentPrefix + `执行被系统拦截：您指定的终端 (${appId}) 是【宿主物理系统终端】，禁止使用微虚拟机专属工具 terminalVmSet 操控！若需在宿主物理终端执行命令，请改用 terminalSet 工具。`
      }

      // 显式指定终端的运行状态拦截保护（完全对齐 terminalSet）
      const procRes = await appManager.dispatch(termApp.id, "checkRunningProcess")
      if (procRes?.hasRunningProcess && !force) {
        return commentPrefix + `无法执行：目标终端 (appId="${termApp.id}") 当前正在运行前台程序或服务进程（如开发服务器/Vim/交互环境等）。\n为保护服务不被中断，已阻止直接输入。\n如需在新终端中执行命令，请传入 appId="-1"；如需强制向当前会话发送指令，请设置 force: true（注意：可能干扰正在运行的程序）。`
      }

      const lastLine = (terminalBackend.cleanTerminalContent(session?.content || "")).trim().split("\n").pop() || ""
      const suspendedMatch = lastLine.match(/\b(dquote|quote|bquote|cmdand|cmdor|pipe|heredoc|subsh|cursh)>\s*$/)
      if (suspendedMatch && !force) {
        return commentPrefix + `无法执行：目标终端 (appId="${termApp.id}") 当前处于未闭合的语法等待状态 (\`${suspendedMatch[0]}\`，例如未闭合的引号或多行输入)。\n终端当前末行输出为:\n\`${lastLine}\`\n请根据情况决策：如需取消当前未完成的输入并重置提示符，可向该终端发送 Ctrl+C (如传入 command: "\\x03")；如需在全新终端中执行，请传入 appId="-1"；如需强制发送，请设置 force: true。`
      }

      // 更新工具上下文
      await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId, deferredFns })
    }

    // --- 保护外壳：无论后续读写或网络发生什么异常，确保释放被锁定的终端（100% 对齐 terminalSet）---
    try {
      // 广播 app:active 聚焦/打开终端窗口（仅非静默模式）
      if (appManager.io && !minimized) {
        appManager.io.emit("app:active", { appId: termApp.id })
      }

      const session = (await appManager.dispatch(termApp.id, "getSession")).data
      let startOffset = session?.content?.length || 0

      // 动态修正 startOffset，向前回溯寻找上一个真正的物理换行符 \n，以包含完整的提示符
      if (session?.content && startOffset > 0) {
        const lastNewlineIdx = session.content.lastIndexOf("\n", startOffset - 1)
        if (lastNewlineIdx !== -1) {
          startOffset = lastNewlineIdx + 1
        } else {
          startOffset = 0
        }
      }

      // 写入命令（直接发送并追加回车以执行，绝不搞预先空回车）
      await appManager.dispatch(termApp.id, "write", {
        data: fullCommand + "\r"
      })

      // 等待输出稳定：未产生输出前允许充分等待至 waitSec（硬上限）；一旦产生输出，连续静默 2.5 秒则提前返回（100% 对齐 terminalSet）
      await new Promise((res) => {
        let tSilence = null
        let tMax = null
        let disposer = null

        const done = () => {
          if (tSilence) clearTimeout(tSilence)
          if (tMax) clearTimeout(tMax)
          if (disposer) disposer.dispose()
          res()
        }

        if (!session?.shell) return res()

        // 硬上限：到达 waitSec 秒时强制结束并读取已有结果
        tMax = setTimeout(done, waitSec * 1000)

        // 数据流监听：只有当命令真正开始吐出数据时，才启动静默 2.5 秒提前返回的倒计时
        disposer = session.shell.onData(() => {
          if (tSilence) clearTimeout(tSilence)
          tSilence = setTimeout(done, 2500)
        })
      })

      // 纯净增量切片：仅截取本次命令发出后的增量输出
      const rawDelta = session?.content ? session.content.slice(startOffset) : ""
      const deltaClean = terminalBackend.cleanTerminalContent(rawDelta)

      // 计算起始行号：确保与 terminalGet 的绝对行号完美对齐
      const prevContent = session?.content ? session.content.slice(0, startOffset) : ""
      const startLineNum = prevContent ? terminalBackend.cleanTerminalContent(prevContent).split(/\r?\n/).length : 1

      // 给增量流的每一行注水打上行号
      const deltaLines = deltaClean.split(/\r?\n/)
      const totalDeltaLines = deltaLines.length
      const numberedDelta = deltaLines.map((line, i) => `${startLineNum + i}: ${line}`).join("\n")

      // 末端优先安全截断保护（Tail-First，100% 对齐 terminalSet）
      const MAX_CHARS = 15000
      let output = ""

      if (numberedDelta.length > MAX_CHARS) {
        const targetHeadCharLimit = Math.min(numberedDelta.length, Math.max(fullCommand.length + 150, 400))
        let headBreakIdx = numberedDelta.indexOf("\n", targetHeadCharLimit)
        if (headBreakIdx === -1) headBreakIdx = targetHeadCharLimit

        const cmdHeader = numberedDelta.slice(0, headBreakIdx + 1)
        const tailOutput = numberedDelta.slice(-MAX_CHARS)

        const truncatedChars = numberedDelta.length - cmdHeader.length - tailOutput.length

        if (truncatedChars > 0) {
          output = `${cmdHeader}
⚠️ 【系统截断通知】：
本次输出总计 ${totalDeltaLines} 行，带行号后总字数 ${numberedDelta.length}，超单次安全上限。
已提取上方命令回显头部，切除中间约 ${truncatedChars} 字符，仅保留最新末尾 ${MAX_CHARS} 字符（下方内容）。
查阅被省略的中间日志请结合上方和下方的行号边界，使用 terminalGet 工具精准查询。
--------------------------------------------------
${tailOutput}`
        } else {
          output = numberedDelta
        }
      } else {
        output = numberedDelta
      }

      let outputBody = ""
      if (output) {
        const lineNumberNotice = `【提示】以下输出已附加"<行号>: "前缀，提取内容时请自行剔除。\n---\n`
        outputBody = `${lineNumberNotice}<terminal>\n${output}\n</terminal>`
      } else {
        outputBody = "(执行完毕，无输出)"
      }

      const systemNotice = `\n\n【系统通知】：本次命令运行在终端(appId: ${termApp.id})中。若需维持会话状态继续执行，下次调用请指定此 appId。`
      const finalReturn = commentPrefix + outputBody + systemNotice
      console.log("【terminalVmSet return】", finalReturn)
      return finalReturn

    } finally {
      await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId: null, deferredFns: null })
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().allow("-1").required().description("必填，微虚拟终端 appId。使用terminalGet查询可复用虚拟终端，输入-1为新建"),
      commands: Joi.array().items(
        Joi.object({
          bin: Joi.string().required().description("主命令/可执行文件名，如cd,ls,cat,cargo,npm等Linux命令"),
          args: Joi.array().items(Joi.string().allow("")).default([]).description("该命令的参数数组，如 ['-la']。注意：凡含空格或特殊控制字符(&, |, ;, $, 反引号等)的参数，必须显式加单引号包裹，否则会被安全拦截打回；纯重定向符号(>, >>, 2>, 2>>, <, <<, <<<, &>, &>>, 2>&1 等)作为独立参数时可免引号裸传"),
          op: Joi.string().valid("&&", "||", "|", "|&", ";", "&").allow("", null).description("连接到下一个命令的连接符，最后一项不填"),
          desc: Joi.string().required().description("必填，该命令的具体作用说明")
        })
      ).min(1).required().description("必填，结构化终端命令流水线数组（用于生成审查表格并在后台拼接命令）"),
      waitSec: Joi.number().default(10).description("最大等待秒数，默认10（产生输出后静默2.5秒会提前返回）"),
      minimized: Joi.boolean().default(true).description("是否以最小化窗口运行"),
      force: Joi.boolean().default(false).description("强制发送开关：当目标终端正在运行前台程序（如SSH会话/Vim/开发服务器等）或处于未闭合语法等待状态时，设置为 true 可强制写入命令（注意：可能干扰正在运行的程序，请谨慎使用）")
    })
  },

  getDoc() {
    return `
      向终端app的虚拟机的Linux系统内写入并执行免管理员审核和确认的命令，本工具基于ssh，本工具基于ssh连接
      系统会检测输出静默（产生输出后静默2.5秒）自动返回结果。输出不全可使用 terminalGet 工具翻页。
      【若系统未安装和配置虚拟机】需要管理员确认后你协助编译安装，系统会提示你操作
      【若已经安装配置】首次启动需要等待较长时间，请观察返回输出，耐心等待
      【若故障了】请告知管理员并考虑使用terminalSet
      若需在管理员真实操作系统执行命令，请改用 terminalSet 工具
      工作目录已通过 Virtio-9P 自动与宿主机项目双向直通挂载在 /mnt/<项目名> 下。

      【警告】微虚拟机为标准 Linux 环境，请使用标准 POSIX/Linux 命令（如 cd, ls, cat, npm, cargo 等），严禁使用 Windows 专有命令！
      【🚨 严重警告：目录丢失陷阱】
      因底层环境限制，系统可能无法实时感知终端当前路径的变化。为了确保命令执行在正确的目录，
      请务必在涉及到特定工作目录的命令流水线最前面，主动加上 cd 命令进行切换。

      调用范例[Linux 微虚拟机]：
      {
        commands: [
          { bin: "cd", args: ["'/mnt/项目名'"], op: "&&", desc: "切换到目标工作目录" },
          { bin: "ls", args: ["'-la'"], op: "&&", desc: "查看目录" },
          { bin: "npm", args: ["'test'"], desc: "运行测试套件" }
        ]
      }

      【增量输出与截断算法说明】
      1. 增量捕获：执行前记录 offset（动态回溯至上一个换行符），静默结束后仅截取 session.content.slice(offset) 并去除 ANSI 控制符，原汁原味返回本次命令及结果。
      2. 截断算法：若增量字符数 > 15000，提取开头命令回显部分，强制切除中间多余字符，并从末尾倒推保留最多 15000 字符，确保无超大单行穿透。
      3. 回显免责：终端回显可能受 PTY 自动折行与 ANSI 擦写影响，命令以你发送的 commands 参数为准。中间省略行可用 terminalGet 按行号区间查询。
    `
  }
}
