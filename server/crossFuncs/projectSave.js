
import Joi from "joi"
import projectManager from "../managers/projectManager.js"
import { dialog } from "electron"
import ioServer from "../ioServer/ioServer.js"
import { trs } from "../tools/i18n.js"

export default {
  name: "projectSave",
  func: async ({ path, saveAs }) => {
    let filePath = path
    // 只有在完全没有路径、或者明确要求另存为时，才弹出对话框
    if ((!filePath && !projectManager.currentProjectPath) || saveAs) {
      try {
        const { filePath: savePath, canceled } = await dialog.showSaveDialog({
          title: saveAs ? "另存为项目" : "保存项目",
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
    } else {
      // 快速保存模式：如果 path 为空，则使用当前项目路径
      filePath = filePath || projectManager.currentProjectPath
    }

    try {
      await projectManager.save(filePath)
      
      if (ioServer.io) {
        projectManager.startAutoSave() // 首次保存后自动开启定时器
        ioServer.io.emit("project:state", { path: filePath, autoSave: true })
        ioServer.io.emit("notice", trs("系统/消息/操作成功"))
      }

      return { ok: true, path: filePath }
    } catch (e) {
      console.error(e)
      return { ok: false, msg: e.message }
    }
  }
}
