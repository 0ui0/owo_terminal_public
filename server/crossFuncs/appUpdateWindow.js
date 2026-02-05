import appManager from "../apps/appManager.js"
import projectManager from "../managers/projectManager.js"

export default {
  name: "appUpdateWindow",
  func: async (appId, windowRect) => {
    try {
      const app = appManager.get(appId)
      if (app) {
        if (!app.data) app.data = {}
        if (!app.data.window) app.data.window = {}
        Object.assign(app.data.window, windowRect)
        projectManager.markDirty()
        return { ok: true }
      }
      return { ok: false, msg: "App not found" }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
