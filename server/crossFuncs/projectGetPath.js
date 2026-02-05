
import projectManager from "../managers/projectManager.js"

export default {
  name: "projectGetPath",
  func: async () => {
    return { ok: true, path: projectManager.currentProjectPath }
  }
}
