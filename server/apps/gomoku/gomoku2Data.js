// 五子棋2数据层 - 共享数据管理

const instancesMap = new Map()
const pendingResolves = new Map() // appId -> resolve function

const gomoku2Data = {
  // 工具引用
  tools: {},

  // 添加工具引用
  addTool(name, tool) {
    this.tools[name] = tool
  },

  // 获取工具
  getTool(name) {
    return this.tools[name]
  },

  // 注册实例
  registerInstances(appId, interfaceMethods) {
    instancesMap.set(appId, interfaceMethods)
  },

  // 注销实例
  unregisterInstances(appId, commonData) {
    if (commonData && commonData.unregisterApp) {
      commonData.unregisterApp(appId)
    }
    instancesMap.delete(appId)
    pendingResolves.delete(appId)
  },

  // 获取实例接口
  getInstanceInterface(appId) {
    return instancesMap.get(appId)
  },

  // 获取所有实例
  getAllInstances() {
    return Array.from(instancesMap.entries())
  },

  // AI 工具使用此方法等待状态更新（例如玩家落子后）
  waitForUpdate(appId, timeoutMs = 300000) { // 默认等待 5 分钟
    return new Promise((resolve, reject) => {
      let timeoutId;
      
      const wrappedResolve = (data) => {
        if (timeoutId) clearTimeout(timeoutId)
        resolve(data)
      }
      
      pendingResolves.set(appId, wrappedResolve)
      
      // 设置超时机制，防止用户离开导致 AI 一直挂起
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (pendingResolves.has(appId) && pendingResolves.get(appId) === wrappedResolve) {
            pendingResolves.delete(appId)
            reject(new Error(`等待玩家落子超时 (${timeoutMs / 1000}s)`))
          }
        }, timeoutMs)
      }
    })
  },

  // 应用后端/前端使用此方法触发 AI 等待的 resolve
  resolveUpdate(appId, data) {
    const resolve = pendingResolves.get(appId)
    if (resolve) {
      resolve(data)
      pendingResolves.delete(appId)
      return true
    }
    return false
  },

  // 广播消息到所有实例
  broadcast(action, args) {
    for (const [appId, iface] of instancesMap) {
      if (iface && iface.onDispatch) {
        iface.onDispatch({ action, args })
      }
    }
  },

  // 清理所有数据
  clear() {
    instancesMap.clear()
    pendingResolves.clear()
    this.tools = {}
  }
}

export default gomoku2Data
