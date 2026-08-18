/* quickOpenData.js - Singleton Data Manager */
// 遵循 owo-terminal App 开发指南规范

export default {
  instances: new Map(), // 活跃实例注册表
  tools: {},            // 注入工具箱

  // 依赖注入接口
  addTool(name, tool) { this.tools[name] = tool },
  add(key, value) { this[key] = value },

  // 核心路由：ioSocket -> Singleton -> Instance
  onDispatch(msg, callback) {
    const instance = this.instances.get(msg.appId)
    if (instance && instance.onDispatch) {
      instance.onDispatch(msg, callback)
    } else {
      if (callback) callback({ ok: false, msg: "未找到运行中的 quickOpen 实例" })
    }
  },

  // 实例生命周期管理
  registerInstances(appId, instanceInterface) {
    if (!this.instances.has(appId)) this.instances.set(appId, instanceInterface)
  },
  unregisterInstances(appId, commonData) {
    this.instances.delete(appId)
    if (commonData?.unregisterApp) commonData.unregisterApp(appId)
  }
}
