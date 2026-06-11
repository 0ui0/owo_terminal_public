import terminalData from "./terminalData.js"

export default ({ appId, m, Notice, ioSocket, commonData, settingData, getColor, Terminal, FitAddon }) => {
  let term = null
  let fitAddon = null

  const instanceInterface = {
    onDispatch(msg, callback) {
      if (msg.action === "stream" && term) {
        term.write(msg.args.content)
      }
      if (msg.action === "exit" && term) {
        term.write("\r\n[进程已退出]\r\n")
      }
      if (callback) callback({ ok: true, msg: "ok" })
    }
  }

  terminalData.addTool("commonData", commonData)
  terminalData.registerInstances(appId, instanceInterface)
  if (commonData.registerApp) commonData.registerApp(appId, terminalData)

  return {
    onremove() {
      if (term) term.dispose()
      terminalData.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      const { data } = vnode.attrs
      return m("",
        {
          style: {
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: getColor("brown_5").back
          },
          oncreate({ dom }) {
            if (!Terminal || !FitAddon) {
              dom.textContent = "[错误] xterm 依赖未注入"
              return
            }

            term = new Terminal({
              fontFamily: settingData.options?.get("global_terminalFontFamily")
                || 'Fira Code, Menlo, Monaco, "Courier New", monospace',
              fontSize: 14,
              lineHeight: 1.2,
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
            fitAddon.fit()

            // 恢复历史内容并且异步获取最新完整内容，防止 launch 期间输出丢失
            if (data?.content) {
              term.write(data.content)
            }
            settingData.fnCall("appDispatch", [appId, "getContent", { limit: 1000 }]).then((res) => {
              if (res?.ok && res?.data?.content && term) {
                term.clear()
                term.write(res.data.content)
              }
            })
          }
        }
      )
    }
  }
}
