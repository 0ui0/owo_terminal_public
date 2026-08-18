import subAgents from "../../tools/aiAsk/subAgents.js"
import { trs } from "../../tools/i18n.js"

export default async () => {
  return {
    path: "/api/aiAsk/asks/get",
    method: "get",
    handler: async (req, h) => {
      try {
        let output = []
        subAgents.getAll().forEach((agent, listId) => {
          output.push({
            name: agent.name,
            model: agent.model,
            listId: listId,
            asks: agent.asks
          })
        })

        return {
          ok: true,
          data: output
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
