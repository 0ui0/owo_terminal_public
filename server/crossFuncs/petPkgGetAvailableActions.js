import actorAction from "../tools/aiAsk/actorAction.js"

export default {
  name: "petPkgGetAvailableActions",
  func: async () => {
    try {
      const actions = actorAction.getPlayFaces()
      return { ok: true, data: actions }
    } catch (e) {
      console.error("[petPkgGetAvailableActions] Failed:", e)
      return { ok: false, msg: e.message }
    }
  }
}
