import Joi from "joi"
import comData from "../../../comData/comData.js"
import idTool from "../../idTool.js"

export default {
  name: "新增网点",
  id: "graphAdd",

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const { nodes, links } = argObj

    const newNodes = []
    const labelToId = {}
    const addedLinks = []

    await comData.data.edit((data) => {
      const graph = data.chatLists[listId].graph
      // 1. 先创建节点
      if (nodes) {
        nodes.forEach(node => {
          const id = idTool.get("node")
          const nodeData = {
            id,
            label: node.label,
            state: node.state ?? "待查",
            x: Math.floor(Math.random() * 500),
            y: Math.floor(Math.random() * 500)
          }
          graph.nodes[id] = nodeData
          labelToId[node.label] = id
          newNodes.push({ id, label: node.label })
        })
      }

      // 2. 处理连线
      if (links) {
        links.forEach(link => {
          // 解析 from 和 to，优先匹配本次新增的 label，否则视为已有 id
          const fromId = labelToId[link.from] || link.from
          const toId = labelToId[link.to] || link.to

          // 验证两个端点是否存在
          if (graph.nodes[fromId] && graph.nodes[toId]) {
            const exists = graph.links.some(l => l.from === fromId && l.to === toId)
            if (!exists) {
              graph.links.push({ from: fromId, to: toId })
              addedLinks.push({ from: fromId, to: toId })
            }
          }
        })
      }
    })

    return JSON.stringify({
      msg: "批量操作成功",
      addedNodes: newNodes,
      addedLinks: addedLinks
    })
  },

  joi() {
    return Joi.object({
      nodes: Joi.array().items(Joi.object({
        label: Joi.string().required().description("显示文本"),
        state: Joi.string().valid("待查", "已验", "存疑").description("状态"),
      })).description("批量新增的网点"),
      links: Joi.array().items(Joi.object({
        from: Joi.string().required().description("源网点ID 或 本次新增网点的label"),
        to: Joi.string().required().description("目标网点ID 或 本次新增网点的label")
      })).description("可选：在新增网点的同时建立连线。可以使用新节点的label作为连接标识。")
    })
  },

  getDoc() {
    return "在网点图新增网点"
  }
}
