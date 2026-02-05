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




const init = async () => {
  try {

    process.on('unhandledRejection', (err) => {
      console.log(err);
    });

    await fs.ensureDir(pathLib.resolve("./tools/aiAsk/usrCall"))
    await fs.ensureDir(pathLib.resolve("./tools/aiAsk/aiCall"))
    await fs.ensureDir(pathLib.resolve("../aiWork"))



    // 创建服务器实例
    const server = Hapi.server({
      port: 9501,
      host: 'localhost',//'0.0.0.0',//'localhost',
      routes: {
        cors: {
          origin: ['*'], // 允许所有来源的请求
          headers: ['Accept', 'Content-Type']
        },
        payload: {
          maxBytes: 50 * 1024 * 1024, // 50MB
        }
      }
    });

    await server.register(inert)

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

    /* server.route({
      method:"get",
      path:"/statics/{param*}",
      handler:{
        directory:{
          path:`${pathLib.join("../www/public/statics")}`,
        }
      }
    }) */


    //加载路由
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

    await ioServer.init(server)
    await ioServer.run()





    await db.init()
    server.db = db
    server.comData = comData

    await aiBasic.initList()


    // 启动服务器
    await server.start()



    console.log('Server running on %s', server.info.uri);
  }
  catch (err) {
    console.log(err)
    throw err
  }

};


export default init