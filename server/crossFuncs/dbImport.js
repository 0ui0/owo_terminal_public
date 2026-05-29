import { app } from "electron"
import fs from "fs-extra"
import path from "path"
import db from "../db/db.js"

export default {
  name: "dbImport",
  func: async ({ filePath }) => {
    try {
      if (db.db) await db.db.close()

      const dbPath = path.resolve("./db.sqlite")

      // Perform the copy
      await fs.copy(filePath, dbPath)

      // Relaunch and Exit
      app.relaunch({ args: [app.getAppPath()] })
      app.exit(0)

      return { ok: true, msg: "数据库文件已导入并覆盖现有数据" }
    } catch (e) {
      console.error("[CrossFunc] 数据库导入失败", e)
      return { ok: false, msg: e.message }
    }
  }
}
