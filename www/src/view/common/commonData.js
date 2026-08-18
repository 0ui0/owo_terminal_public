import Notice from "./notice.js"

export default {
  // 导航列表，默认包含/chat路径
  navList: [
    {
      name: "喵终端",
      url: "/chat",
      icon: "chat",
      sizeRate: 1,
      power: 1,
      onBar: true,
      onClick: (e) => {
        Notice.toggleMinimizeAll()
        if (m.route.get() !== "/chat") {
          ROUTE.set("/chat")
        }
      }
    },

  ],

  // 导航DOM引用
  navDom: null,

  // 版本信息
  version: "1.0.0",

  // 是否启用winMode
  navWinMode: false,

  // Update Status
  updateStatus: {
    state: "idle", // idle, checking, available, downloading, downloaded, error, up-to-date
    progress: 0,
    msg: ""
  },

  // === App Registry (Added) ===
  appsData: {}, // appId -> [AppName]Data singleton

  registerApp(appId, appData) {
    this.appsData[appId] = appData
  },

  unregisterApp(appId) {
    delete this.appsData[appId]
  },

  // Project State
  currentProject: null,
  autoSaveEnabled: false,
  autoSaveInterval: 5,

  // 主题颜色
  themeColor: 2,

  // 全局按键状态（快捷键系统维护，供各组件读取当前按下的键）
  pressKeys: [],
}