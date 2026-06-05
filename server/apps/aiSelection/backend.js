
import aiSelectionData from "./aiSelectionData.js"

export default {
  async init(app, appManager) {
    // Initial data from AI is stored in app.data (passed via launch args)
    // No special init needed
  },

  async destroy(app, appManager) {
    // 强制清理未决的 Promise，防止强行关闭窗口导致流程挂起
    if (aiSelectionData.pendingResolves.has(app.id)) {
      const { resolve } = aiSelectionData.pendingResolves.get(app.id)
      resolve({ ok: true, canceled: true })
      aiSelectionData.pendingResolves.delete(app.id)
    }
  },

  async dispatch({ app, action, args, appManager, io }) {
    try {
      if (action === "select") {
        const { value, comment } = args
        console.log("[aiSelection backend] select action called with args:", args)

        // Resolve the pending AI promise
        if (aiSelectionData.pendingResolves.has(app.id)) {
          const { resolve } = aiSelectionData.pendingResolves.get(app.id)
          resolve({ ok: true, selected: value, comment })
          aiSelectionData.pendingResolves.delete(app.id)
        }

        // Close the dialog asynchronously
        appManager.close(app.id).catch(err => console.error("Close aiSelection error:", err))
        return {
          ok: true,
          msg: "操作选择成功"
        }
      }

      if (action === "cancel") {
        const { comment } = args

        // Resolve the pending AI promise as canceled
        if (aiSelectionData.pendingResolves.has(app.id)) {
          const { resolve } = aiSelectionData.pendingResolves.get(app.id)
          resolve({ ok: true, canceled: true, comment })
          aiSelectionData.pendingResolves.delete(app.id)
        }

        // Close the dialog asynchronously
        appManager.close(app.id).catch(err => console.error("Close aiSelection error:", err))
        return {
          ok: true,
          msg: "取消选择成功"
        }
      }

      return {
        ok: false,
        msg: `操作 ${action} 不支持`
      }
    } catch (err) {
      console.log(err)
      return {
        ok: false,
        msg: `服务器内部错误: ${err.message}`
      }
    }
  }
}
