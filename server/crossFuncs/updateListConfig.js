import comData from "../comData/comData.js"
import lspManager from "../tools/lsp/LspServerManager.js"

export default {
  name: "updateListConfig",
  func: async (listId, updates) => {
    try {
      if (typeof listId !== "number") {
        return { ok: false, msg: "Invalid listId" }
      }

      if (comData.data?.edit) {
        await comData.data.edit(async (data) => {
          let chatList = data.chatLists.find(l => l.id === listId)
          if (chatList) {
            // 合并覆盖
            Object.assign(chatList, updates)
          }
        })
      }

      // 联动 LSP：如果更新了工作目录列表 (完全异步物理隔离，绝不影响主流程)
      if (Array.isArray(updates.workDirs)) {
        (async () => {
          try {
            const allChatLists = comData.data?.get?.()?.chatLists || []
            const activeDirs = []
            for (const list of allChatLists) {
              if (Array.isArray(list.workDirs)) {
                for (const d of list.workDirs) {
                  if (d?.path) activeDirs.push(d.path)
                }
              }
            }

            // 1. 清除除用户当前所有有效目录之外的所有残留 LSP 实例与缓存
            await lspManager.retainOnlyWorkspaces(activeDirs).catch(e => {
              console.warn("[updateListConfig] retainOnlyWorkspaces 安全降级:", e)
            })
          } catch (sideEffectErr) {
            console.warn("[updateListConfig] LSP 后台副作用异常（已安全隔离）:", sideEffectErr)
          }
        })()
      }

      return { ok: true, msg: "配置同步成功" }
    } catch (err) {
      console.error("[updateListConfig] 报错:", err)
      return { ok: false, msg: err.message }
    }
  }
}
