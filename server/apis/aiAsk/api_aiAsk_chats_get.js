import comData from "../../comData/comData.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import { trs } from "../../tools/i18n.js"

export default async () => {
  return {
    path: "/api/aiAsk/chats/get",
    method: "get",
    handler: async (req, h) => {
      try {
        let chatList = [];
        for (const [id, model] of subAgents.getAll()) {
          chatList.push({
            name: model.name,
            listId: id,
            model: model.model,
            messages: model.messages
          });
        }
        
        chatList.sort((a, b) => a.listId - b.listId);
        return {
          ok: true,
          data: chatList
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