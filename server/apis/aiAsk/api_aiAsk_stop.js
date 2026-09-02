import comData from "../../comData/comData.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import { trs } from "../../tools/i18n.js"

export default async () => {
  return {
    path: "/api/aiAsk/stop",
    method: "get",
    handler: async (req, h) => {
      try {
        // Stop Sub Agents
        for (const agent of subAgents.getAll().values()) {
          agent.stopRun();
        }

        // 解除所有挂起的工具确认：让后台 waitConfirm 也能立即收尾（防永久轮询泄漏），并清除界面残留的确认卡
        let cancelledCount = 0
        await comData.data.edit((data) => {
          const lists = data.chatLists || []
          for (const list of lists) {
            if (Array.isArray(list.confirmCmds)) {
              for (const cmd of list.confirmCmds) {
                if (cmd.confirm === "pending") {
                  cmd.confirm = "no"
                  cmd.comment = (cmd.comment ? cmd.comment + "\n" : "") + "用户点击暂停按钮取消了此确认"
                  cancelledCount++
                }
              }
            }
          }
        })

        return {
          ok: true,
          msg: trs("API/消息/已发送停止信号") + (cancelledCount > 0 ? `（已取消 ${cancelledCount} 个挂起确认）` : "")
        }
      }
      catch (err) {
        console.log(err)
        return {
          ok: false,
          msg: trs("API/错误/服务器内部错误")
        }
      }

    }
  }
}