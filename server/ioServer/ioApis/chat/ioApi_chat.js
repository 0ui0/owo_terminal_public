import { parse as parseBestEffort } from "best-effort-json-parser"
import { v4 as uuidV4 } from "uuid"
import idTool from "../../../tools/idTool.js"
import { trs } from "../../../tools/i18n.js"
import yaml from "js-yaml"
import chats from "./chats.js"
import comData from "../../../comData/comData.js"
import aiBasic from "../../../tools/aiAsk/basic.js"
import AiAsk from "../../../tools/aiAsk/AiAsk.js"
import TSession from "./TSession.js"
import options from "../../../config/options.js"
import subAgents from "../../../tools/aiAsk/subAgents.js"
import appManager from "../../../apps/appManager.js"
import ioServer from "../../ioServer.js"
import timeMachineEngine from "../../../apps/owoTimeMachine/timeMachineEngine.js"
import pathLib from "path"




const tSession = new TSession()

const socketOnChat = async (que, callback) => {
  let io = ioServer.io
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


    if (que.inputText) {
      inputText = que.inputText
    }
    if (que.call) {
      call = que.call
    }
    if (que.currentModel) {
      currentModel = que.currentModel
    }
    if (que.sendMode) {
      sendMode = que.sendMode
    }
    if (que.quotes) {
      quotes = que.quotes
    }
    if (que.targetChatListId !== void 0) {
      targetChatListId = que.targetChatListId
    }

    console.log("输入文本", inputText)

    // 确定目标队列 ID (优先级: 参数 > 全局 > 默认 0)
    const listId = targetChatListId

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
        uuid: idTool.get("chat"),
        content: inputText,
        name: trs("角色/用户"),
        group: "user",
        timestamp: Date.now(),
        chatListId: listId, // 指派归属权
        attachments: que.attachments || []
      }
      io.emit("chat", chat) // 广播到前端（由前端根据 listId 过滤）

      // --- 时光机：自动创建还原点 ---
      try {
        const projectRoot = comData.data.get()?.customCwd;
        const repoPath = pathLib.resolve(projectRoot, ".owoTimeMachine")

        if (projectRoot && repoPath) {
          console.log("[TimeMachine] 尝试自动快照:", { projectRoot, repoPath });
          const checkGitRes = await timeMachineEngine.checkGit()
          const isBackupRepoRes = await timeMachineEngine.isBackupRepo({ repoPath })

          if (checkGitRes.ok && isBackupRepoRes.ok) {
            const res = await timeMachineEngine.snapshot({ repoPath, message: `Auto-snapshot for message: ${inputText.substring(0, 30)}...`, msgId: chat.uuid });
            if (res.ok) {
              console.log("[TimeMachine] 自动快照成功:", projectRoot, "MsgId:", chat.uuid);
              // 同备到全局 comData
              const history = await timeMachineEngine.getHistory({ repoPath });
              if (history.ok) {
                await comData.data.edit((data) => {
                  data.snapshots = history.data;
                });
              }
            } else {
              console.error("[TimeMachine] 自动快照失败:", res.msg);
            }
          }
        } else {
          console.warn("[TimeMachine] 自动快照跳过: 项目未就绪或路径无效", { projectRoot, repoPath });
        }
      } catch (e) {
        console.error("时光机自动快照失败:", e);
      }

      let ask = null

      // --- 智能路由 ---
      if (listId > 0) {
        // 子智能体路由
        const subAgent = subAgents.get(listId);
        if (subAgent) {
          let ext = { id: chat.uuid, listId: listId, attachments: que.attachments || [] };
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
            listId: 0,
            attachments: que.attachments || []
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
      if (!que.isSystemCall) {
        await comData.data.edit((data) => {
          data.quotes = []
          data.call = null
        })
      }
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
            uuid: idTool.get("sys"),
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

          const aiList = await options.get("ai_aiList")
          const currentModelName = comData.data.get().currentModel
          const currentConfig = aiList.find(m => m.name === currentModelName)

          // 如果 AI 已经在思考中（递归循环内），则只记录消息不重复启动新的递归任务
          // AI 在当前任务的下一轮迭代会自动抓取到刚才 addAsk 进去的新消息
          if (targetModel.replying) return;

          await targetModel.sendAskByMsgProtocol({
            toolsMode: comData.data.get().toolsMode,
            listId: listId,
            enableThinking: comData.data.get().enableThinking,
            thinkControl: comData.data.get().thinkControl,
            thinkStrength: comData.data.get().thinkStrength,
            tools: comData.data.get().toolsMode === 3
              ? appManager.getTools()
              : appManager.getTools().filter((tool) => {
                return !tool.hidden
              }),

            onMemoryChange: async (aiAskInstance, notes) => {
              await comData.data.edit((data) => {
                const list = data.chatLists.find(l => l.id === listId);
                if (list) {
                  list.notes = notes; // 复用 memorys 历史作为可视化笔记
                }
              })
            },
            onTaskChange: async (aiAskInstance, tasks) => {
              await comData.data.edit((data) => {
                const chatList = data.chatLists.find(l => l.id === listId)
                if (!chatList) return

                const currentTasks = chatList.tasks || []
                const errors = []

                if (!tasks || tasks.length === 0) {
                  errors.push(`[规则校验失败] 每次对话必须提供任务清单，严禁返回空数组。`)
                } else {
                  // 计算当前最大 ID
                  let maxId = 0
                  currentTasks.forEach(t => { if (t.taskid > maxId) maxId = t.taskid })

                  tasks.forEach(taskInput => {
                    if (taskInput.subtasks === undefined || taskInput.subtasks.length === 0) {
                      errors.push(`[数据错误] 任务「${taskInput.name}」必须包含至少一个子任务。`)
                      return
                    }
                    if (taskInput.mode === 'update') {
                      if (taskInput.taskid === undefined) {
                        errors.push(`[参数缺失] 更新模式(update)必须提供 taskid。任务名:「${taskInput.name}」`)
                        return
                      }
                      // 更新逻辑
                      const existingTask = currentTasks.find(t => t.taskid === taskInput.taskid)
                      if (existingTask) {
                        if (taskInput.name !== undefined) existingTask.name = taskInput.name
                        if (taskInput.status !== undefined) existingTask.status = taskInput.status
                        if (taskInput.process !== undefined) existingTask.process = taskInput.process
                        if (taskInput.subtasks) {
                          existingTask.subtasks = taskInput.subtasks.map((st, index) => ({
                            subtaskid: index + 1,
                            name: st.name,
                            status: st.status || "规划中",
                            process: st.process ?? 0
                          }))
                        }
                      } else {
                        errors.push(`[ID 错误] 未找到 taskid:${taskInput.taskid}，无法更新任务「${taskInput.name}」。请检查任务清单中的有效 ID。`)
                      }
                    } else if (taskInput.mode === 'add') {
                      // 新增逻辑
                      maxId++
                      const newTask = {
                        taskid: maxId,
                        name: taskInput.name || "未命名任务",
                        status: taskInput.status || "规划中",
                        process: taskInput.process ?? 0,
                        subtasks: (taskInput.subtasks || []).map((st, index) => ({
                          subtaskid: index + 1,
                          name: st.name,
                          status: st.status || "规划中",
                          process: st.process ?? 0
                        }))
                      }
                      currentTasks.push(newTask)
                    }
                  })
                }
                chatList.tasks = currentTasks

                // 如果有错误，立即插入系统提示并抛出异常触发重试喵
                if (errors.length > 0) {
                  const errorMsg = errors.join("\n")
                  let chat = {
                    uuid: idTool.get("sys"),
                    content: "⚠️ 任务同步失败：\n" + errorMsg,
                    name: trs("角色/系统"),
                    group: "error",
                    timestamp: Date.now(),
                    chatListId: listId
                  }
                  io.emit("chat", chat)
                  chats.add(chat, listId)

                  // 抛出错误以告知 AiAsk 触发重试喵
                  throw new Error(errorMsg)
                }
              })
            },
            getExtraInfo: () => {
              const appList = appManager.getAppList(20)
              const terminals = tSession.getSummary(5)
              const appDetails = appManager.getAiSummary(5, 1000)
              const { customCwd } = comData.data.get()
              const lang = options.json?.global_language?.value || 'cn'
              const langMap = {
                cn: "用户指定你用中文回复",
                en: "User specified you to reply in English",
              }

              // 获取当前时间和地区
              const now = new Date()
              const timeStr = now.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              })
              const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

              // 组装易读的系统信息
              const parts = []
              parts.push(`系统：${process.platform} ${process.arch}`)
              parts.push(`时间：${timeStr} (${timezone})`)

              if (currentConfig) {
                parts.push(`当前token余额：${currentConfig.preTokens}`)
              }

              if (customCwd) {
                parts.push(`工作目录：${customCwd}`)
              }

              if (appList.length > 0) {
                const totalApps = appManager.getSummary().length
                const moreApps = totalApps > 20 ? `等共${totalApps}个` : ''
                parts.push(`Apps：[${appList.join(', ')}${moreApps}]`)
              }

              if (terminals.length > 0) {
                const termStr = terminals.map(t => `${t.tid}:${t.cwd || '?'}`).join(', ')
                const moreTerms = Object.keys(tSession.sessions).length > 5 ? `等共${Object.keys(tSession.sessions).length}个` : ''
                parts.push(`终端：${termStr}${moreTerms}`)
              }

              if (appDetails.length > 0) {
                parts.push('活跃Apps：\n' + appDetails.join('\n---\n'))
              }

              // 1. 插入网点图骨架 (网点图先行)
              const graph = comData.data.get().chatLists.find(l => l.id === listId)?.graph || { nodes: {}, links: [] }
              let graphStr = '【推理网点图】\n'
              if (graph.nodes && Object.keys(graph.nodes).length > 0) {
                for (const id in graph.nodes) {
                  graphStr += `- [节点] ID:${id}, 标签:${graph.nodes[id].label || '无'}\n`
                }
                if (graph.links && graph.links.length > 0) {
                  graph.links.forEach(l => {
                    graphStr += `- [连线] ${l.source} --> ${l.target}\n`
                  })
                }
              } else {
                graphStr += '空\n'
              }
              parts.push(graphStr.trim())

              // 2. 插入任务清单
              const tasks = comData.data.get().chatLists.find(l => l.id === listId)?.tasks || []
              let taskStr = '【任务清单】\n'
              if (tasks.length > 0) {
                tasks.forEach(t => {
                  taskStr += `- [${t.status}] (taskid:${t.taskid}) ${t.name} (进度：${t.process}%)\n`
                  if (t.subtasks && t.subtasks.length > 0) {
                    t.subtasks.forEach(st => {
                      taskStr += `  └─ [${st.status}] (subtaskid:${st.subtaskid}) ${st.name} (进度：${st.process}%)\n`
                    })
                  }
                })
              } else {
                taskStr += '空\n'
              }


              parts.push(langMap[lang])
              parts.push(taskStr.trim())

              return '\n' + parts.join('\n') + '\n'
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
            async onRollMemory(status) {
              await comData.data.edit((data) => {
                const list = data.chatLists.find(l => l.id === listId);
                if (list) {
                  if (status === "start") {
                    list.replying = true;
                    list.streamChunks = trs("消息/正在整理记忆", { cn: "正在整理记忆...", en: "Optimizing memory..." });
                    list.streamReasoningChunks = ""; // 清除回复阶段残留的思考链
                    list.streamDisplayContent = "";
                  } else {
                    list.replying = false;
                    list.streamChunks = "";
                  }
                }
              })
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

                  if (contentJSON.playFace && contentJSON.playFaces !== "无表情") {
                    await comData.data.edit((data) => {
                      data.playFaces.current = contentJSON.playFace
                    })
                  }

                  if (contentJSON.faceAction && contentJSON.faceAction !== "none") {
                    await comData.data.edit((data) => {
                      data.faceAction = contentJSON.faceAction

                    })
                  }


                } catch (error) {
                  replyJSON = {
                    user: trs("crossFuncs/错误/系统错误"),
                    mind: trs("错误/解析错误", { cn: "解析错误", en: "Parse Error" }),
                    content: `原始json${reply.content}`
                  };
                }
              } else {
                mind = null;
                content = reply.content;
              }
              let msg = `${mind ? `> (${mind})\n\n` : ""}${content}`

              let chat = {
                uuid: reply.id,
                content: msg,
                reasoning: reply.reasoning, // 保存推理思维链
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
                if (list) {
                  list.replying = targetModel.replying;
                  list.streamChunks = "";
                  list.streamDisplayContent = "";
                  list.streamReasoningChunks = "";
                }
              })


            },
            async endRun() {
              await comData.data.edit((data) => {
                const list = data.chatLists.find(l => l.id === listId);
                if (list) {
                  list.replying = targetModel.replying;
                  list.streamChunks = "";
                  list.streamDisplayContent = "";
                  list.streamReasoningChunks = ""; // 运行结束，清理流缓冲
                }
              })
            },
            async streamFn({ chunk, replyChunk, reasoningChunk }) {
              await comData.data.edit((data) => {
                const list = data.chatLists.find(l => l.id === listId);

                if (list) {
                  if (replyChunk) {
                    list.streamChunks += replyChunk; // 依然保持原生的 streamChunks 协议完整

                    // --- 顶配提取器：使用成熟库从 list.streamChunks 中抠出当前最完整的正文 ---
                    try {
                      const partial = parseBestEffort(list.streamChunks);
                      if (partial) {
                        // 同步正式文本渲染逻辑：(mind)content
                        const mindPart = partial.mind ? `> (${partial.mind})\n\n` : "";
                        const contentPart = partial.content || "";
                        let notePart = "";
                        if (partial.note) {
                          const noteContent = (typeof partial.note === 'object' && partial.note !== null) ? yaml.dump(partial.note) : partial.note;
                          notePart = "\n\n---\n**【思考笔记】**\n" + noteContent;
                        }
                        list.streamDisplayContent = mindPart + contentPart + notePart;
                      }
                    } catch (e) {
                      console.log("流json处理失败", e)
                    }
                  }
                  if (reasoningChunk) list.streamReasoningChunks += reasoningChunk;
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
      uuid: idTool.get("sys"),
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
}

export default ({ socket, server, io, db, verifyCookie }) => {
  socket.on("chat", socketOnChat)
}

export { tSession, TSession, idTool, socketOnChat }