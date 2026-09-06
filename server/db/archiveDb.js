import { Sequelize as Seq } from "sequelize"
import Dir from "../tools/dir.js"
import tempPath from "../tools/tempPath.js"
import fs from "fs-extra"
import pathLib from "path"
import { fileURLToPath } from "url"

export default {
  db: null,
  hasEverSynced: false,
  async init(customStoragePath, { isFirstInit = false } = {}) {
    try {
      const storagePath = customStoragePath || tempPath.get("save/archive.sqlite")
      await fs.ensureDir(pathLib.dirname(storagePath))

      this.db = new Seq({
        dialect: "sqlite",
        storage: storagePath,
        logging: () => { }
      })

      await this.db.query("PRAGMA journal_mode = WAL;")
      await this.db.query("PRAGMA busy_timeout = 5000;")

      const __dirname = pathLib.dirname(fileURLToPath(import.meta.url))
      let dir = new Dir(pathLib.resolve(__dirname, "./archiveTables"))

      for (let [index, file] of Object.entries(await dir.ls())) {
        if (file.match(/\.js$/g)) {
          let { default: initTable } = await import("./archiveTables/" + file)
          let tableModel = await initTable(this.db)
          this[tableModel.tableName] = tableModel
        }
      }

      // 仅在明确首次启动或进程生命周期首次初始化时执行结构迁移与表同步
      const needAlter = isFirstInit || !this.hasEverSynced
      if (needAlter) {
        // 自愈机制：在执行 alter 同步前，防御性清理可能意外残留的 SQLite 备份表
        try {
          await this.db.query("DROP TABLE IF EXISTS tb_chat_messages_backup;")
        } catch (dropErr) {
          console.warn("[ArchiveDB] 清理残留备份表警告:", dropErr)
        }
        await this.db.sync({
          alter: true
        })
        this.hasEverSynced = true
      }
      console.log(`[ArchiveDB] SQLite 数据库初始化完成。(alter: ${needAlter})`)
    } catch (err) {
      console.error("[ArchiveDB] 数据库初始化异常:", err)
      throw err
    }
  },
  // 原生在线快照导出（基于 VACUUM INTO，连接全程保持在线，自动整合 WAL 并整理碎片）
  async exportSnapshot(targetFilePath) {
    try {
      if (!this.db) {
        throw new Error("数据库实例未就绪，无法导出快照")
      }
      // VACUUM INTO 要求目标文件不能预先存在
      await fs.remove(targetFilePath)
      await fs.ensureDir(pathLib.dirname(targetFilePath))

      const safePath = targetFilePath.replace(/\\/g, "/").replace(/'/g, "''")
      await this.db.query(`VACUUM INTO '${safePath}';`)
      return targetFilePath
    } catch (err) {
      console.error("[ArchiveDB] 原生快照导出失败:", err)
      throw err
    }
  },
  async close() {
    if (this.db) {
      await this.db.close()
      this.db = null
      delete this.tb_chat_messages
      console.log("[ArchiveDB] SQLite 数据库已安全关闭。")
    }
  }
}
