import aiBasic from "../../tools/aiAsk/basic.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
export default async () => {
  return {
    path: "/api/aiAsk/asks/get",
    method: "get",
    handler: async (req, h) => {
      try {
        let output = []
        aiBasic.list.forEach((model, index) => {
          output.push({
            name: model.name,
            model: model.model,
            listId: 0,
            asks: model.asks
          })
        })

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
          msg: "服务器内部错误"
        }
      }
    }
  }
}
