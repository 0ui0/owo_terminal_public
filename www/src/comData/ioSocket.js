import comData from "./comData.js"
import commonData from "../view/common/commonData.js"
import chatData from "../view/chat/chatData.js"
import Notice from "../view/common/notice.js"
import ChatTerm from "../view/chat/ChatTerm.js"
import m from "mithril"
import Box from "../view/common/box.js"
import settingData from "../view/setting/settingData.js"
import format from "../view/common/format.js"

export default {
  socket: null,
  isInit: false,

  init() {
    if (this.isInit) {
      return
    }
    this.socket = io(`${window.location.hostname}:9501`)

    this.socket.on("connect", () => {
      console.log("连接成功")
    })

    this.socket.on("comData", async (data, callback) => {
      try {
        if (data.version >= comData.data.get().version) {
          comData.data.setData(data)
          m.redraw()
          callback({
            ok: true,
            msg: `客户端收到comData，更新成功，收到数据见data
服务端版本${data.version}
客户端版本${comData.data.get().version}
`,
            data: data
          })
        }
        else {
          let tmp = await m.request({
            url: `${window.location.protocol}//${window.location.hostname}:9501/api/comData/get`
          })
          comData.data.setData(tmp.data)
          callback({
            ok: false,
            msg: `服务端推送版本小于当前客户端版本，收到数据见data
服务端版本${data.version}
客户端版本${comData.data.get().version}
拉取并更新服务端最新版本..
              `,
            data: data

          })
        }
      }
      catch (err) {
        console.log(err)
        throw err
      }

    })

    this.socket.on("chat", async (msg) => {
      //console.log("客户端收到chat消息", msg)
      if (msg.tid) {
        // 在所有队列中寻找对应的终端消息
        let chat = null
        const chatLists = comData.data.get().chatLists
        if (chatLists) {
          for (const list of chatLists) {
            chat = list.data.find(item => item.tid === msg.tid)
            if (chat) break
          }
        }

        if (chat) {
          chat.content += msg.content
          chat.chunk = msg.content


          if (chatData.xTerms[chat.tid]) {
            chatData.xTerms[chat.tid].forEach((term) => {
              term.write(msg.content)
            })
          }

          //chatData.currentTalk = chat
          // 检查是否正在回复中，如果是则不自动标记回复终端
          if (!comData.data.get().replying) {
            if (comData.data.get().sendMode === "terminal") {
              await comData.data.edit((data) => { data.call = { ...chat } })
            }
          }
        }
        else {
          chatData.list.push(msg)
        }
      }
      else {
        chatData.list.push(msg)
      }
      if (msg.group !== "user") {
        chatData.preparing = false
      }

      //滚动到底部

      let dom = document.querySelector(`#chatList_${msg.chatListId || 0}`)
      if (dom) {
        setTimeout(() => {

          if (!msg.tid) {
            dom.scrollTo({
              left: 0,
              top: dom.scrollHeight,
              behavior: "smooth",
            })
          }

        }, 200)
      }

      m.redraw()
    })

    this.socket.on("notice", async (msg) => {
      Notice.launch({
        msg: msg
      })
    })


    this.socket.on("openTerminal", async (msg) => {
      await comData.data.edit(data => {
        data.currentTid = msg.currentTid
      })
      let currentTid = comData.data.get().currentTid
      let currentChat = null
      const chatLists = comData.data.get().chatLists
      if (chatLists) {
        for (const list of chatLists) {
          currentChat = list.data.find(chat => chat.tid === currentTid)
          if (currentChat) break
        }
      }

      if (currentChat) {
        Notice.launch({
          sign: currentChat.tid,
          tip: "终端" + currentTid,
          content: ChatTerm,
          contentAttrs: {
            chat: currentChat
          },
          show: false,
        })

      }

    })


    // App 事件监听
    this.socket.on("app:error", (msg) => {
      Notice.launch({
        msg: `[App 错误] ${msg.msg}`,
        type: "error"
      })
    })


    this.socket.on("app:launch", async (msg) => {
      try {
        const module = await import(msg.frontendUrl)
        let component = module.default
        if (typeof component === "function") {
          // 参数注入模式
          component = component({ appId: msg.appId, m, Notice, ioSocket: this, comData, commonData, chatData, settingData, format, Box, iconPark: window.iconPark })
        }
        // Window Management: Resolve Geometry
        const saved = msg.data && msg.data.window
        const def = msg.window || {}

        let targetW = (saved && saved.width) || def.width || 0
        let targetH = (saved && saved.height) || def.height || 0

        // Safe capping for defaults
        if (!saved && targetW) targetW = Math.min(targetW, window.innerWidth * 0.95)
        if (!saved && targetH) targetH = Math.min(targetH, window.innerHeight * 0.95)

        let targetX = (saved && saved.x !== undefined) ? saved.x : 0
        let targetY = (saved && saved.y !== undefined) ? saved.y : 0

        // Auto-center if not saved but has specific size
        if ((!saved || saved.x === undefined) && targetW > 0 && targetH > 0) {
          targetX = (window.innerWidth - targetW) / 2
          targetY = (window.innerHeight - targetH) / 2
        }

        // Mark as launched in backend
        settingData.fnCall("appGuiLaunched", [msg.appId]).catch(e => console.warn("Failed to mark app active", e))

        Notice.launch({
          sign: msg.appId,
          group: msg.type,
          tip: (msg.icon || "📦") + " " + msg.name,
          headerButtons: [
            {
              icon: window.iconPark ? window.iconPark.getIcon("Quote", { fill: "#eee", size: "12px" }) : '"',
              color: "#5e6c79",
              onclick: () => {
                chatData.quoteAppId(msg.appId)
              }
            }
          ],
          width: targetW,
          height: targetH,
          x: targetX,
          y: targetY,
          minimized: saved ? saved.minimized : false,
          win: saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : undefined,
          onWindowUpdate: (rect) => {
            // Sync window state to backend
            settingData.fnCall("appUpdateWindow", [msg.appId, rect])
          },
          cancel: async (dom, closeNative) => {
            // 集中处理 App 关闭逻辑：通知后端销毁
            await settingData.fnCall("appClose", [msg.appId])
            closeNative()
          },
          content: component,
          contentAttrs: {
            appId: msg.appId,
            data: msg.data
          }
        })
      } catch (e) {
        console.error("加载 App 前端失败:", e)
        Notice.launch({
          msg: `应用加载失败: ${e.message}`,
          timeout: 5000,
          color: "red"
        })
      }
    })

    this.socket.on("app:close", async (msg) => {
      // 遍历所有窗口和标签页，关闭匹配的 App
      const dataArr = Notice.data.dataArr
      if (dataArr) {
        for (let i = dataArr.length - 1; i >= 0; i--) {
          const tab = dataArr[i]
          const isMatch = (tab.sign == msg.appId) ||
            (tab.contentAttrs && tab.contentAttrs.appId == msg.appId) ||
            (typeof tab.sign === 'string' && tab.sign.startsWith(msg.appId + "_"))

          if (isMatch) {
            Notice.closeTab(tab)
          }
        }
      }
      m.redraw()
    })

    this.socket.on("app:active", async (msg) => {
      const { appId } = msg
      const dataArr = Notice.data.dataArr
      if (dataArr) {
        const tab = dataArr.find(t =>
          (t.sign === appId) ||
          (t.contentAttrs && t.contentAttrs.appId === appId) ||
          (typeof t.sign === 'string' && t.sign.startsWith(appId + "_"))
        )
        if (tab && tab._winConfig) {
          Notice.activateWindow(tab._winConfig.id)
          // 如果该窗口是多标签，还需要确保当前标签被选中
          tab._winConfig.activeSign = tab.sign
          m.redraw()
        }
      }
    })

    this.socket.on("app:dispatch", async (msg, callback) => {
      // Use commonData registry
      const data = commonData.appsData[msg.appId]

      if (data) {
        if (data.onDispatch) {
          data.onDispatch(msg, callback)
        } else {
          if (typeof callback === 'function') callback({ error: "App data instance missing onDispatch method" })
        }
      } else {
        if (typeof callback === 'function') callback({ error: "App instance not found" })
      }
    })

    this.isInit = true

  }
}