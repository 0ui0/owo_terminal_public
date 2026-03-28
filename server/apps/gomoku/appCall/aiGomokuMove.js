import Joi from "joi"
import comData from "../../../comData/comData.js"
import aiBasic from "../../../tools/aiAsk/basic.js"
import subAgents from "../../../tools/aiAsk/subAgents.js"

export default {
  name: "五子棋_落子",
  id: "aiGomokuMove",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, x, y } = value

    const appManager = (await import("../../../apps/appManager.js")).default
    const res = await appManager.dispatch(appId, "move", { x, y })

    if (!res || !res.success) {
      return `落子失败: ${res?.message || res?.error || "未知原因"}`
    }
    // 切断模型后续对话生成，避免重复罗嗦 "我已经落子了"
    const targetListId = comData.data.get().targetChatListId || 0
    let targetModel = targetListId > 0 ? subAgents.get(targetListId) : aiBasic.list.find((model) => model.name === comData.data.get().currentModel)
    if (targetModel) {
      targetModel.stopRun()
    }

    if (!res.gameOver) {
      return `[OK]`
    } else {
      return `[游戏结束] ${res.message}`
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("应用 ID (如 gomoku2_xxx)"),
      x: Joi.number().min(0).max(14).required().description("落子横坐标 (0-14)"),
      y: Joi.number().min(0).max(14).required().description("落子纵坐标 (0-14)")
    })
  },

  getDoc() {
    return `五子棋落子专用工具。指定 x 和 y 以在棋盘上放置你的棋子。`
  }
}
