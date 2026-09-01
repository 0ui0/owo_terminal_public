import Joi from "joi"
import actorAction from "../actorAction.js"

export default {
  name: "获取可用动作与表情",
  id: "petActionGet",

  async fn(argObj, context) {
    const playFaces = actorAction.getPlayFaces()
    const faceActions = actorAction.getFaceActions()

    return {
      playFaces,    // 你可用的动作动效列表（动态视频 WebM，对应 playFace 字段）
      faceActions   // 你可用的静态表情列表（静态图片 PNG，对应 faceAction 字段）
    }
  },

  joi() {
    return Joi.object({})
  },

  getDoc() {
    return "获取你当前可用的动作动效视频 playFace 与静态表情 faceAction 列表。"
  }
}
