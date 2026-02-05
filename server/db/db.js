import { Sequelize as Seq } from "sequelize"
import Dir from "../tools/dir.js"
import { app } from "electron"

import fs from "fs/promises"
import pathLib from "path"
import initData from "./initData.js"
export default {
  db: null,
  async init() {

    //let userDataDir = app.getPath("userData")
    //let dbPath = pathLib.join(userDataDir,"db.sqlite")

    this.db = new Seq({
      dialect: "sqlite",
      storage: "db.sqlite",
      logging: () => { }
    })

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