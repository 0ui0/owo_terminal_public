import { idTool } from "./ioApi_chat.js"
import comData from "../../../comData/comData.js"
import ioServer from "../../ioServer.js"
import appManager from "../../../apps/appManager.js"
import { trs } from "../../../tools/i18n.js"
import chats from "./chats.js"
import options from "../../../config/options.js"
import { parse as parseBestEffort, disableErrorLogging } from "best-effort-json-parser"
import yaml from "js-yaml"

disableErrorLogging()

export default function (json) {
  let {
    targetModel,
    listId,
    currentTokenConfig,
    extraConfig
  } = json
  let io = ioServer.io

  return {
    tokenCompressSwitch: comData.data.get().tokenCompressSwitch,
    toolsMode: comData.data.get().toolsMode,
    listId: listId,
    enableThinking: comData.data.get().enableThinking,
    thinkControl: comData.data.get().thinkControl,
    thinkStrength: comData.data.get().thinkStrength,
    tools: comData.data.get().toolsMode === 3
      ? appManager.getTools()
      : appManager.getTools().filter((tool) => {
        const toolsMode = comData.data.get().toolsMode
        const isHidden = typeof tool.hidden === 'function' ? tool.hidden(toolsMode) : !!tool.hidden
        return !isHidden
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
      await comData.data.edit(async (data) => {
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
          await chats.add(chat, listId)
          chats.refresh(listId)

          // 抛出错误以告知 AiAsk 触发重试喵
          throw new Error(errorMsg)
        }
      })
    },
    getExtraInfo: () => {
      const appList = appManager.getAppList(20)
      const appDetails = appManager.getAiSummary(5, 1000)
      const { customCwd } = comData.data.get()
      const lang = options.json?.global_language?.value || 'cn'
      const langMap = {
        cn: "用户指定你用中文回复",
        en: "User specified you to reply in English",
      }

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

      const parts = []
      parts.push(`系统：${process.platform} ${process.arch}`)
      parts.push(`时间：${timeStr} (${timezone})`)

      if (currentTokenConfig) {
        parts.push(`当前token余额：${currentTokenConfig.preTokens}`)
      }

      if (customCwd) {
        parts.push(`工作目录：${customCwd}`)
      }

      if (appList.length > 0) {
        const totalApps = appManager.getSummary().length
        const moreApps = totalApps > 20 ? `等共${totalApps}个` : ''
        parts.push(`Apps：[${appList.join(', ')}${moreApps}]`)
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
          const toolsMode = comData.data.get().toolsMode;

          if (toolsMode === 5) {
            // 模式 5：兼容纯 Markdown 加 <extJsonConfig> 的情况
            let extConfig = {};
            const match = reply.content.match(/<extJsonConfig>([\s\S]+?)<\/extJsonConfig>/);
            if (match && match[1]) {
              try {
                extConfig = JSON.parse(match[1].trim());
              } catch (e) {
                console.error("模式 5 extJsonConfig 解析失败:", e.message);
              }
            }
            // 剥离 <extJsonConfig> 标签，让前台拿到纯净的 markdown 内容
            const cleanContent = reply.content.replace(/<extJsonConfig>[\s\S]*?<\/extJsonConfig>/, "").trim();

            contentJSON = {
              mind: extConfig.mind || "...",
              mood: extConfig.mood ?? 5,
              content: cleanContent,
              playFace: extConfig.playFace || "无表情",
              faceAction: extConfig.faceAction || "none",
              graph: extConfig.graph || "我已知晓"
            };
          } else {
            // 其它普通模式：大模型直接返回全量 JSON 字符串
            contentJSON = JSON.parse(reply.content);
          }

          mind = contentJSON.mind
          content = contentJSON.content

          if (listId === 0) {

            if (contentJSON.playFace && contentJSON.playFace !== "无表情") {
              await comData.data.edit((data) => {
                data.playFaces.current = contentJSON.playFace
              })
            }

            if (contentJSON.faceAction && contentJSON.faceAction !== "none") {
              await comData.data.edit((data) => {
                data.faceAction = contentJSON.faceAction
              })
            }


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
      await chats.add(chat, listId)
      chats.refresh(listId)
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
              if (!list._hasLoggedStreamError) {
                console.log("[qqBot/Stream] 流json处理失败(仅提示一次):", e.message);
                list._hasLoggedStreamError = true;
              }
            }
          }
          if (reasoningChunk) list.streamReasoningChunks += reasoningChunk;
        }
      })
    },

    ...extraConfig
  }
}