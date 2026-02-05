import comData from "../../comData/comData.js"
import aiBasic from "../../tools/aiAsk/basic.js"
import subAgents from "../../tools/aiAsk/subAgents.js"

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
          msg: "以发送停止信号"
        }
      }
      catch (err) {
        console.log(err)
        return {
          ok: false,
          msg: "服务器内部错误"
        }
      }

    }
  }
}