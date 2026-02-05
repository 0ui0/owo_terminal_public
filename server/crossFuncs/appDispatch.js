
import appManager from "../apps/appManager.js"

export default {
  name: "appDispatch",
  func: async (appId, action, args = {}) => {
    try {
      console.log(`[CrossFunc] AppDispatch: ${appId} -> ${action}`)

      const result = await appManager.dispatch(appId, action, args)

      if (result && result.error) {
        return { ok: false, msg: result.error }
      }
      return { ok: true, data: result }
    } catch (e) {
      console.error("[CrossFunc] AppDispatch Error:", e)
      return { ok: false, msg: e.message }
    }
  }
}
