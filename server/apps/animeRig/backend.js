export default {
  async init(app, appManager) {
    app.data.activeAction = "idle"
  },
  async destroy(app, appManager) {
    console.log("animeRig destroyed")
  },
  async dispatch({ app, action, args, appManager, io }) {
    if (action === "playAction") {
      app.data.activeAction = args.actionName
      io.emit("app:dispatch", { appId: app.id, action: "playAction", args: { actionName: args.actionName, expressionName: args.expressionName } })
      return { ok: true, msg: "指令已下发", data: null }
    }
    return { ok: false, msg: `不支持的操作: ${action}` }
  }
}
