import Joi from "joi"

export default {
  name: "五子棋_查看棋盘",
  id: "aiGomokuGetBoard",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId } = value

    const appManager = (await import("../../../apps/appManager.js")).default
    const res = await appManager.dispatch(appId, "getBoard", {})
    
    if (!res || res.error) {
       return `获取状态失败: ${res?.error || "未知原因"}`
    }
    return `当前棋盘状态:\n${res.boardStr}\n${res.gameOver ? `游戏结束，获胜者: ${res.winner}` : `当前轮到玩家: ${res.currentPlayer === 1 ? "1(黑子X)" : "2(白子O)"}`}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("应用 ID (如 gomoku2_xxx)")
    })
  },

  getDoc() {
    return `获取指定五子棋游戏最后落子信息以及棋盘局面。这在用户通过聊天窗口直接让你开始对战时非常有用。`
  }
}
