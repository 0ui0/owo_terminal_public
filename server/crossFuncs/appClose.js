import appManager from "../apps/appManager.js"

export default {
  name: "appClose",
  async func(appId) {
    if (!appId) return { ok: false, msg: "缺少 appId" }
    console.log(`[CrossFunc] AppClose: terminating ${appId}`)
    return await appManager.close(appId)
  }
}
