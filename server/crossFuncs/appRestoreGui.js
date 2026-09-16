// 【前端页面刷新专用】页面刷新后前端窗口全部丢失，这里把后端仍存活的 App 逐个重建窗口（等同逐个点击任务管理器里的眼睛按钮）
import appManager from "../apps/appManager.js"
import appGuiRestore from "./appGuiRestore.js"

export default {
  name: "appRestoreGui",
  func: async () => {
    for (const app of appManager.apps.values()) {
      await appGuiRestore.func(app.id)
    }
    return { ok: true, msg: `已重建 ${appManager.apps.size} 个 App 窗口` }
  }
}
