import { app } from "electron"
import fs from "fs-extra"
import path from "path"
import db from "../db/db.js"
import tempPath from "../tools/tempPath.js"

export default {
  name: "dbImport",
  func: async ({ filePath }) => {
    try {
      if (db.db) {
        await db.db.close()
      }

      const dbPath = path.join(tempPath.getUserDataDir(), "db.sqlite")

      // 彻底清理当前存在的 WAL 预写日志与共享内存文件，杜绝重启时旧 WAL 日志重放覆盖新导入的数据！
      await fs.remove(dbPath + "-wal")
      await fs.remove(dbPath + "-shm")

      // 完整覆盖主数据库
      await fs.copy(filePath, dbPath, { overwrite: true })

      // 安全重启应用
      app.relaunch({ args: [app.getAppPath()] })
      app.exit(0)

      return { ok: true, msg: "数据库文件已导入并覆盖现有数据" }
    } catch (e) {
      console.error("[CrossFunc] 数据库导入失败", e)
      return { ok: false, msg: e.message }
    }
  }
}
