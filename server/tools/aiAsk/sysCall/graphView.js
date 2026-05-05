import Joi from "joi"
import comData from "../../../comData/comData.js"
import yaml from "js-yaml"

export default {
  name: "查看全量网点",
  id: "graphView",

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const graph = comData.data.get().chatLists[listId].graph

    if (!graph || Object.keys(graph.nodes).length === 0) {
      return "当前网点图为空喵！"
    }

    const allDetails = {}
    for (let id in graph.nodes) {
      const node = graph.nodes[id]
      allDetails[id] = {
        label: node.label,
        state: node.state
      }
    }

    return yaml.dump(allDetails)
  },

  joi() {
    return Joi.object({})
  },

  getDoc() {
    return "获取当前所有网点的全量概览（ID、标签、状态）。"
  }
}
