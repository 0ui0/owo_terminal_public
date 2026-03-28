
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
          const selector = JSON.stringify(msg.args.selector)
          const result = await webview.executeJavaScript(`
            (() => {
              try {
                const el = document.querySelector(${selector});
                if (!el) return { ok: false, error: "未找到元素: " + ${selector} };
                el.click();
                return { ok: true };
              } catch (e) {
                return { ok: false, error: "选择器无效: " + e.message };
              }
            })()
          `)
          done(result)

        } else if (msg.action === "type") {
          const selector = JSON.stringify(msg.args.selector)
          const text = JSON.stringify(msg.args.text || "")
          const pressEnter = !!msg.args.pressEnter
          const result = await webview.executeJavaScript(`
              (() => {
                try {
                  const el = document.querySelector(${selector});
                  if (!el) return { ok: false, error: "未找到元素: " + ${selector} };
                  const val = ${text};
                  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.value = val;
                  } else {
                    el.innerText = val;
                  }
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  
                  if (${pressEnter}) {
                    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
                    el.dispatchEvent(enterEvent);
                    const upEvent = new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
                    el.dispatchEvent(upEvent);
                  }
                  return { ok: true };
                } catch (e) {
                  return { ok: false, error: "选择器无效: " + e.message };
                }
              })()
           `)
          done(result)
        } else if (msg.action === "pressKey") {
          const selector = JSON.stringify(msg.args.selector)
          const key = JSON.stringify(msg.args.key || "Enter")
          const result = await webview.executeJavaScript(`
              (() => {
                try {
                  const el = document.querySelector(${selector});
                  if (!el) return { ok: false, error: "未找到元素: " + ${selector} };
                  const k = ${key};
                  const downEvent = new KeyboardEvent("keydown", { key: k, bubbles: true });
                  el.dispatchEvent(downEvent);
                  const upEvent = new KeyboardEvent("keyup", { key: k, bubbles: true });
                  el.dispatchEvent(upEvent);
                  return { ok: true };
                } catch (e) {
                  return { ok: false, error: "选择器无效: " + e.message };
                }
              })()
          `)
          done(result)

        } else if (msg.action === "screenshot") {
          console.log("[Screenshot] triggered");
          if (isLoading) {
            console.log("[Screenshot] waiting for page load... (up to 10s)");
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, 10000)
              loadResolvers.push((res) => { clearTimeout(timer); resolve(res) })
            })
          }
          if (loadError) return done({ ok: false, error: `页面加载失败: ${loadError}` })

          // 1. 捕获页面快照
          try {
            console.log("[Screenshot] start capturePage()");
            let image = null;
            // 处理 Electron WebView API 版本差异
            // 如果 API 要求传 callback...
            if (webview.capturePage.length && webview.capturePage.length > 0) {
              image = await new Promise(res => webview.capturePage(res));
            } else {
              let resImg = webview.capturePage();
              if (resImg && typeof resImg.then === 'function') {
                image = await resImg;
              } else {
                image = resImg;
              }
            }

            if (!image) throw new Error("获取的 NativeImage 为空 (渲染进程返回 null)，请检查目标网站。");

            console.log("[Screenshot] capturePage done. toDataURL()");

            // 避开 toPNG 带来的 Node Buffer 崩溃，改用 toDataURL 返回纯字符串
            let dataUrl = typeof image.toDataURL === 'function' ? image.toDataURL() : image.toDataURL;
            if (typeof dataUrl === 'function') {
              console.log("WARN: toDataURL was accessed incorrectly");
              dataUrl = dataUrl();
            }
            console.log("[Screenshot] dataUrl size:", dataUrl.length);

            // 直接让浏览器 fetch 这个 base64 url 对象并转为 Blob
            const base64Res = await fetch(dataUrl);
            const blob = await base64Res.blob();
            console.log("[Screenshot] parsed Blob size:", blob.size);

            const formData = new FormData();
            formData.append('file', blob, `screenshot_${Date.now()}.png`);

            // 3. 上传到服务器 (固定后端 9501 端口，忽略可能存在的 Vite 转发乱窜)
            const serverHost = window.location.hostname || "127.0.0.1";
            const uploadUrl = `http://${serverHost}:9501/api/attachments/set`;
            console.log("[Screenshot] fetch:", uploadUrl);

            const uploadRes = await fetch(uploadUrl, {
              method: 'POST',
              body: formData
            });

            console.log("[Screenshot] fetch returned:", uploadRes.status);
            if (!uploadRes.ok) {
              throw new Error(`上传失败: ${uploadRes.statusText || uploadRes.status}`);
            }

            const resData = await uploadRes.json();
            console.log("[Screenshot] upload success obj:", resData);
            // 4. 返回附件元数据
            done({ ok: true, data: resData });
          } catch (err) {
            console.error("[Screenshot] Error caught:", err);
            done({ ok: false, error: "截图处理失败: " + (err.message || String(err)) });
          }

        } else if (msg.action === "scroll") {
          const x = msg.args.x ?? 0
          const y = msg.args.y ?? 0
          const distanceX = msg.args.distanceX
          const distanceY = msg.args.distanceY
          
          if (typeof distanceX === 'number' || typeof distanceY === 'number') {
            // 相对滚动
            await webview.executeJavaScript(`window.scrollBy(${distanceX ?? 0}, ${distanceY ?? 0})`)
          } else {
            // 绝对滚动
            await webview.executeJavaScript(`window.scrollTo(${x}, ${y})`)
          }
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
          }, isLoading ? "加载中..." : "前往"),


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
