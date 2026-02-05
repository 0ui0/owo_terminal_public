
import appManager from "../apps/appManager.js"
import projectManager from "../managers/projectManager.js"

export default {
  name: "appUpdateData",
  func: async (appId, dataUpdate) => {
    try {
      const app = appManager.get(appId)
      if (app) {
        if (!app.data) app.data = {}
        // Shallow merge updates
        Object.assign(app.data, dataUpdate)
        projectManager.markDirty()
        return { ok: true }
      }
      return { ok: false, msg: "App not found" }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
