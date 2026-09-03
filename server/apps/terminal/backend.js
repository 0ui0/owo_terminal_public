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
        const newCwd = pathLine.substring(1)
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
  async init(app, manager) {
    const { cwd, listId, toolCallGroupId, deferredFns } = app.data

    app.data.content = app.data.content || ""
    app.data.cwd = cwd || workDirTool.getMainWorkDir(0) || pathLib.resolve(process.cwd(), "..", "aiWork")
    app.data.listId = listId || 0

    const shell = await createShell(app.data.cwd)

    const session = {
      shell,
      content: app.data.content,
      cwd: app.data.cwd,
      listId: app.data.listId,
      toolCallGroupId: toolCallGroupId || null,
      deferredFns: deferredFns || null,
      editThrottleTimer: null,
      cwdCheckTimer: null
    }
    sessions.set(app.id, session)

    const io = manager.io

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
      case "write": {
        if (!session) return { ok: false, msg: "终端 session 不存在" }
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
        return { ok: true, msg: "写入成功" }
      }

      case "resize": {
        if (!session) return { ok: false, msg: "终端 session 不存在" }
        try {
          session.shell.resize(args.cols || 80, args.rows || 24)
        } catch (e) { }
        return { ok: true, msg: "resize 成功" }
      }

      case "checkRunningProcess": {
        if (!session?.shell?.pid) return { ok: true, hasRunningProcess: false }
        try {
          if (process.platform === "win32") {
            const { stdout } = await execAsync(`wmic process where ParentProcessId=${session.shell.pid} get ProcessId`)
            const pids = stdout.trim().split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l))
            return { ok: true, hasRunningProcess: pids.length > 0 }
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
          // pgrep/ps 退出码非0表示未匹配到子进程
          return { ok: true, hasRunningProcess: false }
        }
      }

      case "getContent": {
        if (!session) return { ok: false, msg: "终端 session 不存在" }
        const limit = args.limit || 20
        let targetContent = args.raw ? session.content : cleanTerminalContent(session.content)
        const allLines = targetContent.split(/\r?\n/)
        const totalLines = allLines.length
        const content = allLines.slice(-limit).join("\n")
        const isTruncated = totalLines > limit
        return {
          ok: true,
          msg: "获取成功",
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
        // 广播 open 给前端，前端负责聚焦/打开窗口（由 appManager.launch 的 app:active 完成）
        return { ok: true, msg: "终端已激活" }
      }

      case "setToolContext": {
        if (session) {
          session.toolCallGroupId = args.toolCallGroupId || null
          session.deferredFns = args.deferredFns || null
        }
        return { ok: true, msg: "已更新工具上下文" }
      }


      default:
        return { ok: false, msg: `未知操作: ${action}` }
    }
  },

  // 供 appCall 直接访问 session 的工具方法
  getSession(appId) {
    return sessions.get(appId)
  }
}
