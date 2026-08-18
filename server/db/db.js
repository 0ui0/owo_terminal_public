import { Sequelize as Seq } from "sequelize"
import Dir from "../tools/dir.js"
import tempPath from "../tools/tempPath.js"
import fs from "fs/promises"
import pathLib from "path"
import initData from "./initData.js"

export default {
  db: null,
  async init() {
    const userDataDir = tempPath.getUserDataDir()
    const dbPath = pathLib.join(userDataDir, "db.sqlite")

    this.db = new Seq({
      dialect: "sqlite",
      storage: dbPath,
      logging: () => { }
    })

    // 启用 WAL 预写日志与 5000ms 锁等待超时，确保多实例高并发安全
    await this.db.query("PRAGMA journal_mode = WAL;")
    await this.db.query("PRAGMA busy_timeout = 5000;")

    let dir = new Dir("./db/tables")

    for (let [index, file] of Object.entries(await dir.ls())) {
      if (file.match(/\.js$/g)) {
        let { default: initTable } = await import("./tables/" + file)
        let tableModel = await initTable(this.db)
        this[tableModel.tableName] = tableModel
      }
    }
    await this.db.sync({
      alter: true
    })

    await initData(this.db)
  },
}