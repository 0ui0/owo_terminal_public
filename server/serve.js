import Joi from "joi"
global.Joi = Joi


import Hapi from '@hapi/hapi';
import ioServer from "./ioServer/ioServer.js"
import db from "./db/db.js"
import archiveDb from "./db/archiveDb.js"
import Dir from "./tools/dir.js"
import inert from "@hapi/inert"
import comData from "./comData/comData.js"
import subAgents from "./tools/aiAsk/subAgents.js"
import pathLib from "path"
import fs from "fs-extra"
import options from "./config/options.js"
import crypto from "crypto"
import tempPath from "./tools/tempPath.js"




const init = async (config) => {

  let { port = 9501 } = config || {}

  process.on('unhandledRejection', (err) => {
    console.log(err);
  });

  const userData = tempPath.getUserDataDir()
  await fs.ensureDir(pathLib.join(userData, "aiCall"))
  await fs.ensureDir(pathLib.join(userData, "usrCall"))
  await fs.ensureDir(pathLib.resolve("../aiWork"))
  tempPath.get("aiTmp") // 启动时自动初始化并确保实例专属的 temp/aiTmp 临时脚本目录存在


  const serverOpts = (usePort) => ({
    port: usePort,
    host: '0.0.0.0',
    routes: {
      cors: {
        origin: ['*'],
        headers: ['Accept', 'Content-Type']
      },
      payload: {
        maxBytes: 50 * 1024 * 1024,
      }
    }
  })

  const registerRoutes = async (server) => {
    server.route({
      method: "get",
      path: "/{param*}",
      handler: {
        directory: {
          path: `${pathLib.join("../www/dist")}`,
          redirectToSlash: true
        }
      }
    })

    server.route({
      method: "get",
      path: "/statics/{param*}",
      handler: {
        directory: {
          path: `${pathLib.join("../www/public/statics")}`,
        }
      }
    })


    let apiDir = new Dir("./apis")
    let apiFiles = await apiDir.ls()
    for (let i = 0; i < apiFiles.length; i++) {
      let fileName = apiFiles[i]
      if ((await apiDir.stat(fileName)).isDirectory()) {
        apiDir.cd(fileName)
        let subApiFiles = await apiDir.ls()
        for (let j = 0; j < subApiFiles.length; j++) {
          let subFileName = subApiFiles[j]
          if (subFileName.endsWith(".js")) {
            let { default: api } = await import(`./apis/${fileName}/${subFileName}`)
            let apiConfig = await api()
            server.route(apiConfig)
          }
        }
        apiDir.cd("..")
      }
    }
  }

  tempPath.cleanDeadOrphanDirs()
  tempPath.get("attachment")
  tempPath.get("save")

  const buildServer = async (usePort) => {
    const server = Hapi.server(serverOpts(usePort))
    await server.register(inert)
    await registerRoutes(server)
    await ioServer.init(server)
    await ioServer.run()
    await db.init()
    server.db = db

    // 修补旧数据：ai_aiList 模型缺 id 的补 uuid（id 由系统分配）
    try {
      const row = await db.tb_options.findOne({ where: { key: "ai_aiList" } })
      if (row && Array.isArray(row.value)) {
        row.value = row.value.map(m => m.id ? m : { ...m, id: crypto.randomUUID() })
        await row.save()
        console.log("[Patch] ai_aiList 已为缺失 id 的模型补齐 uuid")
      }
    } catch (e) { console.error("[Patch] ai_aiList:", e) }

    await archiveDb.init()
    server.archiveDb = archiveDb
    server.comData = comData
    // 启动时默认用后台配置 0 号初始化主队列（存档恢复会走 projectManager.load 重新 initAgent）
    const aiList = await options.get("ai_aiList");
    await subAgents.initAgent(0, aiList[0].id);
    return server
  }

  try {
    const server = await buildServer(port)
    await server.start()
    console.log('Server running on %s', server.info.uri);
    return { server, port: server.info.port }
  }
  catch (err) {
    if (port !== 0 && err.code === 'EADDRINUSE') {
      console.log('Port %s in use, trying dynamic port...', port)
      const server = await buildServer(0)
      await server.start()
      console.log('Server running on %s', server.info.uri);
      return { server, port: server.info.port }
    }
    console.log(err)
    throw err
  }

};


export default init
