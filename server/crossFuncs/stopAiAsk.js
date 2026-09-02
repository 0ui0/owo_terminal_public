import comData from "../comData/comData.js"
import subAgents from "../tools/aiAsk/subAgents.js"

export default {
  name: "stopAiAsk",
  func: async (listId) => {
    try {
      if (typeof listId !== "number") {
        return { ok: false, msg: "Invalid listId" }
      }

      // 只停止指定会话的智能体（暂停按钮仅作用于当前会话）
      const agent = subAgents.get(listId)
      if (agent) {
        agent.stopRun()
      }

      // 解除该会话所有挂起的工具确认：让后台 waitConfirm 也能立即收尾（防永久轮询泄漏），并清除界面残留的确认卡
      let cancelledCount = 0
      await comData.data.edit((data) => {
        const list = data.chatLists.find(l => l.id === listId)
        for (const cmd of list.confirmCmds) {
          if (cmd.confirm === "pending") {
            cmd.confirm = "no"
            cmd.comment = (cmd.comment ? cmd.comment + "\n" : "") + "用户点击暂停按钮取消了此确认"
            cancelledCount++
          }
        }
      })

      const baseMsg = "已发送停止信号"
      return {
        ok: true,
        msg: cancelledCount > 0 ? `${baseMsg}（已取消 ${cancelledCount} 个挂起确认）` : baseMsg
      }
    } catch (err) {
      console.error("[stopAiAsk] 报错:", err)
      return { ok: false, msg: err.message }
    }
  }
}
