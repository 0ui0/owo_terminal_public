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

  // Message Inbox
  messages: [],
  pushMessage(msg) {
    msg.timestamp = Date.now()
    if (msg.tag && msg.merge === "cover") {
      const existingIndex = this.messages.findIndex(m => m.tag === msg.tag)
      if (existingIndex > -1) {
        // 原地覆盖旧的相同 tag 消息
        this.messages[existingIndex] = { ...this.messages[existingIndex], ...msg }
        return
      }
    }

    this.messages.unshift(msg) // 新消息放前面
    if (this.messages.length > 500) {
      this.messages.pop() // 防止内存泄露
    }
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

  // 全局界面缩放系数（内存维护，默认1）
  zoomFactor: 1,
  updateFontSize: null,

  // === Editor App 全局共享配置 ===
  editorSendDiff: true,               // 点击批准时是否发回Diff给AI
  editorOpenFileAfterAccept: false,    // 批准后是否自动打开该文件继续编辑
}