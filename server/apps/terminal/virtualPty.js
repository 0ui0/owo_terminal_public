import { Client } from "ssh2"
import net from "net"
import qemuManager from "../../tools/vm/qemuManager.js"

let consoleListener = null

export function createVirtualShell({ cols = 80, rows = 24, getWorkspaceDir, io, appId } = {}) {
  const getTargetWorkspace = () => (typeof getWorkspaceDir === "function" ? getWorkspaceDir() : null)
  if (io && appId) {
    consoleListener ??= qemuManager.addConsoleListener((chunk) => {
      try {
        io.emit("app:dispatch", {
          appId,
          action: "vmConsoleChunk",
          args: { text: String(chunk) }
        })
      } catch (e) {
        console.error("[virtualPty] 推送控制台流异常:", e)
      }
    })
  }

  let streamRef = null
  const listeners = []
  let exitCallback = null
  let retryTimer = null
  let conn = null
  let isConnected = false
  let isDestroyed = false
  let attempt = 0
  let curCols = cols
  let curRows = rows
  const pendingWrites = []

  const emitLog = (msg) => {
    for (const fn of listeners) {
      try {
        fn(msg)
      } catch (e) {
        console.error("[virtualPty] emitLog error:", e)
      }
    }
  }

  const virtualShell = {
    pid: "vm_guest",
    isVirtual: true,
    write(data) {
      if (streamRef) {
        streamRef.write(data)
      } else {
        pendingWrites.push(data)
      }
    },
    resize(newCols, newRows) {
      curCols = newCols
      curRows = newRows
      if (streamRef) {
        streamRef.setWindow(newRows, newCols, 0, 0)
      }
    },
    onData(cb) {
      listeners.push(cb)
      return {
        dispose: () => {
          const idx = listeners.indexOf(cb)
          if (idx !== -1) listeners.splice(idx, 1)
        }
      }
    },
    onExit(cb) {
      exitCallback = cb
    },
    kill() {
      isDestroyed = true
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      listeners.length = 0
      if (streamRef) {
        try {
          streamRef.close()
        } catch (err) {
          console.warn("[virtualPty] 关闭 streamRef 失败:", err.message)
        }
        streamRef = null
      }
      if (conn) {
        try {
          conn.end()
        } catch (err) {
          console.warn("[virtualPty] 关闭 conn 失败:", err.message)
        }
        conn = null
      }
      if (typeof exitCallback === "function") {
        exitCallback({ exitCode: 0 })
      }
    }
  }

  // 后台非阻塞拉起微虚拟机操作系统进程并启动连接心跳重试
  ;(async () => {
    emitLog(">>> [owo-vm] 正在启动微虚拟机沙箱进程...\r\n")
    qemuManager.start({ workspaceDir: getTargetWorkspace() }).catch((err) => {
      emitLog(`❌ [owo-vm 错误] 启动进程异常: ${err.message}\r\n`)
    })

    const tryConnect = () => {
      if (isConnected || isDestroyed) return
      attempt++
      emitLog(`>>> [owo-vm] 正在连接微虚拟机终端 (127.0.0.1:2222)... (第 ${attempt} 次尝试)\r\n`)

      const socket = new net.Socket()
      socket.setTimeout(1200)

      socket.once("connect", () => {
        socket.destroy()
        if (isConnected || isDestroyed) return

        const client = new Client()

        const handleDisconnect = (reason) => {
          if (isDestroyed) return
          if (isConnected) {
            isConnected = false
            streamRef = null
            if (conn) {
              try { conn.end() } catch (e) {}
              conn = null
            }
            emitLog(`\r\n>>> [owo-vm] 检测到底座微虚拟机重启/断开 (${reason})，正在重新连接 (127.0.0.1:2222)...\r\n`)
            if (retryTimer) clearTimeout(retryTimer)
            retryTimer = setTimeout(tryConnect, 1200)
          }
        }

        client.on("error", (err) => {
          console.warn(`[virtualPty] SSH 连接异常 (${err.level || err.code || "UNKNOWN"}):`, err.message)
          try {
            client.end()
          } catch (endErr) {
            console.warn("[virtualPty] 异常后关闭 client 失败:", endErr.message)
          }
          if (!isConnected && !isDestroyed) {
            if (retryTimer) clearTimeout(retryTimer)
            retryTimer = setTimeout(tryConnect, 1200)
          } else if (isConnected) {
            handleDisconnect(err.message)
          }
        })

        client.on("end", () => {
          handleDisconnect("对端关闭")
        })

        client.on("close", () => {
          handleDisconnect("网络断开")
        })

        client.once("ready", () => {
          if (isDestroyed) {
            try {
              client.end()
            } catch (err) {
              console.warn("[virtualPty] 销毁态关闭 client 失败:", err.message)
            }
            return
          }
          isConnected = true
          conn = client
          if (retryTimer) {
            clearTimeout(retryTimer)
            retryTimer = null
          }

          const startInteractiveShell = () => {
            if (isDestroyed) return
            client.shell({ term: "xterm-256color", cols: curCols, rows: curRows }, (err, stream) => {
              if (err) {
                console.error("[virtualPty] 请求 SSH Shell 失败:", err)
                try {
                  client.end()
                } catch (endErr) {
                  console.warn("[virtualPty] 请求失败后关闭 client 失败:", endErr.message)
                }
                isConnected = false
                if (!isDestroyed) {
                  if (retryTimer) clearTimeout(retryTimer)
                  retryTimer = setTimeout(tryConnect, 1200)
                }
                return
              }
              streamRef = stream
              emitLog(">>> [owo-vm] 微虚拟机终端已连接就绪！\r\n\r\n")

              // 投递连接建立前暂存的用户输入
              while (pendingWrites.length > 0) {
                const pendingData = pendingWrites.shift()
                try {
                  stream.write(pendingData)
                } catch (writeErr) {
                  console.error("[virtualPty] 投递暂存输入失败:", writeErr)
                }
              }

              stream.on("data", (chunk) => {
                const text = String(chunk)
                for (const fn of listeners) {
                  try {
                    fn(text)
                  } catch (e) {
                    console.error("[virtualPty] onData 回调异常:", e)
                  }
                }
              })

              stream.on("close", () => {
                handleDisconnect("Shell通道关闭")
              })
            })
          }

          let shellStarted = false
          let shellFallbackTimer = null
          const safeStartShell = () => {
            if (shellStarted) return
            shellStarted = true
            if (shellFallbackTimer) {
              clearTimeout(shellFallbackTimer)
              shellFallbackTimer = null
            }
            startInteractiveShell()
          }
          shellFallbackTimer = setTimeout(safeStartShell, 800)

          // 核心时序闭环：若配置了工作目录，利用免密 sudo 挂载、将挂载点归属权移交 vagrant，并写入 vagrant 的 ~/.profile 环境引导
          const targetWs = getTargetWorkspace()
          if (targetWs) {
            const dirName = targetWs.split(/[/\\]/).filter(Boolean).pop() || "workspace"
            const mountCmd = `sudo mkdir -p "/mnt/${dirName}" && (sudo mount -t 9p -o trans=virtio,version=9p2000.L "${dirName}" "/mnt/${dirName}" 2>/dev/null || sudo mount -t 9p -o trans=virtio,version=9p2000.L workspace "/mnt/${dirName}" 2>/dev/null) && sudo chown -R vagrant:vagrant "/mnt/${dirName}" && echo 'cd "/mnt/'"${dirName}"'" 2>/dev/null' > /home/vagrant/.owo_dir && (grep -q '\\.owo_dir' /home/vagrant/.profile 2>/dev/null || echo '[ -f /home/vagrant/.owo_dir ] && . /home/vagrant/.owo_dir' >> /home/vagrant/.profile)`
            client.exec(mountCmd, (execErr, execStream) => {
              if (execErr) {
                console.warn("[virtualPty] 挂载命令下发告警:", execErr.message)
                safeStartShell()
                return
              }
              // 消费流防止背压导致进程挂起，完成后立即开启终端
              execStream?.resume()
              execStream?.stderr?.resume()
              execStream?.on("close", () => {
                safeStartShell()
              })
            })
          } else {
            safeStartShell()
          }
        })

        client.connect({
          host: "127.0.0.1",
          port: 2222,
          username: "vagrant",
          password: "vagrant",
          readyTimeout: 6000
        })
      })

      const onSocketFail = () => {
        socket.destroy()
        if (!isConnected && !isDestroyed) {
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(tryConnect, 1200)
        }
      }

      socket.once("error", onSocketFail)
      socket.once("timeout", onSocketFail)
      socket.connect(2222, "127.0.0.1")
    }

    // 立即发起首次尝试
    setTimeout(tryConnect, 300)
  })()

  return virtualShell
}
