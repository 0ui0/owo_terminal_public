/* qqBotData.js - Singleton Data Manager */
export default {
  instances: new Map(),
  tools: {},

  addTool(name, tool) { this.tools[name] = tool; },

  /**
   * 核心路由：ioSocket -> Singleton -> Instance
   */
  onDispatch(msg, callback) {
    try {
      // 转发给前端实例
      const instance = this.instances.get(msg.appId);
      if (instance && instance.onDispatch) {
        instance.onDispatch(msg, callback);
      } else {
        if (callback) callback({ ok: true, msg: "OK" });
      }
    } catch (err) {
      console.error("[qqBotData] 调度失败:", err);
      if (callback) callback({ ok: false, msg: err.message });
    }
  },

  registerInstances(appId, instanceInterface) {
    if (!this.instances.has(appId)) this.instances.set(appId, instanceInterface);
  },

  unregisterInstances(appId, commonData) {
    this.instances.delete(appId);
    if (commonData?.unregisterApp) commonData.unregisterApp(appId);
  }
};
