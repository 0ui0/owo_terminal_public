import comData from "../comData/comData.js"

export default {
  name: "updateListConfig",
  func: async (listId, updates) => {
    try {
      if (typeof listId !== "number") {
        return { ok: false, msg: "Invalid listId" }
      }
      
      await comData.data.edit(async (data) => {
        let chatList = data.chatLists.find(l => l.id === listId)
        if (chatList) {
          // 合并覆盖
          Object.assign(chatList, updates)
        }
      })
      
      return { ok: true, msg: "配置同步成功" }
    } catch (err) {
      console.error("[updateListConfig] 报错:", err)
      return { ok: false, msg: err.message }
    }
  }
}
