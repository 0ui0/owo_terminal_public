
import aiSelectionData from "./aiSelectionData.js"

export default {
  async init(app, appManager) {
    // Initial data from AI is stored in app.data (passed via launch args)
    // No special init needed
  },

  async dispatch({ app, action, args, appManager, io }) {
    if (action === "select") {
      const { value } = args

      // Resolve the pending AI promise
      if (aiSelectionData.pendingResolves.has(app.id)) {
        const { resolve } = aiSelectionData.pendingResolves.get(app.id)
        resolve({ ok: true, selected: value })
        aiSelectionData.pendingResolves.delete(app.id)
      }

      // Close the dialog asynchronously
      appManager.close(app.id).catch(err => console.error("Close aiSelection error:", err))
      return { ok: true }
    }

    return { error: `Action ${action} not supported` }
  }
}
