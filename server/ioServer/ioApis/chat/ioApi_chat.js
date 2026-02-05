import { v4 as uuidV4 } from "uuid"
import { trs } from "../../../tools/i18n.js"
import chats from "./chats.js"
import comData from "../../../comData/comData.js"
import aiBasic from "../../../tools/aiAsk/basic.js"
import AiAsk from "../../../tools/aiAsk/AiAsk.js"
import TSession from "./TSession.js"
import options from "../../../config/options.js"
import subAgents from "../../../tools/aiAsk/subAgents.js"
import appManager from "../../../apps/appManager.js"

//注意模型数据并不是完全同步的，最好在切换模型的时候复制一次当前模型的上下文，只有当前模型上下文是完整的


const idTool = {
  id: 0,
  get() {
    this.id++
    return "id_" + this.id
  }
}





const tSession = new TSession()


export default ({ socket, server, io, db, verifyCookie }) => {

  socket.on("chat", async (que, callback) => {
    try {

      let {
        inputText,
        call,
        currentModel,
        sendMode,
        chatLists,
        quotes,
        targetChatListId
      } = comData.data.get()

      // 确定目标队列 ID (优先级: 参数 > 全局 > 默认 0)
      const listId = que?.chatListId || targetChatListId || 0;

      if (sendMode === "agent") {
        let ai_aiSwitch = await options.get("ai_aiSwitch")
        if (!ai_aiSwitch) {
          // 检查子智能体（即使全局开关关闭也可能允许子智能体？假设全局开关关闭所有）
          io.emit("notice", trs("消息/大模型总开关关闭", { cn: "大模型总开关关闭", en: "AI Master Switch is OFF" }))
          return
        }
      }

      // [Cleanup Logic Removed] - 终端和无效消息清理逻辑已移除，由 API 接管

      const atList = inputText.match(/(@[a-zA-Z0-9_\-]+ )/ig)
      if (atList && atList.length > 0) {

      }

      //前台选定终端窗口的时候（在xtrem内编辑）
      if (que?.tid) {
        const session = tSession.find(que.tid)
        if (session) {
          session.shell.write(que.chunk)
          tSession.checkCwd(que.tid)
        }
        return
      }

      //广播输入的消息，但是排除锁定回复终端的情况
      if (!call || (call && !call.tid)) {
        let chat = {
          uuid: idTool.get(),
          content: inputText,
          name: trs("角色/用户"),
          group: "user",
          timestamp: Date.now(),
          chatListId: listId // 指派归属权
        }
        io.emit("chat", chat) // 广播到前端（由前端根据 listId 过滤）

        let ask = null

        // --- 智能路由 ---
        if (listId > 0) {
          // 子智能体路由
          const subAgent = subAgents.get(listId);
          if (subAgent) {
            let ext = { id: chat.uuid, listId: listId };
            if (call) ext.call = call.uuid;
            if (quotes.length > 0) ext.quotes = quotes.map(q => q.uuid);

            ask = subAgent.addAsk(chat.name, "user", chat.content, ext);

            // 触发子智能体思考
            // 注意：我们需要一个类似下方 'sendAskByMsgProtocol' 的触发逻辑。
            // 对于 V13，我们复制该逻辑或创建一个助手函数。
            // 为避免代码重复，我们将在下方针对 'targetModel' 实现思考触发逻辑
          }
        }
        else {
          // 主 AI 路由（广播到 aiBasic 列表）
          aiBasic.list.forEach((model) => {
            let ext = {
              id: chat.uuid,
              listId: 0
            }
            if (call) {
              ext.call = call.uuid
            }
            if (quotes.length > 0) {
              ext.quotes = quotes.map(quote => quote.uuid)
            }
            //添加到所有模型，共享上下文
            ask = model.addAsk(chat.name, "user", chat.content, ext)
          })
        }

        chat.ask = ask
        await chats.add(chat, listId) // 存储到特定列表

        //去掉回复和引用
        await comData.data.edit((data) => {
          data.quotes = []
          data.call = null
        })
      }


      //锁定回复终端
      if (call?.tid) {
        const session = tSession.find(call.tid)
        if (session) {
          const data = inputText + "\r"
          // 分批写入，避免大数据阻塞
          const CHUNK_SIZE = 512
          for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE)
            session.shell.write(chunk)
            // 让出事件循环，允许其他任务执行
            if (i + CHUNK_SIZE < data.length) {
              await new Promise(r => setImmediate(r))
            }
          }
        }
      }
      //否则新建终端
      else {
        //记得call处理
        if (sendMode === "terminal" || inputText.match(/^> /g)) {
          let cmd = inputText.replace(/^> /g, "")
          let { customCwd } = comData.data.get()
          const session = await tSession.add(io, { listId: listId, cwd: customCwd }) // 绑定会话到列表
          session.shell.write(cmd + "\r")
          // Allow command to execute then check CWD
          tSession.checkCwd(session.tid)
        }
        else if (sendMode === "agent") {

          // 确定目标模型
          let targetModel = null;
          if (listId > 0) {
            targetModel = subAgents.get(listId);
          } else {
            targetModel = aiBasic.list.find((model) => {
              return model.name === comData.data.get().currentModel
            });
          }

          if (!targetModel) {
            let chat = {
              uuid: idTool.get(),
              content: listId > 0 ? trs("错误/找不到子智能体", { cn: `找不到子智能体 ID: ${listId}`, en: `Agent ID not found: ${listId}` }) : trs("错误/找不到模型", { cn: `找不到模型: ${comData.data.get().currentModel}`, en: `Model not found: ${comData.data.get().currentModel}` }),
              name: trs("角色/系统"),
              group: "user",
              timestamp: Date.now(),
              chatListId: listId
            }
            io.emit("chat", chat)
            await chats.add(chat, listId)
            //同步错误到所有模型上下文
            aiBasic.list.forEach((model) => {
              model.addAsk(chat.name, "user", chat.content, {
                id: chat.uuid
              })
            })
          }
          else {
            // 停止开关恢复
            // 注意：stop/streamChunks 逻辑在 comData 中是全局的。
            // 对于子智能体，我们可能需要在 'chatLists' 元数据中拥有独立状态？
            // V13 计划保持简单，共享全局 UI 指示器，还是假设独立？
            // 用户需求："独立记忆"。
            // UI 状态如 'replying' 在 comData.data.replying 中是全局的。

            // 重要：我们目前重置全局 stop，但理想情况下这应该是作用域化的。
            // 目前保留传统的全局行为。
            targetModel.noStopRun()
            await comData.data.edit((data) => {
              const list = data.chatLists.find(l => l.id === listId);
              if (list) list.stop = false;
            })
            await comData.data.edit((data) => {
              const list = data.chatLists.find(l => l.id === listId);
              if (list) list.streamChunks = "";
            })

            await targetModel.sendAskByMsgProtocol({
              toolsMode: comData.data.get().toolsMode,
              listId: listId,
              getExtraInfo: () => {
                const terminals = tSession.getSummary()
                const apps = appManager.getSummary()
                const { customCwd } = comData.data.get()
                const lang = options.json?.global_language?.value || 'cn'
                const langMap = {
                  cn: "中文",
                  en: "english",
                }
                return `
系统：${process.platform} ${process.arch}
${customCwd ? "用户指定工作目录：" + customCwd + ";" : ""}
${terminals.length > 0 ? "终端：" + JSON.stringify(terminals) + ";" : ""}
${apps.length > 0 ? "已启动app：" + JSON.stringify(apps) + ";" : ""}
!!!用户指定你只能使用${langMap[lang]}语言回复!!!`
              },
              async onSendAskBefore(aiAskInstance) {
                const aiList = await options.get("ai_aiList");
                let modelIndex = -1;

                const currentModelName = comData.data.get().currentModel;
                modelIndex = aiList.findIndex(m => m.name === currentModelName);

                if (!aiList[modelIndex]) {
                  throw new Error(trs("错误/找不到模型配置", { cn: "找不到模型对应的数据库模型配置（读取preToken错误）", en: "Model config not found (preToken read error)" }));
                }
                if (aiList[modelIndex].preTokens <= 0) {
                  throw new Error(trs("错误/余额不足", { cn: "已到达设置中preToken的预警值，preToken不足", en: "PreToken limit reached, insufficient tokens" }));
                }
              },
              async onTokenChange(aiAskInstance, usage) {
                const aiList = await options.get("ai_aiList");
                let modelIndex = -1;

                const currentModelName = comData.data.get().currentModel;
                modelIndex = aiList.findIndex(m => m.name === currentModelName);

                if (aiList[modelIndex]) {
                  aiList[modelIndex].preTokens = Number(aiList[modelIndex].preTokens) - Number(usage.totalT);
                  await options.set("ai_aiList", aiList);
                }
              },
              async onResponse(reply) {

                let mind, content
                let replyJSON = null
                let contentJSON = null
                mind = content = "";
                if (reply.role === "assistant") {
                  try {
                    contentJSON = JSON.parse(reply.content)
                    mind = contentJSON.mind
                    content = contentJSON.content

                    if (contentJSON.faceAction) {
                      await comData.data.edit((data) => {
                        data.faceAction = contentJSON.faceAction
                      })
                    }
                    if (contentJSON.playFace) {
                      await comData.data.edit((data) => {
                        data.playFaces.current = contentJSON.playFace
                      })
                    }

                  } catch (error) {
                    replyJSON = {
                      user: trs("crossFuncs/错误/系统错误"),
                      mind: trs("错误/解析错误", { cn: "解析错误", en: "Parse Error" }),
                      content: `原始json${reply}`
                    };
                  }
                } else {
                  mind = null;
                  content = reply.content;
                }
                let msg = `${mind ? `(${mind})\n` : ""}${content}`

                let chat = {
                  uuid: reply.id,
                  content: msg,
                  name: reply.user,
                  group: reply.group,
                  timestamp: Date.now(),
                  chatListId: listId, // 指派归属权
                  ask: {
                    ...reply,
                    content: contentJSON
                  }
                }
                io.emit("chat", chat)
                await chats.add(chat, listId)
                /* 这里不用添加，已经aiAsk里面是先加了Ask再执行这个函数
                aiBasic.list.forEach((model)=>{
                  model.addAsk(chat.name,"assistant",chat.content,{
                    id:chat.uuid
                  })
                }) */



              },
              async beforeRun() {
                const list = comData.data.get().chatLists.find(l => l.id === listId);
                if (list?.stop) {
                  targetModel.addAsk(trs("角色/系统"), "user", trs("消息/用户手动中断", { cn: "用户手动中断回复", en: "User manually interrupted" }))
                  targetModel.stopRun()
                }
                await comData.data.edit((data) => {
                  const list = data.chatLists.find(l => l.id === listId);
                  if (list) list.replying = targetModel.replying;
                })


              },
              async endRun() {
                await comData.data.edit((data) => {
                  const list = data.chatLists.find(l => l.id === listId);
                  if (list) list.replying = targetModel.replying;
                })
              },
              async streamFn({ chunk, replyChunk }) {
                await comData.data.edit((data) => {
                  const list = data.chatLists.find(l => l.id === listId);

                  if (list) {
                    list.streamChunks += replyChunk;
                  }
                })
              },

            })
          }

        }


      }


    } catch (error) {
      console.log(error)
      const errorListId = que?.chatListId || 0;
      await comData.data.edit(data => {
        const list = data.chatLists.find(l => l.id === errorListId);
        if (list) list.replying = false;
      })
      let chat = {
        uuid: idTool.get(),
        content: trs("crossFuncs/错误/系统错误") + error?.message,
        name: trs("角色/系统"),
        group: "error",
        timestamp: Date.now(),
        chatListId: que?.chatListId || 0
      }
      io.emit("chat", chat)
      await chats.add(chat, chat.chatListId)

      // 我们应该通过 addAsk 添加到上下文吗？ 
      // 原有代码是这样做的。让我们为主逻辑复制这一点。
      if (!chat.chatListId) {
        aiBasic.list.forEach((model) => {
          model.addAsk(chat.name, "user", chat.content, {
            id: chat.uuid
          })
        })
      }
    }
  })


}

export { tSession, TSession, idTool }