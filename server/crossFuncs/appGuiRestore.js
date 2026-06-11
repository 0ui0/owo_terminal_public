import appManager from "../apps/appManager.js"
import ioServer from "../ioServer/ioServer.js"

export default {
  name: "appGuiRestore",
  func: async (appId) => {
    try {
      const app = appManager.get(appId)
      if (!app) return { ok: false, msg: "App 实例不存在" }

      const appDef = appManager.appDefs.get(app.type)
      if (!appDef) return { ok: false, msg: "App 定义未找到" }

      if (ioServer.io) {
        ioServer.io.emit("app:launch", {
          appId,
          type: app.type,
          name: appDef.name,
          icon: appDef.icon,
          frontendUrl: `/api/apps/${app.type}/frontend.js?t=${Date.now()}`,
          window: appDef.window,
          data: app.data
        })
        return { ok: true, msg: "已重构 GUI 窗口" }
      }
      return { ok: false, msg: "Socket server not initialized" }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
