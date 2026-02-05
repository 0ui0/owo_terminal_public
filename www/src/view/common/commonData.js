export default {
  // 导航列表，默认包含/chat路径
  navList: [
    {
      name: "喵终端",
      url: "/chat",
      icon: "chat",
      sizeRate: 1,
      power: 1,
      onBar: true
    },

  ],

  // 导航DOM引用
  navDom: null,

  // 版本信息
  version: "1.0.0",

  // 是否启用winMode
  navWinMode: false,

  // === App Registry (Added) ===
  appsData: {}, // appId -> [AppName]Data singleton

  registerApp(appId, appData) {
    this.appsData[appId] = appData
  },

  unregisterApp(appId) {
    delete this.appsData[appId]
  },

  // Project State
  currentProject: null
}