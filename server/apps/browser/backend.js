import electron from "electron"
import { DispatchTracker } from "./dispatchTracker.js"

export default {
  // 全局初始化 (AppManager 加载时调用一次)
  setup({ manager }) {
    const electronApp = electron.app || (electron.remote && electron.remote.app)
    if (!electronApp) {
      console.error("[BrowserBackend] Electron app not found in setup")
      return
    }

    // 全局拦截所有 WebContents 创建 (针对 webview 新窗口)
    electronApp.on("web-contents-created", (event, contents) => {

      if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler((details) => {
          if (details.url && details.url !== 'about:blank') {
            // 使用 manager 启动新实例
            manager.launch("browser", { data: { url: details.url } })
          }
          return { action: 'deny' }
        })
      }
    })
  },

  // 初始化 (每次启动 App 实例调用)
  init(app, manager) {
    app.data.url = app.data.url || "about:blank"
    app.data.title = ""
    app.data.content = ""
  },

  // 销毁
  destroy(app, manager) {
    // 清理资源
  },

  // 后端可以处理某些 dispatch（主要是状态同步）
  async dispatch({ app, action, args, appManager, io }) {
    switch (action) {
      case "toggleDevTools":
        const { mainWebContentsId } = args
        try {
          if (mainWebContentsId) {
            const mainContents = electron.webContents.fromId(mainWebContentsId)
            if (!mainContents) return { ok: false, msg: "未找到对应的 WebContents 实例" }
            
            if (mainContents.isDevToolsOpened()) {
              mainContents.closeDevTools()
              return { ok: true, msg: "DevTools 已关闭" }
            } else {
              mainContents.openDevTools({ mode: 'detach' })
              return { ok: true, msg: "DevTools 开启成功" }
            }
          }
          return { ok: false, msg: "缺少 mainWebContentsId" }
        } catch (err) {
          return { ok: false, msg: `DevTools 操作失败: ${err.message}` }
        }

      case "updateState":
        // 前端同步状态到后端
        if (args.url) app.data.url = args.url
        if (args.title) app.data.title = args.title
        if (args.content) app.data.content = args.content
        return { ok: true, msg: "状态更新成功" }

      case "getState":
        return { ok: true, msg: "获取实时状态成功", data: app.data }

      case "getCookies":
        return new Promise(async (resolve) => {
          let sockets = []
          if (io.fetchSockets) {
            sockets = await io.fetchSockets()
          } else if (io.sockets && io.sockets.sockets) {
            sockets = Array.from(io.sockets.sockets.values())
          }

          if (sockets.length === 0) {
            return resolve({ ok: false, msg: "未检测到已连接的客户端" })
          }

          const tracker = DispatchTracker.create(10000)

          io.emit("app:dispatch", {
            appId: app.id,
            action: "getCookies",
            args,
            trackerId: tracker.id
          })

          const res = await tracker.promise
          if (!res.ok) {
            return resolve(res)
          }

          const { webContentsId } = res
          if (!webContentsId) {
            return resolve({ ok: false, msg: "未获取到 webContentsId" })
          }

          try {
            const contents = electron.webContents.fromId(webContentsId)
            if (!contents) {
              return resolve({ ok: false, msg: "未找到对应的 webContents 实例" })
            }

            const cookies = await contents.session.cookies.get({ url: contents.getURL() })
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ")
            resolve({
              ok: true,
              msg: "获取 Cookies 成功",
              data: {
                cookieString: cookieStr,
                cookies: cookies
              }
            })
          } catch (err) {
            resolve({ ok: false, msg: `获取 Cookies 失败: ${err.message}` })
          }
        })

      case "getHTMLWithFrames":
        return new Promise(async (resolve) => {
          let sockets = []
          if (io.fetchSockets) {
            sockets = await io.fetchSockets()
          } else if (io.sockets && io.sockets.sockets) {
            sockets = Array.from(io.sockets.sockets.values())
          }

          if (sockets.length === 0) {
            return resolve({ ok: false, msg: "未检测到已连接的客户端" })
          }

          const tracker = DispatchTracker.create(15000)

          io.emit("app:dispatch", {
            appId: app.id,
            action: "getWebContentsId",
            args,
            trackerId: tracker.id
          })

          const trackerRes = await tracker.promise
          if (!trackerRes.ok) {
            return resolve(trackerRes)
          }

          const { webContentsId } = trackerRes
          if (!webContentsId) {
            return resolve({ ok: false, msg: "未获取到 webContentsId" })
          }

          try {
            const contents = electron.webContents.fromId(webContentsId)
            if (!contents) {
              return resolve({ ok: false, msg: "未找到对应的 webContents 实例" })
            }

            const frames = contents.mainFrame.framesInSubtree
            const framePromises = frames.map(async (frame) => {
              try {
                const html = await frame.executeJavaScript("document.documentElement.outerHTML")
                return {
                  url: frame.url || (typeof frame.getURL === "function" ? frame.getURL() : ""),
                  isMain: frame.parent === null,
                  html
                }
              } catch (e) {
                return {
                  url: frame.url || (typeof frame.getURL === "function" ? frame.getURL() : "未知"),
                  isMain: frame.parent === null,
                  html: `<!-- 获取框架 HTML 失败 (Error: ${e.message || String(e)}) -->`
                }
              }
            })

            const frameResults = await Promise.all(framePromises)

            resolve({
              ok: true,
              msg: "获取多框架 HTML 成功",
              data: frameResults
            })
          } catch (err) {
            resolve({ ok: false, msg: `获取多框架 HTML 失败: ${err.message}` })
          }
        })

      case "navigate":
      case "getContent":
      case "getHTML":
      case "executeJS":
      case "click":
      case "type":
      case "pressKey":
      case "screenshot":
      case "scroll":
        // 核心优化：使用 DispatchTracker + fnCall 回传模式，彻底解决 Socket 回调丢失/挂起问题
        return new Promise(async (resolve) => {
          let sockets = []
          if (io.fetchSockets) {
            sockets = await io.fetchSockets()
          } else if (io.sockets && io.sockets.sockets) {
            sockets = Array.from(io.sockets.sockets.values())
          }

          if (sockets.length === 0) {
            return resolve({ ok: false, msg: "未检测到已连接的客户端" })
          }

          // 创建一个总的追踪器，任意一个窗口通过 fnCall 回传结果即可触发 resolve
          const tracker = DispatchTracker.create(30000)

          // 广播指令，附加 trackerId
          console.log(`[BrowserBackend] Broadcasting action: ${action} to appId: ${app.id} (Sockets: ${sockets.length})`);
          io.emit("app:dispatch", {
            appId: app.id,
            action,
            args,
            trackerId: tracker.id
          })

          // 等待追踪器结果 (可能是成功响应，也可能是 30s 超时)
          const result = await tracker.promise
          resolve(result)
        })

      default:
        return { ok: false, msg: "未知的操作" }
    }
  }
}
