import appManager from "../apps/appManager.js"

//迷你桌面返回app列表
export default {
  name: "appGetTypes",
  func: async () => {
    if (appManager.appDefsErrors.size > 0) {
      console.warn("[appGetTypes] 存在加载失败的 App:", Object.fromEntries(appManager.appDefsErrors))
    }
    const data = appManager.getappDefs();
    return { ok: true, msg: "App 定义列表已就绪", data };
  }
}
