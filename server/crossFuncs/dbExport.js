import fs from "fs-extra"
import path from "path"

export default {
  name: "dbExport",
  func: async ({ filePath }) => {
    try {
      const dbPath = path.resolve("./db.sqlite")
      await fs.copy(dbPath, filePath)
      return { ok: true, msg: "导出成功" }
    } catch (e) {
      console.error("[CrossFunc] 数据库导出失败:", e)
      return { ok: false, msg: e.message }
    }
  }
}
