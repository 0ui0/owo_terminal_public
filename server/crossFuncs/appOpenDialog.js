import { dialog } from "electron"
import { trs } from "../tools/i18n.js"

export default {
  name: "appOpenDialog",
  func: async (options = {}) => {
    try {
      console.log("[CrossFunc] AppOpenDialog: Opening native dialog")

      const { title, buttonLabel, filters, properties } = options

      const result = await dialog.showOpenDialog({
        title: title || trs("对话框/标题/打开文件"),
        buttonLabel: buttonLabel || trs("对话框/按钮/打开"),
        filters: filters || [
          { name: trs("对话框/过滤器/全部文件"), extensions: ["*"] }
        ],
        properties: properties || ["openFile"]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true }
      }

      return { ok: true, filePath: result.filePaths[0] }
    } catch (e) {
      console.error("[CrossFunc] AppOpenDialog Error:", e)
      return { ok: false, msg: e.message }
    }
  }
}
