import Joi from "joi"
import comData from "../../../comData/comData.js"

export default {
  name: "连接网点",
  id: "graphLink",

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const { links } = argObj

    await comData.data.edit((data) => {
      const graph = data.chatLists[listId].graph
      if (links) {
        links.forEach(link => {
          if (graph.nodes[link.from] && graph.nodes[link.to]) {
            const exists = graph.links.some(l => l.from === link.from && l.to === link.to)
            if (!exists) {
              graph.links.push({ from: link.from, to: link.to })
            }
          }
        })
      }
    })

    return "连线更新成功"
  },

  joi() {
    return Joi.object({
      links: Joi.array().items(Joi.object({
        from: Joi.string().required().description("源网点id"),
        to: Joi.string().required().description("目标网点id")
      })).required()
    })
  },

  getDoc() {
    return "批量连接网点"
  }
}
