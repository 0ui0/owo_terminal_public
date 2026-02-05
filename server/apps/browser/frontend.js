
import browserData from "./browserData.js"

export default ({ appId, m, Notice, ioSocket, settingData, comData, commonData, iconPark }) => {
  // === 私有状态 (Private State) ===
  let url = "about:blank"
  let inputUrl = "about:blank"
  let isLoading = false
  let loadError = null
  let webview = null
  let loadResolvers = []

  const redraw = () => m.redraw()

  // === Helpers ===
  const resolveLoad = (result) => {
    loadResolvers.forEach(resolve => resolve(result))
    loadResolvers = []
  }

  const setLoading = (loading) => {
    isLoading = loading
    redraw()
  }

  const setError = (error) => {
    loadError = error
    redraw()
  }

  const setInputUrl = (u) => {
    inputUrl = u
    redraw()
  }

  // === Instance Interface ===
  const instanceInterface = {
    onDispatch: async (msg, callback) => {
      const trackerId = msg.trackerId
      const done = async (res) => {
        if (trackerId) {
          try { await settingData.fnCall("browserDispatchResponse", [trackerId, res]) }
          catch (err) { console.error("[BrowserData] Failed to send tracker response:", err) }
        }
        if (typeof callback === 'function') callback(res)
      }

      if (!webview) return done({ ok: false, error: "webview 未就绪" })

      try {
        if (msg.action === "navigate") {
          let targetUrl = msg.args.url
          if (!targetUrl.match(/^https?:\/\//) && !targetUrl.includes("://")) {
            targetUrl = "http://" + targetUrl
          }
          url = targetUrl
          inputUrl = targetUrl
          isLoading = true
          loadError = null
          redraw()

          const result = await new Promise((resolve) => {
            const timer = setTimeout(() => {
              if (isLoading) resolve({ ok: true, note: "已开始导航，但 10s 内未完成加载" })
            }, 10000)
            loadResolvers.push((res) => { clearTimeout(timer); resolve(res) })
          })
          done(result)

        } else if (msg.action === "getContent") {
          if (isLoading) {
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, 3000)
              loadResolvers.push((res) => { clearTimeout(timer); resolve(res) })
            })
          }
          if (loadError) return done({ ok: false, error: `页面加载失败: ${loadError}` })
          try {
            const text = await webview.executeJavaScript("document.body.innerText")
            done({ ok: true, data: text || "" })
          } catch (err) { done({ ok: false, error: String(err.message) }) }

        } else if (msg.action === "getHTML") {
          if (isLoading) {
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, 10000)
              loadResolvers.push((res) => { clearTimeout(timer); resolve(res) })
            })
          }
          if (loadError) return done({ ok: false, error: `页面加载失败: ${loadError}` })
          try {
            const html = await webview.executeJavaScript("document.documentElement.outerHTML")
            done({ ok: true, data: html || "" })
          } catch (err) { done({ ok: false, error: String(err.message) }) }

        } else if (msg.action === "executeJS") {
          const result = await webview.executeJavaScript(msg.args.code)
          done({ ok: true, data: result })

        } else if (msg.action === "click") {
          await webview.executeJavaScript(`document.querySelector("${msg.args.selector}")?.click()`)
          done({ ok: true })

        } else if (msg.action === "type") {
          const text = (msg.args.text || "").replace(/"/g, '\\"')
          await webview.executeJavaScript(`
              (() => {
                const el = document.querySelector("${msg.args.selector}");
                if (el) {
                  el.value = "${text}";
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                }
              })()
           `)
          done({ ok: true })

        } else {
          done({ ok: false, error: `不支持的操作: ${msg.action}` })
        }
      } catch (e) {
        done({ ok: false, error: String(e.message || e) })
      }
    }
  }

  // === Lifecycle ===
  const init = async () => {
    // 注入 & 注册
    browserData.addTool("commonData", commonData)
    browserData.registerInstances(appId, instanceInterface)

    if (commonData && commonData.registerApp) {
      commonData.registerApp(appId, browserData)
    }

    // Initial URL

  }

  init()

  return {
    oninit(vnode) {
      if (vnode.attrs.data?.url) {
        url = vnode.attrs.data.url
        inputUrl = url
      }
    },
    onremove() {
      browserData.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      return m("div", {
        style: {
          display: "flex", flexDirection: "column",
          width: "100%", height: "100%",
          background: "#1e1e1e"
        }
      }, [
        // Controls / Address Bar
        m("form", {
          style: { display: "flex", padding: "8px", gap: "8px", background: "#333", borderBottom: "1px solid #444" },
          onsubmit(e) {
            e.preventDefault()
            let target = inputUrl
            if (target && !target.match(/^https?:\/\//) && !target.includes("://")) {
              target = "http://" + target
            }
            url = target
            inputUrl = target
            setLoading(true)
            loadError = null
          }
        }, [
          m("input", {
            style: {
              flex: 1, padding: "6px 12px", border: "0.1rem solid #755d5c", borderRadius: "100px",
              background: "#4a443f99", color: "#eee", outline: "none", fontSize: "13px"
            },
            value: inputUrl,
            oninput(e) { inputUrl = e.target.value }
          }),
          m("button", {
            type: "submit",
            style: {
              padding: "6px 15px", background: "#4a9eff", border: "none",
              borderRadius: "100px", color: "#fff", cursor: "pointer", fontSize: "13px"
            }
          }, isLoading ? "加载中..." : "前往")
        ]),

        // Webview Container
        m("div", { style: { flex: 1, position: "relative", background: "#fff" } }, [
          m("webview", {
            src: url,
            style: { width: "100%", height: "100%" },
            allowpopups: true,
            oncreate({ dom }) {
              webview = dom
              dom.addEventListener("did-start-loading", () => { setLoading(true); setError(null) })
              dom.addEventListener("dom-ready", () => { if (isLoading) { setLoading(false); resolveLoad({ ok: true }); redraw() } })
              dom.addEventListener("did-fail-load", (e) => { if (e.errorCode === -3) return; setLoading(false); setError(`${e.errorDescription} (${e.errorCode})`); resolveLoad({ ok: false, error: loadError }); redraw() })
              dom.addEventListener("did-stop-loading", () => { if (isLoading) { setLoading(false); resolveLoad({ ok: true }); redraw() } })
              dom.addEventListener("did-navigate", (e) => {
                setInputUrl(e.url)
                settingData.fnCall("appUpdateData", [appId, { url: e.url }])
              })
              dom.addEventListener("did-redirect-navigation", (e) => {
                setInputUrl(e.url)
                settingData.fnCall("appUpdateData", [appId, { url: e.url }])
              })
              dom.addEventListener("page-title-updated", (e) => {
                if (vnode.attrs.noticeConfig) { vnode.attrs.noticeConfig.tip = e.title; redraw() }
                settingData.fnCall("appUpdateData", [appId, { title: e.title }])
              })
            }
          })
        ])
      ])
    }
  }
}
