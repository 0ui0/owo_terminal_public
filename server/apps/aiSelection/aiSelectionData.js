
export default {
  instances: new Map(),
  pendingResolves: new Map(), // appId -> { resolve, reject }
  tools: {},

  addTool(name, tool) { this.tools[name] = tool },

  onDispatch(msg, callback) {
    const instance = this.instances.get(msg.appId)
    if (instance && instance.onDispatch) {
      instance.onDispatch(msg, callback)
    } else {
      if (callback) callback({ error: "Instance not found" })
    }
  },

  registerInstances(appId, instanceInterface) {
    if (!this.instances.has(appId)) this.instances.set(appId, instanceInterface)
  },

  unregisterInstances(appId, commonData) {
    this.instances.delete(appId)
    if (commonData && commonData.unregisterApp) commonData.unregisterApp(appId)

    // Clean up pending resolves if any
    if (this.pendingResolves.has(appId)) {
      const { resolve } = this.pendingResolves.get(appId)
      resolve({ error: "App closed without selection" })
      this.pendingResolves.delete(appId)
    }
  }
}
