
import Joi from "joi"
import projectManager from "../managers/projectManager.js"
import { dialog } from "electron"

export default {
  name: "projectSave",
  func: async ({ path, saveAs }) => {
    let filePath = path
    // If no path specified or saveAs invoked, open dialog
    if (!filePath || saveAs || !projectManager.currentProjectPath) {
      try {
        const { filePath: savePath, canceled } = await dialog.showSaveDialog({
          title: "保存项目",
          defaultPath: projectManager.currentProjectPath || "my_project.owo",
          filters: [{ name: "Owo Project", extensions: ["owo", "json"] }]
        })

        if (canceled || !savePath) {
          return { ok: false, msg: "User canceled" }
        }
        filePath = savePath
      } catch (e) {
        console.error("Dialog error:", e)
        return { ok: false, msg: "Dialog failed: " + e.message }
      }
    }

    try {
      await projectManager.save(filePath)
      return { ok: true, path: filePath }
    } catch (e) {
      console.error(e)
      return { ok: false, msg: e.message }
    }
  }
}
