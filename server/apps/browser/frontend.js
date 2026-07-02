
import browserData from "./browserData.js"

export default ({ appId, m, Notice, ioSocket, settingData, comData, commonData, iconPark, getColor, trs }) => {
  // === 私有状态 (Private State) ===
  let url = "about:blank"
  let inputUrl = "about:blank"
  let isLoading = false
  let loadError = null
  let webview = null
  let loadResolvers = []
  let canGoBack = false
  let canGoForward = false

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

  const navigateTo = (targetUrl) => {
    if (!targetUrl.match(/^https?:\/\//) && !targetUrl.includes("://")) {
      targetUrl = "http://" + targetUrl
    }
    inputUrl = targetUrl
    isLoading = true
    loadError = null

    if (webview) {
      try {
        webview.loadURL(targetUrl)
      } catch (err) {
        console.error("[BrowserFrontend] loadURL failed, fallback to url variable:", err)
        url = targetUrl
        redraw()
      }
    } else {
      url = targetUrl
      redraw()
    }
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

      console.log(`[BrowserFrontend] onDispatch received: ${msg.action} for appId: ${appId}, webview status: ${webview ? "OK" : "NULL"}`);
      if (!webview) return done({ ok: false, msg: "webview 未就绪" })

      try {
        if (msg.action === "getCookies" || msg.action === "getWebContentsId") {
          try {
            const webContentsId = webview.getWebContentsId()
            done({ ok: true, msg: "获取 WebContents ID 成功", webContentsId })
          } catch (err) {
            done({ ok: false, msg: String(err.message || err) })
          }

        } else if (msg.action === "navigate") {
          navigateTo(msg.args.url)

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
          if (loadError) return done({ ok: false, msg: `页面加载失败: ${loadError}` })
          try {
            const text = await webview.executeJavaScript("document.body.innerText")
            done({ ok: true, msg: "获取纯文本成功", data: text || "" })
          } catch (err) { done({ ok: false, msg: String(err.message) }) }

        } else if (msg.action === "getHTML") {
          if (isLoading) {
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, 10000)
              loadResolvers.push((res) => { clearTimeout(timer); resolve(res) })
            })
          }
          if (loadError) return done({ ok: false, msg: `页面加载失败: ${loadError}` })
          try {
            const html = await webview.executeJavaScript("document.documentElement.outerHTML")
            done({ ok: true, msg: "获取 HTML 成功", data: html || "" })
          } catch (err) { done({ ok: false, msg: String(err.message) }) }

        } else if (msg.action === "executeJS") {
          const result = await webview.executeJavaScript(msg.args.code)
          done({ ok: true, msg: "执行成功", data: result })

        } else if (msg.action === "click") {
          const selector = JSON.stringify(msg.args.selector)
          const result = await webview.executeJavaScript(`
            (() => {
              try {
                const el = document.querySelector(${selector});
                if (!el) return { ok: false, msg: "未找到元素: " + ${selector} };
                el.click();
                return { ok: true, msg: "点击成功" };
              } catch (e) {
                return { ok: false, msg: "选择器无效: " + e.message };
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
                  if (!el) return { ok: false, msg: "未找到元素: " + ${selector} };
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
                  return { ok: true, msg: "操作成功" };
                } catch (e) {
                  return { ok: false, msg: "选择器无效: " + e.message };
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
                  if (!el) return { ok: false, msg: "未找到元素: " + ${selector} };
                  const k = ${key};
                  const downEvent = new KeyboardEvent("keydown", { key: k, bubbles: true });
                  el.dispatchEvent(downEvent);
                  const upEvent = new KeyboardEvent("keyup", { key: k, bubbles: true });
                  el.dispatchEvent(upEvent);
                  return { ok: true, msg: "操作成功" };
                } catch (e) {
                  return { ok: false, msg: "选择器无效: " + e.message };
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
          if (loadError) return done({ ok: false, msg: `页面加载失败: ${loadError}` })

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

            const uploadUrl = `/api/attachments/set`;
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
            done({ ok: true, msg: "截图成功", data: resData });
          } catch (err) {
            console.error("[Screenshot] Error caught:", err);
            done({ ok: false, msg: "截图处理失败: " + (err.message || String(err)) });
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
          done({ ok: true, msg: "滚动成功" })

        } else {
          done({ ok: false, msg: `不支持的操作: ${msg.action}` })
        }
      } catch (e) {
        done({ ok: false, msg: String(e.message || e) })
      }
    }
  }

  // === Lifecycle ===
  const init = async () => {
    // 注入 & 注册
    console.log(`[BrowserFrontend] Initializing appId: ${appId}`);
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
        m("form", {
          style: {
            display: "flex",
            alignItems: "center",
            padding: "8px",
            gap: "8px",
            background: getColor("gray_3").back,
            borderBottom: `0.1rem solid ${getColor("gray_3").front}22`
          },
          onsubmit(e) {
            e.preventDefault()
            navigateTo(inputUrl)
          }
        }, [
          // 后退按钮
          m("button", {
            type: "button",
            disabled: !canGoBack,
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              padding: "0",
              background: "transparent",
              border: "none",
              cursor: canGoBack ? "pointer" : "not-allowed",
              opacity: canGoBack ? 1 : 0.4
            },
            onclick() {
              if (webview && webview.canGoBack()) {
                webview.goBack()
              }
            }
          }, m.trust(iconPark.getIcon("Left", { fill: getColor("gray_3").front, size: "18px" }))),

          // 前进按钮
          m("button", {
            type: "button",
            disabled: !canGoForward,
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              padding: "0",
              background: "transparent",
              border: "none",
              cursor: canGoForward ? "pointer" : "not-allowed",
              opacity: canGoForward ? 1 : 0.4
            },
            onclick() {
              if (webview && webview.canGoForward()) {
                webview.goForward()
              }
            }
          }, m.trust(iconPark.getIcon("Right", { fill: getColor("gray_3").front, size: "18px" }))),

          // 刷新按钮
          m("button", {
            type: "button",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              padding: "0",
              background: "transparent",
              border: "none",
              cursor: "pointer"
            },
            onclick() {
              if (webview) {
                webview.reload()
              }
            }
          }, m.trust(iconPark.getIcon("Refresh", { fill: getColor("gray_3").front, size: "18px" }))),

          // 开发者工具按钮 (原生弹窗模式)
          m("button", {
            type: "button",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              padding: "0",
              background: "transparent",
              border: "none",
              cursor: "pointer"
            },
            onclick() {
              if (webview) {
                try {
                  const mainId = webview.getWebContentsId()
                  settingData.fnCall("appDispatch", [appId, "toggleDevTools", {
                    mainWebContentsId: mainId
                  }])
                } catch (err) {
                  console.error("[DevTools] 操作控制台失败:", err)
                }
              }
            }
          }, m.trust(iconPark.getIcon("Code", { fill: getColor("gray_3").front, size: "18px" }))),

          m("input", {
            style: {
              flex: 1,
              padding: "6px 12px",
              border: `0.1rem solid ${getColor("gray_3").front}33`,
              borderRadius: "100px",
              background: getColor("brown_4").back,
              color: getColor("brown_4").front,
              outline: "none",
              fontSize: "13px"
            },
            value: inputUrl,
            oninput(e) { inputUrl = e.target.value }
          }),

          m("button", {
            type: "submit",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              padding: "0",
              background: getColor("main").back,
              border: "none",
              borderRadius: "100px",
              color: getColor("main").front,
              cursor: "pointer"
            }
          }, isLoading ?
            m.trust(iconPark.getIcon("LoadingOne", { fill: getColor("main").front, size: "16px" })) :
            m.trust(iconPark.getIcon("Check", { fill: getColor("main").front, size: "16px" }))
          ),


        ]),

        // Webview Container
        m("div", { style: { flex: 1, position: "relative", background: "#fff" } }, [
          m("webview", {
            src: url,
            style: { width: "100%", height: "100%" },
            allowpopups: true,
            onbeforeupdate() {
              return false
            },
            oncreate({ dom }) {
              console.log(`[BrowserFrontend] oncreate triggered for appId: ${appId}, dom:`, dom);
              webview = dom
              dom.addEventListener("did-start-loading", () => { setLoading(true); setError(null) })
              dom.addEventListener("dom-ready", () => {
                canGoBack = dom.canGoBack()
                canGoForward = dom.canGoForward()
                if (isLoading) { setLoading(false); resolveLoad({ ok: true }); redraw() }
              })
              dom.addEventListener("did-fail-load", (e) => {
                if (e.errorCode === -3) return;
                setLoading(false);
                setError(`${e.errorDescription} (${e.errorCode})`);
                resolveLoad({ ok: false, error: loadError });
                redraw()
              })
              dom.addEventListener("did-stop-loading", () => {
                canGoBack = dom.canGoBack()
                canGoForward = dom.canGoForward()
                if (isLoading) { setLoading(false); resolveLoad({ ok: true }); redraw() }
              })
              dom.addEventListener("did-navigate", (e) => {
                setInputUrl(e.url)
                canGoBack = dom.canGoBack()
                canGoForward = dom.canGoForward()
                settingData.fnCall("appUpdateData", [appId, { url: e.url }])
              })
              dom.addEventListener("did-redirect-navigation", (e) => {
                setInputUrl(e.url)
                canGoBack = dom.canGoBack()
                canGoForward = dom.canGoForward()
                settingData.fnCall("appUpdateData", [appId, { url: e.url }])
              })
              dom.addEventListener("did-navigate-in-page", (e) => {
                canGoBack = dom.canGoBack()
                canGoForward = dom.canGoForward()
                redraw()
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
