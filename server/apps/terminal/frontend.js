import terminalData from "./terminalData.js"

export default ({ appId, m, Notice, ioSocket, commonData, settingData, getColor, trs, Terminal, FitAddon }) => {
  let term = null
  let fitAddon = null
  let resizeObserver = null
  let resizeTimeout = null

  const instanceInterface = {
    onDispatch(msg, callback) {
      if (msg.action === "stream" && term) {
        term.write(msg.args.content)
      }
      if (msg.action === "exit" && term) {
        term.write("\r\n" + (trs ? trs("终端/状态/进程已退出", { cn: "[进程已退出]", en: "[Process Exited]" }) : "[进程已退出]") + "\r\n")
      }
      if (callback) callback({ ok: true, msg: "ok" })
    }
  }

  let currentDom = null

  const syncSize = (targetDom) => {
    if (!term || !fitAddon) return
    const el = targetDom || currentDom
    // 容器在隐藏或未完成布局时（offsetWidth 为 0）跳过计算，避免将终端挤压为畸形尺寸
    if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0) return
    try {
      fitAddon.fit()
      if (term.cols > 0 && term.rows > 0) {
        if (resizeTimeout) clearTimeout(resizeTimeout)
        resizeTimeout = setTimeout(() => {
          if (term && el && el.offsetWidth > 0) {
            settingData.fnCall("appDispatch", [appId, "resize", {
              cols: term.cols,
              rows: term.rows
            }])
          }
        }, 50)
      }
    } catch (e) { }
  }

  terminalData.addTool("commonData", commonData)
  terminalData.registerInstances(appId, instanceInterface)
  if (commonData.registerApp) commonData.registerApp(appId, terminalData)

  return {
    oninit(vnode) {
      const config = vnode.attrs.noticeConfig
      if (config) {
        const originalCancel = config.cancel
        config.cancel = async (dom, closeFn, tabData, event) => {
          try {
            const res = await settingData.fnCall("appDispatch", [appId, "checkRunningProcess"])
            if (res?.hasRunningProcess) {
              Notice.launch({
                tip: trs ? trs("通用/提示", { cn: "提示", en: "Notice" }) : "提示",
                msg: trs ? trs("终端/提示/有运行中进程", {
                  cn: "终端中有正在运行的进程，关闭将强行终止该进程，确定要关闭吗？",
                  en: "There are running processes in the terminal. Closing will terminate them. Are you sure?"
                }) : "终端中有正在运行的进程，关闭将强行终止该进程，确定要关闭吗？",
                confirm: async () => {
                  if (originalCancel) {
                    await originalCancel(dom, closeFn, tabData, event)
                  } else {
                    closeFn()
                  }
                },
                cancel: () => { }
              })
              return true // 阻断默认关闭
            }
          } catch (e) {
            console.error("[terminal] checkRunningProcess error:", e)
          }
          if (originalCancel) {
            return await originalCancel(dom, closeFn, tabData, event)
          }
          closeFn()
        }
      }
    },
    onremove() {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (term) term.dispose()
      currentDom = null
      terminalData.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      const { data } = vnode.attrs
      const terminalFont = (settingData.options?.get("global_terminalFontFamily") || 'Fira Code, Menlo, Monaco, "Courier New"') + ', monospace'
      return m(".terminal-wrapper",
        {
          style: {
            width: "100%",
            height: "100%",
            padding: "0.8rem 1.5rem",
            boxSizing: "border-box",
            overflow: "hidden",
            background: getColor("brown_5").back
          }
        },
        m(".terminal-host", {
          style: {
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
            fontFamily: terminalFont,
            fontSize: "14px",
            lineHeight: "1.2"
          },
          oncreate({ dom }) {
            if (!Terminal || !FitAddon) {
              dom.textContent = "[错误] xterm 依赖未注入"
              return
            }

            currentDom = dom

            term = new Terminal({
              fontFamily: terminalFont,
              fontSize: 14,
              lineHeight: 1.2,
              cursorBlink: true,
              convertEol: true,
              theme: {
                background: getColor("brown_5").back,
                foreground: getColor("brown_5").front,
                cursor: getColor("pink_1").back
              }
            })

            term.onData((chunk) => {
              ioSocket.socket.emit("chat", { tid: appId, chunk })
            })

            fitAddon = new FitAddon()
            term.loadAddon(fitAddon)
            term.open(dom)

            // 下一帧对齐尺寸，避免首帧容器宽高为 0 时计算失真
            requestAnimationFrame(() => {
              syncSize(dom)
            })

            // 监听内层宿主容器尺寸变动，自动调整列宽行高并同步 PTY
            resizeObserver = new ResizeObserver(() => {
              requestAnimationFrame(() => syncSize(dom))
            })
            resizeObserver.observe(dom)

            // 恢复历史内容并且异步获取最新完整内容，保持 raw: true 原始流解析
            if (data?.content) {
              term.write(data.content)
            }
            settingData.fnCall("appDispatch", [appId, "getContent", { limit: 1000, raw: true }]).then((res) => {
              if (res?.ok && res?.data?.content && term) {
                term.clear()
                term.write(res.data.content)
                requestAnimationFrame(() => syncSize(dom))
              }
            })
          }
        })
      )
    }
  }
}
