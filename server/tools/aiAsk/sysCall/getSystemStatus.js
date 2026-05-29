import Joi from "joi"
import getMsgProtocalConfig from "../../../ioServer/ioApis/chat/getMsgProtocalConfig.js"
import comData from "../../../comData/comData.js"
import options from "../../../config/options.js"

export default {
  name: "获取系统状态",
  id: "getSystemStatus",

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const targetModel = context.aiAskInstance

    const aiList = await options.get("ai_aiList")
    const currentModelName = comData.data.get().currentModel
    const currentTokenConfig = aiList.find(m => m.name === currentModelName)

    const config = getMsgProtocalConfig({
      targetModel,
      listId,
      currentTokenConfig
    })

    return config.getExtraInfo()
  },

  joi() {
    return Joi.object({})
  },

  getDoc() {
    return "获取系统当前的运行状态、时间、活跃终端、活跃 App、网点图以及正在执行的任务清单。"
  }
}
