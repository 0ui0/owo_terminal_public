
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
      if (callback) callback({ error: "Instance not found" })
    }
  },

  registerInstances(appId, instanceInterface) {
    if (this.instances.has(appId)) return
    this.instances.set(appId, instanceInterface)
  },

  unregisterInstances(appId, commonData) {
    if (this.instances) this.instances.delete(appId)
    if (commonData && commonData.unregisterApp) commonData.unregisterApp(appId)
  }
}
