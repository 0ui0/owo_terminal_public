import { dialog } from "electron"

export default {
  name: "appOpenDialog",
  func: async (options = {}) => {
    try {
      console.log("[CrossFunc] AppOpenDialog: Opening native dialog")

      const { title, buttonLabel, filters, properties } = options

      const result = await dialog.showOpenDialog({
        title: title || "打开文件",
        buttonLabel: buttonLabel || "打开",
        filters: filters || [
          { name: "全部文件", extensions: ["*"] }
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
