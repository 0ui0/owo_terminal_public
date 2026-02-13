import aiBasic from "../../../tools/aiAsk/basic.js"
import pathLib from "path"
import stripAnsi from 'strip-ansi'
import { idTool } from "./ioApi_chat.js"
import chats from "./chats.js"
import { spawn } from "@homebridge/node-pty-prebuilt-multiarch"
//node-pty
import comData from "../../../comData/comData.js"
import options from "../../../config/options.js"
import subAgents from "../../../tools/aiAsk/subAgents.js"
import { exec } from "child_process"
import util from "util"
const execAsync = util.promisify(exec)

const TSession = class {
  constructor() {
    this.sessions = {}
  }
  find(uuid) {
    return this.sessions[uuid]
  }
  close(tid) {
    const session = this.sessions[tid]
    if (session) {
      if (session.shell) {
        try {
          session.shell.kill()
        } catch (err) {
          console.error(`关闭终端 ${tid} 失败:`, err)
        }
      }
      delete this.sessions[tid]
      console.log(`终端 ${tid} 已清理`)
    }
  }
  // 获取终端概要
  // maxCount: 限制最大数量（不传则返回所有），cwd 截断
  getSummary(maxCount) {
    let sessions = Object.values(this.sessions)
    if (maxCount && maxCount > 0) {
      sessions = sessions.slice(0, maxCount)
    }
    return sessions.map(s => ({
      tid: s.tid,
      listId: s.listId,
      cwd: s.cwd
    }))
  }
  async checkCwd(tid) {
    const session = this.sessions[tid]
    if (!session || !session.shell || !session.io) return

    // Debounce check
    if (session.cwdCheckTimer) clearTimeout(session.cwdCheckTimer)

    session.cwdCheckTimer = setTimeout(async () => {
      try {
        if (process.platform === 'win32') {
          // Windows CWD check requires complex PowerShell or C++ addons. Skipping for stability.
          return
        }
        const pid = session.shell.pid
        const { stdout } = await execAsync(`lsof -a -p ${pid} -d cwd -F n`)
        // Output format: p<PID>\nfcwd\nn<PATH>\n
        const lines = stdout.split('\n')
        const pathLine = lines.find(l => l.startsWith('n'))
        if (pathLine) {
          const newCwd = pathLine.substring(1)
          if (newCwd !== session.cwd) {
            session.cwd = newCwd

            // Broadcast change
            session.io.emit("terminal:cwd", { tid, cwd: newCwd })

            // Also notify chat if needed or update app state?
            // For now just basic event
          }
        }
      } catch (e) {
        // lsof might fail if process gone or permissions
        // console.error("CWD Check failed", e.message)
      }
    }, 800) // Delay to let cd command finish
  }

  async add(io, ext) {
    const global_terminalShell = await options.get("global_terminalShell")
    const tid = idTool.get()
    let shellChoice = ""
    if (process.platform === "win32") {
      shellChoice = global_terminalShell.win
    } else if (process.platform === "darwin") {
      shellChoice = global_terminalShell.mac
    }
    else {
      shellChoice = global_terminalShell.linux
    }



    // Attempt to validate shellChoice to avoid "File not found"
    // (Simple check: if empty, force default)
    if (!shellChoice.trim()) {
      shellChoice = process.platform === "win32" ? "powershell.exe" : "bash"
    }

    const session = this.sessions[tid] = {
      tid,
      io, // Store io for events
      shell: spawn(shellChoice, [], {
        name: 'xterm-256color',
        env: {
          LANG: "zh_CN.UTF-8",
          ...process.env
        },
        cwd: ext?.cwd ?? pathLib.resolve(process.cwd(), "..", "aiWork")
      }),
      content: "",
      cwd: ext?.cwd ?? pathLib.resolve(process.cwd(), "..", "aiWork"), // 保存 cwd 方便查询
      listId: ext?.listId || 0, // Bind session to list
      toolCallGroupId: ext?.toolCallGroupId || null, // 工具调用组ID
    }

    const shell = session.shell
    shell.onData(async (data) => {
      //console.log(String(data))
      await this.cmdSend(io, tid, String(data), session)
    })
    /* shell.stderr.on("data",(data)=>{
      console.log(String(data))
      cmdSend(io,tid,String(data))
    }) */
    shell.onExit(async (code, signal) => {
      //await this.cmdSend(io, tid, `\r\n[进程退出，代码: ${code || signal}]\r\n`, session)
    })
    return session
  }

  async cmdSend(io, tid, output, session) {
    let msg = {
      uuid: idTool.get(),
      tid: tid,
      content: output,
      name: "终端",
      group: "terminal",
      type: "stream",
      timestamp: Date.now(),
      chatListId: session.listId || 0, //指定发送给哪一个队列
      ask: {
        toolCallGroupId: session.toolCallGroupId || null, // 工具调用组ID（用于消息折叠）
      }
    }


    io.emit("chat", msg)



    // 更新对话和终端数组
    let chat = chats.findByTid(tid)
    if (chat) {
      chat.content += output //给对话更新终端内容
      session.content += output //给终端数组项目也缓存终端内容，因为spawn本身不提供内容访问

      comData.data.edit(() => { }) //手动触发更新

    } else {
      await chats.add(msg, session.listId || 0)
    }


    // Terminal update to AI context (Routed)
    const updateAsk = (model) => {
      let ask = model.asks.find((ask) => ask.tid === tid)
      if (ask) {
        //给模型会话也缓存内容
        ask.content += stripAnsi(output)
        ask.content = ask.content.split(/\r?\n/).slice(-20).join("\n").slice(-1000)
      }
      else {
        model.addAsk(msg.name, "user", ("摘要终端最新20条的最后1000字" + stripAnsi(msg.content.split(/\r?\n/).slice(-20).join("\n").slice(-1000))), {
          id: msg.uuid,
          tid: tid,
          title: "终端输出摘要"
        })
      }
    };


    if (session.listId && session.listId > 0) {
      const agent = subAgents.get(session.listId);
      if (agent) updateAsk(agent);
    } else {
      // Main AI Broadcast
      aiBasic.list.forEach(updateAsk);
    }

  }
}

export default TSession