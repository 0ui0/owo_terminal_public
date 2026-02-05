import { Server } from "socket.io"
import Dir from "../tools/dir.js"
import comData from "../comData/comData.js"
import pathLib from "path"
import appManager from "../apps/appManager.js"


let playListTimer = null
let initComData = null

export default {
  io: null,
  server: null,
  sockets: [],
  init(server) {
    this.server = server
    this.io = new Server(server.listener, {
      cors: {
        origin: "*"
      },
      maxHttpBufferSize: 50 * 1024 * 1024 // 50MB
    })
  },
  async run() {
    const io = this.io
    await comData.init()
    await appManager.init(io)


    //服务端发
    comData.data.addObserver("dataSync", (data) => {
      return new Promise((res, rej) => {
        for (let socket of this.sockets) {
          socket.emit("comData", data, (msg) => {
            //console.log(msg.ok,msg.msg)
            res(msg)
          })
        }
      })
    })



    io.on("connection", async (socket) => {
      if (this.sockets.indexOf(socket) < 0) {
        this.sockets.push(socket)
      }
      console.log("客户端连接")
      socket.on("disconnect", (socket) => {
        this.sockets.splice(this.sockets.indexOf(socket), 1)
        console.log("客户端断开")
      })

      //服务端收
      socket.on("comData", async (data, callback) => {
        try {
          if (data.version >= comData.data.get().version) {
            comData.data.setData(data)
            callback({
              ok: true,
              msg: `服务器收到并更新comData,收到数据见data
服务端版本${comData.data.get().version}
客户端版本${data.version}
            `,
              data: data
            })
          }
          else {
            callback({
              ok: false,
              msg: `客户端推送版本小于服务端版本，收到数据见data
服务端版本${comData.data.get().version}
客户端版本${data.version}
            `,
              data: data
            })
          }

        } catch (error) {
          console.log(error)
        }
      })





      await comData.data.edit((data, self) => {
        data.currentModel ??= ""
        data.sendMode ??= "terminal"
        data.call ??= null
        data.inputText ??= ""
        data.chatLists ??= [
          {
            id: 0,
            linkid: 0,
            data: [],
            replying: false,
            streamChunks: "",
            confirmCmds: [
              /* {
                id:"efef",
                cmd:{
                  type:"terminal",
                  content:"ls",
                },
                confirm:"pending", //yes no
              } */
            ],
            stop: false,

          }]
        data.chatLists.forEach(list => {
          list.replying ??= false;
          list.streamChunks ??= "";
          list.confirmCmds ??= [];
          list.stop ??= false;
        });

        data.quotes ??= []
        data.darkMode ??= true
        data.faceAction ??= "smile"
        data.playFaces ??= {
          current: "",
          list: ["待机状态", "腾空", "上下漂浮", "降落", "待机状态", "待机状态", "待机状态", "左右行走"],
          //list:["待机状态"],
          index: 0,
        }
        data.currentTid ??= ""
        data.toolsMode ??= 3 //1提示词模式 2标准工具模式 3 miao模式
      })

      /* playListTimer ??= setInterval(async () => {
        let preIndex = comData.data.get().playFaces.index + 1
        if (preIndex < comData.data.get().playFaces.list.length) {
          await comData.data.edit((data) => {
            data.playFaces.index = preIndex
          })
        }
        else {
          await comData.data.edit((data) => {
            data.playFaces.index = 0
          })
        }
        //console.log(comData.data.get().playFaces.index)
      }, 5000) */





      const ioApis = new Dir("./ioServer/ioApis")
      const ioApisLs = await ioApis.ls()

      for (let [index, file] of Object.entries(ioApisLs)) {
        if ((await ioApis.stat(pathLib.resolve(ioApis.pwd() + "/" + file))).isDirectory()) {
          const ioApi = new Dir(pathLib.resolve(ioApis.pwd() + "/" + file))
          const ioApiLs = await ioApi.ls()
          for (let [index, file2] of Object.entries(ioApiLs)) {
            if (file2.match(/^ioApi_.+\.js$/g)) {
              const ioApiFn = await import(`./ioApis/${file}/${file2}`)
              ioApiFn.default({
                io,
                socket,
                server: this.server,
                db: this.server.db,
                ioServerModule: this
              })
            }
          }
        }
      }

    })


  },
}