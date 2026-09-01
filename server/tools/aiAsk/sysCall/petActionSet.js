import Joi from "joi"
import comData from "../../../comData/comData.js"

export default {
  name: "设置你的动作与表情",
  id: "petActionSet",

  async fn(argObj, context) {
    const { playFace, faceAction } = argObj

    let changed = []
    await comData.data.edit((data) => {
      if (playFace !== undefined) {
        data.playFaces.current = playFace
        changed.push(`动作(playFace): ${playFace}`)
      }
      if (faceAction !== undefined) {
        data.faceAction = faceAction
        changed.push(`表情(faceAction): ${faceAction}`)
      }
    })

    return {
      ok: true,
      msg: changed.length > 0 ? `已更新你的状态：${changed.join(", ")}` : "未传入有效变更项",
      current: { playFace, faceAction }
    }
  },

  joi() {
    return Joi.object({
      playFace: Joi.string().description("可选 你要播放的动作动效名称（动态视频 WebM，如：待机状态、微笑、傲娇坏笑等）"),
      faceAction: Joi.string().description("可选 你要展现的静态表情名称（图片 PNG，如：none、smile、angry 等）")
    }).or("playFace", "faceAction")
  },

  getDoc() {
    return "单独或同时设置你当前的动作动效(playFace)或静态表情(faceAction)。"
  }
}
