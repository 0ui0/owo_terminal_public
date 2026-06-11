// Singleton data manager for the Terminal app
export default {
  instances: new Map(),
  tools: {},

  addTool(name, tool) { this.tools[name] = tool },
  add(key, value) { this[key] = value },

  onDispatch(msg, callback) {
    const instance = this.instances.get(msg.appId)
    if (instance && instance.onDispatch) {
      instance.onDispatch(msg, callback)
    } else {
      if (callback) callback({ ok: false, msg: "未找到运行中的终端实例" })
    }
  },

  registerInstances(appId, instanceInterface) {
    if (!this.instances.has(appId)) this.instances.set(appId, instanceInterface)
  },

  unregisterInstances(appId, commonData) {
    this.instances.delete(appId)
    if (commonData?.unregisterApp) commonData.unregisterApp(appId)
  }
}
