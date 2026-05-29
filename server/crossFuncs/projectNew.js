
import projectManager from "../managers/projectManager.js"
import { dialog } from "electron"
import ioServer from "../ioServer/ioServer.js"
import { trs } from "../tools/i18n.js"
import projectSave from "./projectSave.js"

export default {
  name: "projectNew",
  func: async () => {
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
        title: trs("对话框/标题/确认", { cn: "新建项目确认", en: "New Project Confirmation" }),
        message: trs("系统/提示/未保存更改", { cn: "当前项目有未保存的更改，要在新建前保存吗？", en: "Current project has unsaved changes. Save before creating new?" }),
      })

      if (response === 2) {
        return { ok: false, msg: "User canceled" }
      }

      if (response === 0) {
        // 先保存 (调用现有 projectSave)
        const saveRes = await projectSave.func({ saveAs: false })
        if (!saveRes.ok) return saveRes // 如果保存失败或取消保存，则终止新建
      }
    }

    // 2. 执行重置
    try {
      await projectManager.reset()

      if (ioServer.io) {
        // 向前端同步基础状态
        ioServer.io.emit("project:state", { path: "", autoSave: false })
        ioServer.io.emit("notice", trs("系统/消息/操作成功"))
      }

      return { ok: true, msg: "新项目已初始化成功" }
    } catch (e) {
      console.error("[projectNew] Error:", e)
      return { ok: false, msg: e.message }
    }
  }
}
