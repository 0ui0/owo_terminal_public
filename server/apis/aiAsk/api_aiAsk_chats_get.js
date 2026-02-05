import comData from "../../comData/comData.js"
import aiBasic from "../../tools/aiAsk/basic.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import { trs } from "../../tools/i18n.js"

export default async () => {
  return {
    path: "/api/aiAsk/chats/get",
    method: "get",
    handler: async (req, h) => {
      try {
        let output = {
          aiBasic: [],
          subAgents: [],
        }
        aiBasic.list.forEach((model, index) => {
          output.aiBasic[index] = {
            name: model.name,
            model: model.model,
            messages: model.messages
          }
        })
        Array.from(subAgents.getAll()).forEach((model, index) => {
          output.subAgents[index] = {
            name: model.name,
            model: model.model,
            messages: model.messages
          }
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