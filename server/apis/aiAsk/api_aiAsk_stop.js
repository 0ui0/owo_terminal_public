import comData from "../../comData/comData.js"
import aiBasic from "../../tools/aiAsk/basic.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import { trs } from "../../tools/i18n.js"

export default async () => {
  return {
    path: "/api/aiAsk/stop",
    method: "get",
    handler: async (req, h) => {
      try {
        // Stop Main Agents
        aiBasic.list.forEach((model) => {
          model.stopRun()
        })

        // Stop Sub Agents
        for (const agent of subAgents.getAll().values()) {
          agent.stopRun();
        }

        return {
          ok: true,
          msg: trs("API/消息/已发送停止信号")
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