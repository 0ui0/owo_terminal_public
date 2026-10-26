export default {
  async init(app, appManager) {
    app.data = {
      clickThrough: false,
      currentAction: "",
      ...app.data
    }
    console.log(`[DesktopPet] 桌面角色初始化完成: ${app.id}`)
  },

  async dispatch({ app, action, args, callback, io, appManager }) {
    switch (action) {
      case "getState":
        if (callback) callback({ ok: true, data: app.data })
        break
      case "setClickThrough":
        app.data.clickThrough = Boolean(args && args[0])
        if (callback) callback({ ok: true, clickThrough: app.data.clickThrough })
        break
      default:
        if (callback) callback({ ok: false, msg: `未知指令: ${action}` })
    }
  },

  async destroy(app, appManager) {
    console.log(`[DesktopPet] 桌面角色销毁: ${app.id}`)
  }
}
