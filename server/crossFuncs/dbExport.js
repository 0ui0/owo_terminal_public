import fs from "fs-extra"
import path from "path"
import tempPath from "../tools/tempPath.js"
import db from "../db/db.js"

export default {
  name: "dbExport",
  func: async ({ filePath }) => {
    try {
      // 导出前强制执行 WAL Checkpoint，将预写日志中的全部数据合流刷盘到主数据库文件
      if (db.db) {
        await db.db.query("PRAGMA wal_checkpoint(TRUNCATE);")
      }

      const dbPath = path.join(tempPath.getUserDataDir(), "db.sqlite")
      await fs.copy(dbPath, filePath, { overwrite: true })
      return { ok: true, msg: "导出成功" }
    } catch (e) {
      console.error("[CrossFunc] 数据库导出失败:", e)
      return { ok: false, msg: e.message }
    }
  }
}
