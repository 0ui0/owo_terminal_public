
export default {
  async init(app, appManager) {
    // Initial content
    app.data.lastRefresh = Date.now()
  },

  async dispatch({ app, action, args, appManager, io }) {
    if (action === "list") {
      const summary = appManager.getSummary()
      return { ok: true, data: summary }
    }

    if (action === "show") {
      const { targetId } = args
      if (!targetId) return { ok: false, msg: "缺少 targetId" }
      const targetApp = appManager.get(targetId)
      if (!targetApp) return { ok: false, msg: "实例不存在" }

      // 调用 launch，由于实例已存在，它会触发 GUI 唤醒（基于对 appManager 的改动）
      await appManager.launch(targetApp.type, { appId: targetId })
      return { ok: true }
    }

    if (action === "kill") {
      const { targetId } = args
      if (!targetId) return { ok: false, msg: "缺少 targetId" }

      const res = await appManager.close(targetId)
      if (res.ok) {
        return { ok: true }
      } else {
        return { ok: false, msg: res.msg }
      }
    }

    return { error: `Action ${action} not supported` }
  }
}
