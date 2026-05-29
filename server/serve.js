import Joi from "joi"
global.Joi = Joi


import Hapi from '@hapi/hapi';
import ioServer from "./ioServer/ioServer.js"
import db from "./db/db.js"
import Dir from "./tools/dir.js"
import inert from "@hapi/inert"
import comData from "./comData/comData.js"
import aiBasic from "./tools/aiAsk/basic.js"
import pathLib from "path"
import fs from "fs-extra"




const init = async (config) => {

  let { port = 9501 } = config || {}

  process.on('unhandledRejection', (err) => {
    console.log(err);
  });

  await fs.ensureDir(pathLib.resolve("./tools/aiAsk/usrCall"))
  await fs.ensureDir(pathLib.resolve("./tools/aiAsk/aiCall"))
  await fs.ensureDir(pathLib.resolve("../aiWork"))


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

  const buildServer = async (usePort) => {
    const server = Hapi.server(serverOpts(usePort))
    await server.register(inert)
    await registerRoutes(server)
    await ioServer.init(server)
    await ioServer.run()
    await db.init()
    server.db = db
    server.comData = comData
    await aiBasic.initList()
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
