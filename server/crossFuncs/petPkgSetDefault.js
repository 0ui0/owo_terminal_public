import comData from "../comData/comData.js"
import actorAction from "../tools/aiAsk/actorAction.js"

export default {
  name: "petPkgSetDefault",
  func: async ({ name }) => {
    try {
      if (!name) name = "default"

      await comData.data.edit((data) => {
        data.defaultPet = name

        data.playFaces = {
          current: "待机状态",
          index: 0,
          list: ["待机状态"]
        }
        data.faceAction = "smile"
      })


      return { ok: true, msg: `已切换角色包为: ${name}` }
    } catch (e) {
      console.error("[petPkgSetDefault] Failed:", e)
      return { ok: false, msg: e.message }
    }
  }
}
