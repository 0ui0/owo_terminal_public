import appManager from "../apps/appManager.js"
import comData from "../comData/comData.js"

/**
 * 确定性自动化判定工具是否具备 waitConfirm 拦截机制
 * 1. 优先遵循工具显式声明的 hasConfirm 属性
 * 2. 精确基于系统工具标准执行体 tool.fn 进行 V8 函数反射嗅探
 */
const isWaitConfirmTool = (tool) => {
  if (!tool) return false
  if (typeof tool.hasConfirm === "boolean") return tool.hasConfirm
  return typeof tool.fn === "function" && tool.fn.toString().includes("waitConfirm")
}

export default {
  name: "getToolsList",
  func: async (listId = 0) => {
    try {
      const chatList = comData.data.get()?.chatLists?.find(l => l.id === listId) || { toolsMode: 5 }
      const toolsMode = chatList.toolsMode ?? 5

      const allTools = appManager.getTools() || []

      // 1. 基础可见性过滤（遵循 toolsMode 和 hidden 规则）
      const visibleTools = toolsMode === 3
        ? allTools
        : allTools.filter((tool) => {
          const isHidden = typeof tool.hidden === 'function' ? tool.hidden(toolsMode) : !!tool.hidden
          return !isHidden
        })

      // 2. 自动化嗅探：仅保留真正具备 waitConfirm 拦截能力的工具
      const confirmableTools = visibleTools.filter(isWaitConfirmTool)

      const data = confirmableTools.map(t => ({
        id: t.id,
        name: t.name || t.id,
        type: t.type || "sysCall",
        doc: typeof t.getDoc === "function" ? t.getDoc() : (t.description || "")
      }))

      return { ok: true, msg: "获取支持免确认工具列表成功", data }
    } catch (err) {
      console.error("[getToolsList] 报错:", err)
      return { ok: false, msg: err.message, data: [] }
    }
  }
}
