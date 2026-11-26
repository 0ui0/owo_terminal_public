import { spawn } from "@homebridge/node-pty-prebuilt-multiarch"
import pathLib from "path"
import stripAnsi from "strip-ansi"
import { exec } from "child_process"
import util from "util"
import options from "../../config/options.js"
import idTool from "../../tools/idTool.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import comData from "../../comData/comData.js"
import workDirTool from "../../tools/workDirTool.js"
import { trs } from "../../tools/i18n.js"
import { createVirtualShell } from "./virtualPty.js"
import qemuManager from "../../tools/vm/qemuManager.js"

const execAsync = util.promisify(exec)

// 所有终端 session 的全局注册表，key 为 appId，值为 session 对象
// 注意：这不是 app.data，因为 app.data 会被序列化，而 shell 进程句柄不可序列化
const sessions = new Map()

async function createShell(cwd) {
  const global_terminalShell = await options.get("global_terminalShell")
  let shellChoice = ""
  if (process.platform === "win32") {
    shellChoice = global_terminalShell.win
  } else if (process.platform === "darwin") {
    shellChoice = global_terminalShell.mac
  } else {
    shellChoice = global_terminalShell.linux
  }
  if (!shellChoice?.trim()) {
    shellChoice = process.platform === "win32" ? "powershell.exe" : "bash"
  }
  const args = []
  if (process.platform === "darwin" || process.platform === "linux") {
    args.push("-l")
  }
  return spawn(shellChoice, args, {
    name: "xterm-256color",
    env: {
      LANG: "zh_CN.UTF-8",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      CLICOLOR: "1",
      ...process.env
    },
    cwd: cwd ?? pathLib.resolve(process.cwd(), "..", "aiWork")
  })
}

function decodeLsofPath(rawPath) {
  if (!rawPath || !rawPath.includes("\\x")) return rawPath
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

async function checkCwd(app, shell, io) {
  const session = sessions.get(app.id)
  if (!session) return
  if (session.cwdCheckTimer) clearTimeout(session.cwdCheckTimer)
  session.cwdCheckTimer = setTimeout(async () => {
    try {
      if (process.platform === "win32") return
      const { stdout } = await execAsync(`lsof -a -p ${shell.pid} -d cwd -F n`)
      const pathLine = stdout.split("\n").find(l => l.startsWith("n"))
      if (pathLine) {
        const newCwd = decodeLsofPath(pathLine.substring(1))
        if (newCwd !== session.cwd) {
          session.cwd = newCwd
          app.data.cwd = newCwd
          io.emit("app:dispatch", { appId: app.id, action: "cwd", args: { cwd: newCwd } })
        }
      }
    } catch (e) {
      // lsof may fail if process is gone
    }
  }, 800)
}

function cleanTerminalContent(str) {
  str = str || ""
  // 清理 Bracketed Paste 遗留的不可见字符，防止其污染 AI 视口
  str = str.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "")
  str = stripAnsi(str)
  // ============================================================
  // [2026-08-20] 简化：只过滤颜色码（stripAnsi），其余全量返回。
  // 原 \r 覆盖拼接逻辑会把超长命令折行处的两段文本强行拼接，
  // 导致提示符丢失、路径碎片错乱（该问题已于 2026-08-20 调查修复），
  // 已行注释保留，便于还原。\x08 退格处理逻辑正常，予以保留。
  // ============================================================
  /*
  let lines = str.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    let parts = lines[i].split('\r')
    let finalLine = parts[0]
    for (let j = 1; j < parts.length; j++) {
      let overwrite = parts[j]
      if (overwrite.length >= finalLine.length) {
        finalLine = overwrite
      } else {
        finalLine = overwrite + finalLine.substring(overwrite.length)
      }
    }
    lines[i] = finalLine
  }
  let flattened = lines.join('\n')
  */
  let flattened = str

  while (/\b/.test(flattened)) {
    let prev = flattened
    flattened = flattened.replace(/[^\x08]\x08/g, '')
    flattened = flattened.replace(/^\x08+/g, '')
    flattened = flattened.replace(/\n\x08+/g, '\n')
    if (prev === flattened) break
  }
  return flattened
}

export default {
  cleanTerminalContent,
  async beforeLaunch(app, appManager) {
    if (app.data?.mode === "vm") {
      // 1. 初始化微虚拟机运行环境框架
      const initialized = await qemuManager.isInitialized()
      if (!initialized) {
        await qemuManager.init()
      }

      // 2. 检查引擎与镜像是否就绪
      const isBinReady = qemuManager.isQemuBinReady()
      const isImageReady = qemuManager.isQemuImageReady()
      if (!isBinReady || !isImageReady) {
        console.log(`[Terminal Backend] 微虚拟机组件未就绪 (bin:${isBinReady}, img:${isImageReady})，通知前端引导下载 (${app.id})...`)
        if (appManager.io) {
          appManager.io.emit("terminal:requireVmSetup", { isBinReady, isImageReady })
        }
        throw new Error("VM_SETUP_REQUIRED")
      }
    }
  },
  async init(app, manager) {
    app.data.content = app.data.content || ""
    app.data.cwd = app.data.cwd || workDirTool.getMainWorkDir(0) || pathLib.resolve(process.cwd(), "..", "aiWork")
    app.data.initialCwd = app.data.initialCwd || app.data.cwd
    app.data.listId = app.data.listId || 0
    app.data.mode = app.data.mode || "host"

    const isVm = app.data.mode === "vm"
    const io = manager.io

    const emitStreamChunk = (chunkText) => {
      io.emit("app:dispatch", {
        appId: app.id,
        action: "stream",
        args: { content: chunkText }
      })
    }

    let shell = null

    if (isVm) {
      shell = createVirtualShell({
        appId: app.id,
        getWorkspaceDir: () => app.data.cwd,
        io: manager.io
      })
    } else {
      shell = await createShell(app.data.cwd)
    }

    const session = {
      shell,
      isVirtual: isVm,
      content: app.data.content,
      cwd: app.data.cwd,
      initialCwd: app.data.initialCwd,
      listId: app.data.listId,
      toolCallGroupId: app.data.toolCallGroupId || null,
      deferredFns: app.data.deferredFns || null,
      editThrottleTimer: null,
      cwdCheckTimer: null
    }
    sessions.set(app.id, session)

    let pendingStreamOutput = ""
    let streamThrottleTimer = null

    shell.onData(async (data) => {
      session.lastOutputTime = Date.now()
      const output = String(data)
      // DEBUG: hex dump 追踪退格符来源
      const hex = Buffer.from(data).toString("hex").match(/.{1,2}/g).join(" ")
      session.content += output
      app.data.content = session.content

      // 向前端推送流式数据（16ms 帧对齐微任务聚合，消除 Socket 泛洪）
      pendingStreamOutput += output
      if (!streamThrottleTimer) {
        streamThrottleTimer = setTimeout(() => {
          streamThrottleTimer = null
          if (pendingStreamOutput) {
            io.emit("app:dispatch", {
              appId: app.id,
              action: "stream",
              args: { content: pendingStreamOutput }
            })
            pendingStreamOutput = ""
          }
        }, 16)
      }

      // 节流 comData 广播
      if (!session.editThrottleTimer) {
        session.editThrottleTimer = setTimeout(() => {
          session.editThrottleTimer = null
          comData.data.edit(() => { })
        }, 100)
      }

      // 终端数据原本通过 updateAsk 实时同步到 AI 上下文，但这会导致高频的上下文开销
      // 现已将其注释禁用，AI 获取终端内容统一使用 terminalGet/terminalSet
      /*
      const updateAsk = (model) => {
        let ask = model.asks.find(a => a.tid === app.id)
        if (ask) {
          ask.content += stripAnsi(output)
          ask.content = ask.content.split(/\r?\n/).slice(-20).join("\n")
        } else {
          const runAddAsk = () => model.addAsk("终端", "user",
            "摘要终端最新20条的最后1000字<terminal>" +
            stripAnsi(output.split(/\r?\n/).slice(-20).join("\n").slice(-1000)) +
            "</terminal>",
            { id: idTool.get("t"), tid: app.id, title: "终端输出摘要" }
          )
          if (session.deferredFns) {
            session.deferredFns.push(async () => runAddAsk())
          } else {
            runAddAsk()
          }
        }
      }

      if (session.listId > 0) {
        const agent = subAgents.get(session.listId)
        if (agent) updateAsk(agent)
      } else {
        aiBasic.list.forEach(updateAsk)
      }
      */

      await checkCwd(app, shell, io)
    })

    shell.onExit(() => {
      if (streamThrottleTimer) {
        clearTimeout(streamThrottleTimer)
        streamThrottleTimer = null
        if (pendingStreamOutput) {
          io.emit("app:dispatch", {
            appId: app.id,
            action: "stream",
            args: { content: pendingStreamOutput }
          })
          pendingStreamOutput = ""
        }
      }
      io.emit("app:dispatch", { appId: app.id, action: "exit", args: {} })
    })
  },

  destroy(app, manager) {
    const session = sessions.get(app.id)
    if (session) {
      if (session.editThrottleTimer) clearTimeout(session.editThrottleTimer)
      if (session.cwdCheckTimer) clearTimeout(session.cwdCheckTimer)
      try { session.shell.kill() } catch (e) { }
      sessions.delete(app.id)
    }
  },

  async dispatch({ app, action, args, appManager, io }) {
    const session = sessions.get(app.id)

    switch (action) {
      case "syncHostCwd": {
        if (!session || !session.shell) {
          return {
            ok: false,
            msg: trs("终端/错误/会话不存在", {
              cn: "终端 session 不存在或底层进程已断开",
              en: "Terminal session does not exist or shell is disconnected"
            })
          }
        }
        const targetCwd = args?.targetCwd
        if (!targetCwd) {
          return {
            ok: false,
            msg: trs("终端/错误/路径无效", {
              cn: "未指定目标工作目录",
              en: "Target directory not specified"
            })
          }
        }
        session.shell.write(`cd '${targetCwd}'\n`)
        session.cwd = targetCwd
        app.data.initialCwd = targetCwd
        app.data.cwd = targetCwd
        return {
          ok: true,
          msg: trs("终端/提示/物理目录已同步", {
            cn: "已同步切换至新工作目录",
            en: "Switched to new working directory"
          }),
          data: { initialCwd: targetCwd }
        }
      }

      case "remountVmWorkspace": {
        const workspaceDir = args?.workspaceDir
        if (!workspaceDir) {
          return {
            ok: false,
            msg: trs("终端/错误/路径无效", {
              cn: "未指定目标工作目录",
              en: "Target directory not specified"
            })
          }
        }
        const dirName = pathLib.basename(workspaceDir)
        io.emit("app:dispatch", {
          appId: app.id,
          action: "stream",
          args: { content: "\r\n>>> [owo-vm] 收到工作目录重挂载指令，正在重启微虚拟机...\r\n" }
        })

        const restartRes = await qemuManager.restart({ workspaceDir })
        if (!restartRes.ok) {
          return {
            ok: false,
            msg: trs("终端/错误/虚机重启失败", {
              cn: `微虚拟机重启失败: ${restartRes.msg}`,
              en: `MicroVM restart failed: ${restartRes.msg}`
            })
          }
        }

        if (session) {
          session.cwd = workspaceDir
        }
        app.data.initialCwd = workspaceDir
        app.data.cwd = workspaceDir

        return {
          ok: true,
          msg: trs("终端/提示/虚机已重挂载", {
            cn: "微虚拟机已重新挂载新工作目录并重启",
            en: "MicroVM remounted and restarted"
          }),
          data: { initialCwd: workspaceDir, dirName }
        }
      }

      case "write": {
        if (!session) {
          return {
            ok: false,
            msg: trs("终端/错误/会话不存在", {
              cn: "终端 session 不存在",
              en: "Terminal session does not exist"
            })
          }
        }
        let data = args.data || ""
        if (args.bracketed && !data.startsWith("\x1b[200~")) {
          data = `\x1b[200~${data}\x1b[201~\r`
        }
        const CHUNK_SIZE = 64
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          session.shell.write(data.slice(i, i + CHUNK_SIZE))
          if (i + CHUNK_SIZE < data.length) {
            await new Promise(r => setTimeout(r, 15))
          }
        }
        return {
          ok: true,
          msg: trs("终端/提示/写入成功", {
            cn: "写入成功",
            en: "Written successfully"
          })
        }
      }

      case "resize": {
        if (!session) {
          return {
            ok: false,
            msg: trs("终端/错误/会话不存在", {
              cn: "终端 session 不存在",
              en: "Terminal session does not exist"
            })
          }
        }
        try {
          session.shell.resize(args.cols || 80, args.rows || 24)
        } catch (e) { }
        return {
          ok: true,
          msg: trs("终端/提示/调整尺寸成功", {
            cn: "resize 成功",
            en: "Resize successful"
          })
        }
      }

      case "checkRunningProcess": {
        if (!session?.shell?.pid || session?.shell?.pid === "vm_guest") return { ok: true, hasRunningProcess: false }
        try {
          if (process.platform === "win32") {
            try {
              const psCmd = `Get-CimInstance Win32_Process -Filter "ParentProcessId=${session.shell.pid} and Name != 'conhost.exe'" | Select-Object -ExpandProperty ProcessId`
              const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCmd}"`)
              const pids = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(l => /^\d+$/.test(l))
              return { ok: true, hasRunningProcess: pids.length > 0 }
            } catch (e) {
              console.log("win终端复用检测失败1", e)
              // 优雅降级：如果遇到老系统不支持 Get-CimInstance 或者其他异常，回退使用原版的 wmic
              const { stdout } = await execAsync(`wmic process where ParentProcessId=${session.shell.pid} get ProcessId`)
              const pids = stdout.trim().split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l))
              return { ok: true, hasRunningProcess: pids.length > 0 }
            }
          } else {
            // 获取所有直接子进程 PID
            const { stdout: pgrepOut } = await execAsync(`pgrep -P ${session.shell.pid}`)
            const pids = pgrepOut.trim().split("\n").map(p => p.trim()).filter(Boolean)
            if (pids.length === 0) return { ok: true, hasRunningProcess: false }

            // 精准检查子进程的 TTY 状态与命令名，排除 gitstatusd 等后台常驻插件
            const { stdout: psOut } = await execAsync(`ps -o stat=,comm= -p ${pids.join(",")}`)
            const lines = psOut.trim().split("\n").map(l => l.trim()).filter(Boolean)

            // 在 Unix/macOS 下，stat 包含 '+'（如 S+、R+、I+）表示该子进程处于前台进程组并独占 TTY 控制权
            const hasForegroundProc = lines.some(line => {
              const parts = line.split(/\s+/)
              const stat = parts[0] || ""
              const comm = parts.slice(1).join(" ")
              // 忽略已知的良性后台辅助插件守护进程
              if (comm && /gitstatusd|async|zsh-async/i.test(comm)) return false
              return stat.includes("+")
            })

            return { ok: true, hasRunningProcess: hasForegroundProc }
          }
        } catch (e) {
          console.log("win终端复用检测失败2", e)
          // pgrep/ps 退出码非0表示未匹配到子进程
          return { ok: true, hasRunningProcess: false }
        }
      }

      // 供 appCall 通过官方 dispatch 路由取用 session 本体（含 shell 句柄与实时 content）
      // 返回值仅在同一进程的内存中传递，不经过任何序列化，绝不面向 socket 下发
      case "getSession": {
        return {
          ok: true,
          msg: trs("通用/提示/获取成功", {
            cn: "获取成功",
            en: "Retrieved successfully"
          }),
          data: session
        }
      }

      case "getContent": {
        if (!session) {
          return {
            ok: false,
            msg: trs("终端/错误/会话不存在", {
              cn: "终端 session 不存在",
              en: "Terminal session does not exist"
            })
          }
        }
        const limit = args.limit || 20
        let targetContent = args.raw ? session.content : cleanTerminalContent(session.content)
        const allLines = targetContent.split(/\r?\n/)
        const totalLines = allLines.length
        const content = allLines.slice(-limit).join("\n")
        const isTruncated = totalLines > limit
        return {
          ok: true,
          msg: trs("通用/提示/获取成功", {
            cn: "获取成功",
            en: "Retrieved successfully"
          }),
          data: {
            appId: app.id,
            content,
            cwd: session.cwd,
            totalLines,
            isTruncated
          }
        }
      }

      case "open": {
        return {
          ok: true,
          msg: trs("终端/提示/已激活", {
            cn: "终端已激活",
            en: "Terminal activated"
          })
        }
      }

      case "setToolContext": {
        if (session) {
          session.toolCallGroupId = args.toolCallGroupId || null
          session.deferredFns = args.deferredFns || null
        }
        return {
          ok: true,
          msg: trs("终端/提示/工具上下文已更新", {
            cn: "已更新工具上下文",
            en: "Tool context updated"
          })
        }
      }

      case "getVmStatus": {
        const vmStatus = qemuManager.getStatus()
        return { ok: true, msg: "获取成功", data: vmStatus }
      }

      case "startVm": {
        const res = await qemuManager.start({ workspaceDir: session?.cwd })
        return res
      }

      case "stopVm": {
        const res = await qemuManager.stop()
        return res
      }

      case "restartVm": {
        const res = await qemuManager.restart({ workspaceDir: session?.cwd })
        return res
      }

      case "resetVm":
      case "restoreVmImage": {
        const res = await qemuManager.downloadAsset("image", { io })
        return res
      }

      case "uploadVmImage": {
        const res = await qemuManager.uploadImage(args || {})
        return res
      }

      case "restoreVmSrc": {
        const res = await qemuManager.downloadAsset("qemuSrc", { io })
        return res
      }

      case "startVmAssetDownload": {
        const res = await qemuManager.downloadAsset(args?.assetType, { io })
        return res
      }

      case "cancelVmAssetDownload": {
        const res = qemuManager.cancelDownload(args?.assetType)
        return res
      }

      case "getVmDownloadProgress": {
        return { ok: true, msg: "获取成功", data: qemuManager.getDownloadingStatus() }
      }

      case "saveVmHardware": {
        const res = await qemuManager.saveHardwareConfig(args || {})
        return res
      }

      case "checkQemuReady": {
        return { ok: true, msg: "检测完成", data: { ready: qemuManager.isQemuBinReady() } }
      }

      case "getVmConsoleLogs": {
        return { ok: true, msg: "获取成功", data: qemuManager.getConsoleLogs() }
      }

      case "clearVmConsoleLogs": {
        return qemuManager.clearConsoleLogs()
      }

      case "sendVmConsoleInput": {
        return qemuManager.sendConsoleInput(args?.input || "")
      }

      default:
        return { ok: false, msg: `未知操作: ${action}` }
    }
  },

}
