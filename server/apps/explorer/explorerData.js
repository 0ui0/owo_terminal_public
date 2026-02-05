
export default {
  // 单例注册表，懒加载初始化
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

    let commonData = this.tools["commonData"] //如果要用

    if (this.instances.has(appId)) {
      console.warn(`Explorer实例${appId}已注册`)
      return
    }

    this.instances.set(appId, instanceInterface)

    //对外暴露公共接口不是写在这里，这个data本来就有暴露到commonData，所以根本不用
    //公共接口直接外部编辑这个文件，给这个文件注入，比如explorerData.onDispatch = xxx
    //或者调用add方法

  },

  // 注销实例
  unregisterInstances(appId, commonData) {
    if (this.instances) {
      this.instances.delete(appId)
    }
  }
}
