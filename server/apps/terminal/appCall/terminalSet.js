import Joi from "joi"
import appManager from "../../appManager.js"
import waitConfirm from "../../../tools/waitConfirm.js"
import terminalBackend from "../backend.js"
import pathLib from "path"
import workDirTool from "../../../tools/workDirTool.js"

export default {
  name: "执行终端命令",
  id: "terminalSet",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    let { appId, waitSec, commands, minimized } = value

    // 强制安全校验 1：多命令流水线中，除了最后一条，前面的子命令必须提供有效的连接符 op
    for (let i = 0; i < commands.length - 1; i++) {
      if (!commands[i].op) {
        return `参数错误：在多命令流水线中，除最后一条命令外，前面的每一条子命令（例如第 ${i + 1} 条的 \`${commands[i].bin}\`）都必须显式提供连接符 'op' (如 '&&', ';', '|', '||' 等)，否则会导致危险的无连接符黏连执行！`
      }
    }

    // 强制安全校验 2：检测未被引号包裹的敏感特殊字符与空格（防止命令注入与语法混淆）
    const dangerousPattern = /[ \t\n\r&|;`$<>(){}!]/
    // 纯重定向 token 白名单：当参数整体就是重定向符号（如 >、>>、2>&1、<<< 等）时，
    // 属于合法的 IO 重定向语义而非命令注入向量，允许免引号裸传（执行前仍有 waitConfirm 确认弹窗兜底）
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

    // 结构化流水线拼接算法（已通过严格安全校验，直接原生拼接）
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

    const escapeHtml = (str) => String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")

    // 自动为子命令生成统一的结构化 HTML 审查表格（args 渲染为独立子表格）
    const tableRows = commands.map((c, i) => {
      let argsCellHtml = '<span style="opacity:0.5; font-style:italic;">(无参数)</span>'
      if (c.args && c.args.length > 0) {
        const subRows = c.args.map((a, argIdx) => {
          const val = a === "" || a == null ? "''" : a
          return `<tr><td style="width:22px; text-align:center; opacity:0.6; padding:2px 4px; border:1px solid rgba(128,128,128,0.2); font-size:11px;">${argIdx + 1}</td><td style="padding:2px 6px; border:1px solid rgba(128,128,128,0.2); font-family:monospace;"><code>${escapeHtml(val)}</code></td></tr>`
        }).join("")
        argsCellHtml = `<table style="width:100%; border-collapse:collapse; margin:0; background:transparent;"><tbody>${subRows}</tbody></table>`
      }

      const opStr = (c.op && i < commands.length - 1)
        ? `<code>${escapeHtml(c.op)}</code>`
        : '<span style="opacity:0.6; font-style:italic;">(结束)</span>'

      return `<tr>
        <td style="padding:8px; vertical-align:top; border:1px solid rgba(128,128,128,0.2); font-family:monospace;"><code>${escapeHtml(c.bin)}</code></td>
        <td style="padding:8px; vertical-align:top; border:1px solid rgba(128,128,128,0.2);">${argsCellHtml}</td>
        <td style="padding:8px; vertical-align:top; border:1px solid rgba(128,128,128,0.2);">${escapeHtml(c.desc)}</td>
        <td style="padding:8px; vertical-align:top; text-align:center; border:1px solid rgba(128,128,128,0.2);">${opStr}</td>
      </tr>`
    }).join("")

    const autoMarkdownTable = `<table style="width:100%; border-collapse:collapse; text-align:left; margin:8px 0;">
      <thead>
        <tr style="background:rgba(128,128,128,0.1);">
          <th style="padding:8px; border:1px solid rgba(128,128,128,0.2);">命令 (bin)</th>
          <th style="padding:8px; border:1px solid rgba(128,128,128,0.2);">参数列表 (args)</th>
          <th style="padding:8px; border:1px solid rgba(128,128,128,0.2);">说明 (desc)</th>
          <th style="padding:8px; text-align:center; border:1px solid rgba(128,128,128,0.2);">连接符 (op)</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>`

    const currentListId = metaData?.listId
    if (typeof currentListId !== "number") {
      throw new Error(`[terminalSet] 系统错误：metaData 中缺少必需的 listId 参数 (当前值为: ${currentListId})`)
    }
    const toolCallGroupId = metaData?.toolCallGroupId
    const deferredFns = metaData?.deferredFns

    // 计算目标运行目录 targetCwd（终端统一使用主队列 0 的主工作目录，无则默认 aiWork）
    const mainWorkDir = workDirTool.getMainWorkDir(0)
    const defaultCwd = pathLib.resolve(process.cwd(), "..", "aiWork")
    let targetCwd = mainWorkDir || defaultCwd

    const findIdleTerm = async () => {
      for (const a of appManager.apps.values()) {
        if (a.type !== "terminal" || (a.data.listId !== currentListId && a.data.listId !== undefined)) continue
        const session = terminalBackend.getSession(a.id)
        if (!session) continue
        const noToolLock = !session.toolCallGroupId
        const isPhysicallyIdle = (Date.now() - (session.lastOutputTime || 0)) > 2000
        if (!noToolLock || !isPhysicallyIdle) continue

        // 核心保护：如果终端有正在运行的前台/后台子进程（如服务、Vim等），绝对不可复用！
        const procRes = await appManager.dispatch(a.id, "checkRunningProcess")
        if (procRes?.hasRunningProcess) continue

        // 核心保护：如果处于 dquote> 等未闭合的语法挂起状态，不作为空闲终端复用
        const lastLine = (terminalBackend.cleanTerminalContent(session.content || "")).trim().split("\n").pop() || ""
        if (/\b(dquote|quote|bquote|cmdand|cmdor|pipe|heredoc|subsh|cursh)>\s*$/.test(lastLine)) continue

        return a
      }
      return null
    }

    // 终端模式描述：供确认弹窗明示「新建终端」还是「复用终端(appid)」
    let termModeDesc = ""
    if (appId === "-1") {
      // 强制新建模式，使用当前 mainWorkDir 或 defaultCwd，不探测复用目录
      termModeDesc = "将新建终端"
    } else if (!appId) {
      // 智能复用模式下，探测是否有属于当前会话的真·空闲终端以计算 targetCwd
      const idleTerm = await findIdleTerm()
      if (idleTerm) {
        targetCwd = idleTerm.data.cwd || defaultCwd
        termModeDesc = `将复用空闲终端 (${idleTerm.id})`
      } else {
        termModeDesc = "将新建终端（无空闲可复用）"
      }
    } else {
      // 指定 appId 模式
      const targetApp = appManager.get(appId)
      if (targetApp) {
        const session = terminalBackend.getSession(targetApp.id)
        targetCwd = session?.cwd || targetApp.data.cwd || defaultCwd
        termModeDesc = `将复用终端 (${appId})`
      } else {
        termModeDesc = `指定终端不存在 (${appId})`
      }
    }

    const userConfirm = await waitConfirm({
      type: "text",
      content: fullCommand,
      argsDesc: autoMarkdownTable,
      title: `是否执行命令？【${termModeDesc}】(运行路径: ${targetCwd})`,
      listId: currentListId
    })

    if (!userConfirm.ok) {
      return `用户主动拒绝执行命令。备注：${userConfirm.comment || "无"}`
    }

    let termApp = null

    if (appId === "-1") {
      // 强制新建终端
      const launchRes = await appManager.launch("terminal", {
        data: {
          window: { minimized },
          cwd: mainWorkDir,
          listId: currentListId,
          toolCallGroupId,
          deferredFns
        }
      })
      if (!launchRes?.ok) return `启动终端失败: ${launchRes?.msg || "未知错误"}`
      termApp = launchRes.app
      await new Promise(res => setTimeout(res, 1000))
    } else if (!appId) {
      // 智能复用真·空闲终端
      const idleTerm = await findIdleTerm()

      if (idleTerm) {
        termApp = idleTerm
        // 更新工具上下文并锁定独占
        await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId, deferredFns })
      } else {
        // 无可用空闲终端，自动新建终端
        const launchRes = await appManager.launch("terminal", {
          data: {
            window: { minimized },
            cwd: mainWorkDir,
            listId: currentListId,
            toolCallGroupId,
            deferredFns
          }
        })
        if (!launchRes?.ok) return `启动终端失败: ${launchRes?.msg || "未知错误"}`
        termApp = launchRes.app
        await new Promise(res => setTimeout(res, 1000))
      }
    } else {
      // 指定 appId 模式
      termApp = appManager.get(appId)
      if (!termApp) return `未找到 appId 为 ${appId} 的终端`
      // 只能操作属于自己列表 of 终端
      if (termApp.data.listId !== currentListId) {
        return "权限不足：该终端不属于当前智能体会话列表。"
      }

      // 显式指定终端的运行状态拦截保护
      const procRes = await appManager.dispatch(termApp.id, "checkRunningProcess")
      if (procRes?.hasRunningProcess) {
        return `无法执行：目标终端 (appId="${termApp.id}") 当前正在运行前台程序或服务进程（如开发服务器/Vim/交互环境等）。\n为保护服务不被中断，已阻止直接输入。\n如需在新终端中执行命令，请传入 appId="-1"；如确实需要向当前运行中的程序发送输入/控制指令，请确认后再操作。`
      }

      const session = terminalBackend.getSession(termApp.id)
      const lastLine = (terminalBackend.cleanTerminalContent(session?.content || "")).trim().split("\n").pop() || ""
      const suspendedMatch = lastLine.match(/\b(dquote|quote|bquote|cmdand|cmdor|pipe|heredoc|subsh|cursh)>\s*$/)
      if (suspendedMatch) {
        return `无法执行：目标终端 (appId="${termApp.id}") 当前处于未闭合的语法等待状态 (\`${suspendedMatch[0]}\`，例如未闭合的引号或多行输入)。\n终端当前末行输出为:\n\`${lastLine}\`\n请根据情况决策：如需取消当前未完成的输入并重置提示符，可向该终端发送 Ctrl+C (如传入 command: "\\x03")；如需在全新终端中执行，请传入 appId="-1"。`
      }

      // 更新工具上下文
      await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId, deferredFns })
    }

    // --- 新增保护：无论后续读写或网络发生什么异常，确保释放被锁定的终端 ---
    try {
      // 广播 app:active 聚焦/打开终端窗口（仅非静默模式）
      if (appManager.io && !minimized) {
        appManager.io.emit("app:active", { appId: termApp.id })
      }

      // 写入命令（已废弃 Bracketed Paste，改用涓流写入，因此必须追加回车符以执行）
      await appManager.dispatch(termApp.id, "write", {
        data: fullCommand + "\r"
      })

      // 等待输出稳定：未产生输出前允许充分等待至 waitSec（硬上限）；一旦产生输出，连续静默 2.5 秒则提前返回
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

        const session = terminalBackend.getSession(termApp.id)
        if (!session?.shell) return res()

        // 硬上限：到达 waitSec 秒时强制结束并读取已有结果
        tMax = setTimeout(done, waitSec * 1000)

        // 数据流监听：只有当命令真正开始吐出数据时，才启动静默 2.5 秒提前返回的倒计时
        disposer = session.shell.onData(() => {
          if (tSilence) clearTimeout(tSilence)
          tSilence = setTimeout(done, 2500)
        })
      })

      // 读取最新输出（默认放宽至 100 行）
      const contentRes = await appManager.dispatch(termApp.id, "getContent", { limit: 100 })
      const rawContent = contentRes?.data?.content || ""
      const totalLines = contentRes?.data?.totalLines || 0
      const isTruncated = contentRes?.data?.isTruncated ?? false

      // 加上行号，格式与 terminalGet 一致
      const lines = rawContent ? rawContent.split("\n") : []
      const startLine = Math.max(1, totalLines - lines.length + 1)
      const numberedContent = lines.map((line, i) => `${startLine + i}: ${line}`).join("\n")

      const commentSuffix = userConfirm.comment ? `。用户备注：${userConfirm.comment}` : ""
      const pagePrompt = isTruncated
        ? `\n⚠️ 终端输出共 ${totalLines} 行，当前仅显示第 ${startLine} ~ ${totalLines} 行。可使用 terminalGet 工具传入 appId="${termApp.id}" 配合 endLine=${startLine - 1}（或指定 startLine, endLine）向上翻页查看更早被截断的历史输出。`
        : ""

      const displayCmd = fullCommand.length > 300
        ? fullCommand.slice(0, 300) + ` ... (指令过长，共 ${fullCommand.length} 字符，已截断显示)`
        : fullCommand

      let returnStr = `已发送执行指令：\`${displayCmd}\`\n静默检测后(最大${waitSec}s)的终端输出如下：\n<terminal>\n${numberedContent || "(无输出)"}\n</terminal>${pagePrompt}${commentSuffix}`
      console.log("【returnStr】", returnStr)
      return returnStr

    } finally {
      // 绝对清理工具上下文，防止死锁
      await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId: null, deferredFns: null })
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().allow("-1", "").description("终端 appId。值为 '-1' 则强制完全新建终端；留空则优先智能复用空闲终端，找不到空闲终端才新建。"),
      // command: Joi.string().description("执行命令（已废弃，由 commands 替代）"),
      commands: Joi.array().items(
        Joi.object({
          bin: Joi.string().required().description("主命令/可执行文件名，如cd,ls(Mac/Linux),dir(Windows)等"),
          args: Joi.array().items(Joi.string().allow("")).default([]).description("该命令的参数数组，如 ['-la'] 或 Windows 下的 ['/A']。注意：凡含空格或特殊控制字符(&, |, ;, $, 反引号等)的参数，必须显式加单引号包裹，否则会被安全拦截打回；纯重定向符号(>, >>, 2>, 2>>, <, <<, <<<, &>, &>>, 2>&1 等)作为独立参数时可免引号裸传"),
          op: Joi.string().valid("&&", "||", "|", "|&", ";", "&").allow("", null).description("连接到下一个命令的连接符，最后一项不填"),
          desc: Joi.string().required().description("必填，该命令的具体作用说明")
        })
      ).min(1).required().description("必填，结构化终端命令流水线数组（用于生成审查表格并在后台拼接命令）"),
      waitSec: Joi.number().default(10).description("最大等待秒数，默认10（产生输出后静默2.5秒会提前返回）"),
      minimized: Joi.boolean().default(false).description("是否以最小化窗口运行")
    })
  },

  getDoc() {
    return `
      向指定终端 App 写入并执行命令。
      系统会检测输出静默（产生输出后静默2.5秒）自动返回结果。
      waitSec为最大等待时间硬上限，防止长时间阻塞。
      【警告】执行前务必确认当前系统(Mac/Win)，使用对应的系统终端命令和路径格式！
      
      调用范例[Mac/Linux]：
      {
        commands: [
          { bin: "ls", args: ["'-la'", "'/Users/xxx/project'"], op: "&&", desc: "查看目录" },
          { bin: "cat", args: ["'package.json'"], desc: "查看配置" }
        ]
      }
      调用范例[Windows]：
      {
        commands: [
          { bin: "dir", args: ["'/A'", "'C:\\\\Users\\\\xxx\\\\project'"], op: "&&", desc: "查看目录" },
          { bin: "type", args: ["'package.json'"], desc: "查看配置" }
        ]
      }
      使用 terminalGet 工具翻页
    `
  }
}
