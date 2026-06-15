import { spawn } from "@homebridge/node-pty-prebuilt-multiarch"
import pathLib from "path"
import stripAnsi from "strip-ansi"
import { exec } from "child_process"
import util from "util"
import options from "../../config/options.js"
import idTool from "../../tools/idTool.js"
import aiBasic from "../../tools/aiAsk/basic.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import comData from "../../comData/comData.js"

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
  return spawn(shellChoice, [], {
    name: "xterm-256color",
    env: { LANG: "zh_CN.UTF-8", ...process.env },
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

export default {
  async init(app, manager) {
    const { cwd, listId, toolCallGroupId, deferredFns } = app.data

    app.data.content = app.data.content || ""
    app.data.cwd = cwd || comData.data.get()?.customCwd || pathLib.resolve(process.cwd(), "..", "aiWork")
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

    shell.onData(async (data) => {
      session.lastOutputTime = Date.now()
      const output = String(data)
      session.content += output
      app.data.content = session.content

      // 向前端推送流式数据
      io.emit("app:dispatch", {
        appId: app.id,
        action: "stream",
        args: { content: output }
      })

      // 节流 comData 广播
      if (!session.editThrottleTimer) {
        session.editThrottleTimer = setTimeout(() => {
          session.editThrottleTimer = null
          comData.data.edit(() => { })
        }, 100)
      }

      // 终端数据原本通过 updateAsk 实时同步到 AI 上下文，但这会导致高频的上下文缓存穿透。
      // 现已将其注释禁用，AI 获取终端内容应统一使用 terminalGet/terminalSet 主动查询通道。
      /*
      const updateAsk = (model) => {
        let ask = model.asks.find(a => a.tid === app.id)
        if (ask) {
          ask.content += stripAnsi(output)
          ask.content = ask.content.split(/\r?\n/).slice(-20).join("\n").slice(-1000)
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
        const data = args.data || ""
        const CHUNK_SIZE = 512
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          session.shell.write(data.slice(i, i + CHUNK_SIZE))
          if (i + CHUNK_SIZE < data.length) {
            await new Promise(r => setTimeout(r, 10))
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

      case "getContent": {
        if (!session) return { ok: false, msg: "终端 session 不存在" }
        const limit = args.limit || 20
        return {
          ok: true,
          msg: "获取成功",
          data: {
            appId: app.id,
            content: stripAnsi(session.content).split(/\r?\n/).slice(-limit).join("\n"),
            cwd: session.cwd
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
