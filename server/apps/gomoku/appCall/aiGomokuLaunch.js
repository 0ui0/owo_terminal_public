import Joi from "joi"
import appLaunch from "../../../crossFuncs/appLaunch.js"

export default {
  name: "五子棋_启动",
  id: "aiGomokuLaunch",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const launchRes = await appLaunch.func("gomoku2", { 
      data: { 
        gameState: { gameMode: 'ai' } 
      } 
    })
    if (launchRes && launchRes.ok) {
      const id = launchRes.app.id
      return `五子棋已启动 (ID: ${id})。请将此 ID 传递给后续的五子棋操作工具。你可以使用 aiGomokuWait 等待玩家落第一个子，或者直接使用 aiGomokuMove 落子。`
    } else {
      return `启动五子棋失败: ${String(launchRes?.msg || "未知错误")}`
    }
  },

  joi() {
    return Joi.object({})
  },

  getDoc() {
    return `主动与用户开启一局新的五子棋游戏。启动后，你会获得一个 appId，请在后续使用 aiGomoku 系列工具时使用该 appId。`
  }
}
