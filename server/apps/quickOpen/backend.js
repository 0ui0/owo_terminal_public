// quickOpen 后端：初始化数据与消息调度
export default {
  async init(app, appManager) {
    if (!app.data.searchConfig) {
      app.data.searchConfig = {
        useRegex: false,
        caseSensitive: false,
        wholeWord: false,
        excludePatterns: "node_modules, .git, dist, build"
      }
    }
    if (app.data.isFullText === undefined) {
      app.data.isFullText = false
    }
  },

  async dispatch({ app, action }) {
    return { ok: false, msg: `未知操作: ${action}` }
  }
}
