import { Server } from "socket.io"
import Dir from "../tools/dir.js"
import comData from "../comData/comData.js"
import defaultComData from "../tools/defaultComData.js"
import pathLib from "path"
import appManager from "../apps/appManager.js"
import jsonpatch from "fast-json-patch"
import _ from "lodash"
const { compare, applyPatch } = jsonpatch


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


    this.last = _.cloneDeep(comData.data.get() || {})

    //服务端发
    comData.data.addObserver("dataSync", (data) => {
      return new Promise((res, rej) => {
        if (!this.sockets || this.sockets.length === 0) {
          this.last = _.cloneDeep(data)
          return res({ ok: true, msg: "无活跃客户端，跳过同步" })
        }
        const patches = compare(this.last, data)
        const fromVersion = this.last.version
        const toVersion = data.version

        this.last = _.cloneDeep(data)

        if (patches.length === 0) {
          return res({ ok: true, msg: "无数据变化，跳过同步" })
        }

        const timer = setTimeout(() => {
          res({ ok: false, msg: "同步超时" })
        }, 1500)
        for (let socket of this.sockets) {
          socket.emit("comData", { patches, fromVersion, toVersion }, (msg) => {
            clearTimeout(timer)
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
      socket.on("disconnect", (reason) => {
        const index = this.sockets.indexOf(socket)
        if (index > -1) {
          this.sockets.splice(index, 1)
        }
        console.log("客户端断开:", reason)
      })

      //服务端收
      socket.on("comData", async (payload, callback) => {
        try {
          const current = comData.data.get()
          if (payload?.patches) {
            const { patches, fromVersion, toVersion } = payload
            if (fromVersion === current.version) {
              let data = _.cloneDeep(current)
              applyPatch(data, patches)
              comData.data.setData(data)
              this.last = _.cloneDeep(data)
              return callback({
                ok: true,
                msg: `服务器应用 comDataPatch 成功，当前版本: ${toVersion}`,
                data
              })
            }
            return callback({
              ok: false,
              code: "OUT_OF_SYNC",
              msg: `版本失步，服务端版本 ${current.version} != 客户端基准 ${fromVersion}`
            })
          }

          if (payload && payload.version >= current.version) {
            comData.data.setData(payload)
            this.last = _.cloneDeep(payload)
            return callback({
              ok: true,
              msg: `服务器收到并更新comData,收到数据见data
服务端版本${comData.data.get().version}
客户端版本${payload.version}
`,
              data: payload
            })
          }
          callback({
            ok: false,
            msg: `客户端推送版本小于服务端版本，收到数据见data
服务端版本${comData.data.get().version}
客户端版本${payload?.version}
`,
            data: payload
          })
        } catch (error) {
          console.log(error)
          callback({ ok: false, msg: error.message })
        }
      })





      await comData.data.edit((data, self) => {
        const defaultData = defaultComData()
        for (let key in defaultData) {
          data[key] ??= defaultData[key]
        }

        data.chatLists.forEach(list => {
          list.replying ??= false;
          list.streamChunks ??= "";
          list.streamDisplayContent ??= "";
          list.streamReasoningChunks ??= "";
          list.confirmCmds ??= [];
          list.stop ??= false;
          list.tasks ??= [];
          list.notes ??= [];
          list.graph ??= { nodes: {}, links: [] };
        });
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