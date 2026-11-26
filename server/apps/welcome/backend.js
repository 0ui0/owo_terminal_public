/* backend.js - 欢迎使用 App 后端逻辑 */

import projectManager from "../../managers/projectManager.js"

export default {
  async init(app) {
    if (!app.data) {
      app.data = {}
    }
  },

  async destroy() {},

  async dispatch({ action }) {
    try {
      if (action === "getRecentProjects") {
        return {
          ok: true,
          msg: "获取最近项目成功",
          data: projectManager.getRecentProjects()
        }
      }
      return {
        ok: false,
        msg: "未知操作"
      }
    } catch (err) {
      console.error("[welcome/backend] dispatch 异常:", err)
      return {
        ok: false,
        msg: err.message || "服务器内部错误"
      }
    }
  }
}
