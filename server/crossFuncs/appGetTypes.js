import appManager from "../apps/appManager.js"

//迷你桌面返回app列表
export default {
  name: "appGetTypes",
  func: async () => {
    const data = appManager.getappDefs();
    return { ok: true, msg: "App 定义列表已就绪", data };
  }
}
