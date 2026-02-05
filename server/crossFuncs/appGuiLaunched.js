
import appManager from "../apps/appManager.js"

export default {
  name: "appGuiLaunched",
  func: async (appId) => {
    try {
      if (appManager) {
        appManager.onGuiLaunched(appId)
        console.log(`[CrossFunc] App GUI launched: ${appId}`)
        return { ok: true }
      }
      return { ok: false, msg: "AppManager not ready" }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
