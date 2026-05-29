
import projectManager from "../managers/projectManager.js"

export default {
  name: "projectGetPath",
  func: async () => {
    return { ok: true, msg: "获取项目路径成功", path: projectManager.currentProjectPath }
  }
}
