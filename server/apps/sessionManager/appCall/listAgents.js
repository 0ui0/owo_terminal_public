import comData from "../../../comData/comData.js"
import subAgents from "../../../tools/aiAsk/subAgents.js"
import archiveDb from "../../../db/archiveDb.js"
import Joi from "joi"

// 一次性扫描父列表中的容器消息，构建 targetSubListId -> agentName 映射
// 用于 subAgents 为空（如重启后）时仍能恢复会话名称
async function buildAgentNameMap() {
  const nameMap = {}
  try {
    if (archiveDb.tb_chat_messages) {
      const containers = await archiveDb.tb_chat_messages.findAll({
        where: { group: "childChatList" },
        attributes: ["ext"],
        raw: true
      })
      containers.forEach(c => {
        const ext = c.ext
        if (ext && ext.targetSubListId !== undefined && ext.agentName) {
          nameMap[ext.targetSubListId] = ext.agentName
        }
      })
    }
  } catch (err) {
    console.error("[listAgents] buildAgentNameMap failed:", err)
  }
  return nameMap
}

export default {
  name: "列出智能体会话",
  id: "listAgents",
  async fn(argObj, metaData) {
    try {
      const data = comData.data.get()
      const chatLists = data.chatLists || []
      const nameMap = await buildAgentNameMap()
      const sessions = chatLists
        .filter(l => l.id !== 0)
        .map(l => {
          const agent = subAgents.get(l.id)
          const parentAgent = subAgents.get(l.linkid)
          return {
            listId: l.id,
            name: l.name || (agent && agent.name) || nameMap[l.id] || `会话 ${l.id}`,
            parentId: l.linkid,
            parentName: parentAgent ? parentAgent.name : (l.linkid === 0 ? "主控AI" : null),
            running: !!agent,
            replying: !!l.replying
          }
        })
      return {
        ok: true,
        msg: `共 ${sessions.length} 个子智能体会话`,
        data: sessions
      }
    } catch (err) {
      console.error(err)
      return {
        ok: false,
        msg: "错误列出会话: " + err.message
      }
    }
  },
  joi: () => {
    return Joi.object({}).unknown(true)
  },
  getDoc: () => "列出所有子智能体会话（listId、名称、父级、运行状态），不含主控列表(id=0)"
}
