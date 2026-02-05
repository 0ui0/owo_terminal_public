
export default {
  // 单例注册表
  instances: new Map(),
  tools: {},
  addTool(name, tool) {
    this.tools[name] = tool
  },
  add(key, value) {
    this[key] = value
  },

  // 消息分发路由
  onDispatch(msg, callback) {
    const instance = this.instances.get(msg.appId)
    if (instance && instance.onDispatch) {
      instance.onDispatch(msg, callback)
    } else {
      if (callback) callback({ error: "Instance not found or missing onDispatch" })
    }
  },

  // 注册实例
  registerInstances(appId, instanceInterface) {
    if (this.instances.has(appId)) {
      console.warn(`Browser instance ${appId} already registered.`)
      return
    }
    this.instances.set(appId, instanceInterface)
  },

  // 注销实例
  unregisterInstances(appId, commonData) {
    if (this.instances) {
      this.instances.delete(appId)
    }
    if (commonData && commonData.unregisterApp) {
      commonData.unregisterApp(appId)
    }
  }
}
