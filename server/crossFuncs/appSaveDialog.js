import { dialog } from "electron"
import { trs } from "../tools/i18n.js"

export default {
  name: "appSaveDialog",
  func: async (options = {}) => {
    try {
      console.log("[CrossFunc] AppSaveDialog: Opening native dialog")

      const { filePath, title, buttonLabel, filters } = options

      const result = await dialog.showSaveDialog({
        title: title || trs("对话框/标题/保存文件"),
        defaultPath: filePath || "",
        buttonLabel: buttonLabel || trs("对话框/按钮/保存"),
        filters: filters || [
          { name: trs("对话框/过滤器/全部文件"), extensions: ["*"] }
        ]
      })

      if (result.canceled) {
        return { ok: false, canceled: true }
      }

      return { ok: true, filePath: result.filePath }
    } catch (e) {
      console.error("[CrossFunc] AppSaveDialog Error:", e)
      return { ok: false, msg: e.message }
    }
  }
}
