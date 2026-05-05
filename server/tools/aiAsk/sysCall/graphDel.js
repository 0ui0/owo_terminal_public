import Joi from "joi"
import comData from "../../../comData/comData.js"

export default {
  name: "删除网点",
  id: "graphDel",

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const { ids } = argObj

    await comData.data.edit((data) => {
      const graph = data.chatLists[listId].graph
      ids.forEach(id => {
        delete graph.nodes[id]
        graph.links = graph.links.filter(link => link.from !== id && link.to !== id)
      })
    })

    return "网点及关联连线已删除"
  },

  joi() {
    return Joi.object({
      ids: Joi.array().items(Joi.string()).required().description("网点ID列表")
    })
  },

  getDoc() {
    return "从网点图删除网点。"
  }
}
