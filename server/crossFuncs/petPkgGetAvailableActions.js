import actorAction from "../tools/aiAsk/actorAction.js"

export default {
  name: "petPkgGetAvailableActions",
  func: async () => {
    try {
      const actions = actorAction.getPlayFaces()
      return { ok: true, msg: "可用角色动作列表已加载", data: actions }
    } catch (e) {
      console.error("[petPkgGetAvailableActions] Failed:", e)
      return { ok: false, msg: e.message }
    }
  }
}
