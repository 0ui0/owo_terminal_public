
import Joi from "joi"
import projectManager from "../managers/projectManager.js"
import { dialog } from "electron"
import ioServer from "../ioServer/ioServer.js"
import { trs } from "../tools/i18n.js"
import comData from "../comData/comData.js"
import projectSave from "./projectSave.js"

export default {
  name: "projectLoad",
  func: async ({ path, forceConvert }) => {
    let filePath = path

    // 1. 检查脏位 或 是否已加载项目路径 (双重保险，防止无声重置)
    if (projectManager.isDirty || projectManager.currentProjectPath) {
      const { response } = await dialog.showMessageBox({
        type: "question",
        buttons: [
          trs("通用/保存", { cn: "保存并继续", en: "Save and Continue" }),
          trs("系统/动作/不保存", { cn: "不保存直接继续", en: "Discard Changes" }),
          trs("通用/取消")
        ],
        defaultId: 0,
        cancelId: 2,
        title: trs("对话框/标题/确认", { cn: "加载项目确认", en: "Load Project Confirmation" }),
        message: trs("系统/提示/未保存更改", { cn: "当前项目有未保存的更改，要在加载前保存吗？", en: "Current project has unsaved changes. Save before loading new?" }),
      })

      if (response === 2) {
        return { ok: false, msg: "User canceled" }
      }

      if (response === 0) {
        // 先保存 (调用现有 projectSave)
        const saveRes = await projectSave.func({ saveAs: false })
        if (!saveRes.ok) return saveRes // 如果保存失败或取消保存，则终止加载
      }
    }

    if (!filePath) {
      try {
        const { filePaths, canceled } = await dialog.showOpenDialog({
          title: "打开项目",
          filters: [{ name: "Owo Project", extensions: ["owo", "json"] }],
          properties: ["openFile"]
        })

        if (canceled || filePaths.length === 0) {
          return { ok: false, msg: "User canceled" }
        }
        filePath = filePaths[0]
      } catch (e) {
        return { ok: false, msg: "Dialog failed: " + e.message }
      }
    }

    try {
      const result = await projectManager.load(filePath, { forceConvert })

      // 版本不匹配：带上版本信息与文件路径返回，由前端询问用户是否兼容导入
      if (!result.ok) {
        if (result.msg === "VERSION_MISMATCH") {
          return {
            ok: false,
            msg: "VERSION_MISMATCH",
            currentVersion: result.currentVersion,
            savedVersion: result.savedVersion,
            path: filePath
          }
        }
        return result
      }

      if (ioServer.io) {
        ioServer.io.emit("project:state", { path: filePath })
        ioServer.io.emit("project:loaded")

        // --- 同步前端 sessionStates（导入存档后需刷新模型下拉菜单状态） ---
        ioServer.io.emit("sessionState:sync", {})
      }

      return { ok: true, msg: "项目已成功载入喵！", data: { path: filePath } }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
