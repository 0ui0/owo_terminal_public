import { Sequelize as Seq } from "sequelize"
import Dir from "../tools/dir.js"
import fs from "fs-extra"
import pathLib from "path"
import { fileURLToPath } from "url"

export default {
  db: null,
  async init() {
    await fs.ensureDir(pathLib.resolve("./save"))

    this.db = new Seq({
      dialect: "sqlite",
      storage: "./save/archive.sqlite",
      logging: () => { }
    })

    const __dirname = pathLib.dirname(fileURLToPath(import.meta.url))
    let dir = new Dir(pathLib.resolve(__dirname, "./archiveTables"))

    for (let [index, file] of Object.entries(await dir.ls())) {
      if (file.match(/\.js$/g)) {
        let { default: initTable } = await import("./archiveTables/" + file)
        let tableModel = await initTable(this.db)
        this[tableModel.tableName] = tableModel
      }
    }
    await this.db.sync({
      alter: true
    })
    console.log("[ArchiveDB] SQLite database initialized.")
  },
  async close() {
    if (this.db) {
      await this.db.close()
      this.db = null
      delete this.tb_chat_messages
      console.log("[ArchiveDB] SQLite database closed.")
    }
  }
}
