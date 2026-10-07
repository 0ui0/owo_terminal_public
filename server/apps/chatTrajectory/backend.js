export default {
  async init(app, appManager) {
    app.data.lastRefresh = Date.now()
  },

  async dispatch({ app, action, args, appManager, io }) {
    if (action === "refresh") {
      app.data.lastRefresh = Date.now()
      return { ok: true, data: { time: app.data.lastRefresh } }
    }
    return { ok: false, msg: `Action ${action} not supported` }
  }
}
