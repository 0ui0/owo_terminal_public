import comData from "../../comData/comData.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import archiveDb from "../../db/archiveDb.js"
import ioServer from "../../ioServer/ioServer.js"
import createAgent from "../../tools/aiAsk/sysCall/createAgent.js"

// 一次性扫描父列表中的容器消息，构建 targetSubListId -> agentName 映射
// 用于重启后 subAgents 为空时，仍能恢复会话名称（持久化兜底）
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
    console.error("[sessionManager] buildAgentNameMap failed:", err)
  }
  return nameMap
}

function getSessionName(list, agent, nameMap) {
  if (list.id === 0) return list.name || "主会话"
  if (list.name) return list.name
  if (agent && agent.name) return agent.name
  if (nameMap[list.id]) return nameMap[list.id]
  return `会话 ${list.id}`
}

export default {
  async init(app, appManager) {
    app.data.lastRefresh = Date.now()
  },

  async dispatch({ app, action, args, appManager, io }) {
    try {
      if (action === "list") {
        const data = comData.data.get()
        const chatLists = data.chatLists || []
        const nameMap = await buildAgentNameMap()
        const sessions = chatLists
          .map(l => {
            const agent = subAgents.get(l.id)
            const parentAgent = subAgents.get(l.linkid)
            return {
              listId: l.id,
              name: getSessionName(l, agent, nameMap),
              parentId: l.linkid,
              parentName: parentAgent ? parentAgent.name : (l.linkid === 0 ? "主控AI" : null),
              replying: !!l.replying,
              running: l.id === 0 ? true : !!agent
            }
          })
        return { ok: true, data: sessions, msg: "列出会话成功" }
      }

      if (action === "show") {
        const { listId } = args
        if (listId === undefined) return { ok: false, msg: "缺少 listId" }
        const data = comData.data.get()
        const target = (data.chatLists || []).find(l => l.id === listId)
        if (!target) return { ok: false, msg: `会话 ${listId} 不存在` }
        const agent = subAgents.get(listId)
        const nameMap = await buildAgentNameMap()
        const name = getSessionName(target, agent, nameMap)
        if (ioServer.io) ioServer.io.emit("agentWindow:open", { listId, name })
        return { ok: true, msg: `已唤起会话「${name}」` }
      }

      if (action === "create") {
        const { name, prompt, parentId, modelId } = args
        if (!name || !name.trim()) return { ok: false, msg: "缺少会话名称" }
        const checkParentId = Number(parentId) || 0
        if (checkParentId !== 0) {
          const data = comData.data.get()
          const parentExists = (data.chatLists || []).some(l => l.id === checkParentId)
          if (!parentExists) return { ok: false, msg: `父级会话 ${checkParentId} 不存在` }
        }

        const createArgs = {
          name: name.trim(),
          prompt: (prompt && prompt.trim()) || "你是子智能体，请协助主控AI完成任务。",
          noAutoOpen: false
        }

        if (modelId) {
          createArgs.derivedFromModelId = modelId
        }

        const result = await createAgent.fn.call(createAgent, createArgs, {
          listId: parentId || 0
        })
        return result
      }

      if (action === "del") {
        const { listId } = args
        if (listId === undefined) return { ok: false, msg: "缺少 listId" }
        if (listId === 0) return { ok: false, msg: "不能删除主会话" }

        // 1. 终止运行中的子智能体实例
        subAgents.remove(listId)

        // 2. 从 chatLists 移除（edit 会自动同步前端）
        await comData.data.edit(data => {
          if (data.chatLists) {
            data.chatLists = data.chatLists.filter(l => l.id !== listId)
          }
        })

        // 3. 只删除该会话自身的消息记录（不动父列表容器消息，防止缓存穿透）
        if (archiveDb.tb_chat_messages) {
          await archiveDb.tb_chat_messages.destroy({ where: { chatListId: listId } })
        }

        return { ok: true, msg: `已删除会话 ${listId}` }
      }

      return { ok: false, msg: `Action ${action} not supported` }
    } catch (err) {
      console.error("[sessionManager] dispatch error:", err)
      return { ok: false, msg: "会话管理器内部错误: " + err.message }
    }
  }
}
