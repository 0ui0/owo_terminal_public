import { parse as parseBestEffort, disableErrorLogging } from "best-effort-json-parser"

import { v4 as uuidV4 } from "uuid"
import idTool from "../../../tools/idTool.js"
import { trs } from "../../../tools/i18n.js"
import yaml from "js-yaml"
import chats from "./chats.js"
import comData from "../../../comData/comData.js"
import aiBasic from "../../../tools/aiAsk/basic.js"
import AiAsk from "../../../tools/aiAsk/AiAsk.js"
import options from "../../../config/options.js"
import subAgents from "../../../tools/aiAsk/subAgents.js"
import appManager from "../../../apps/appManager.js"
import ioServer from "../../ioServer.js"
import timeMachineEngine from "../../../apps/owoTimeMachine/timeMachineEngine.js"
import pathLib from "path"
import getMsgProtocalConfig from "./getMsgProtocalConfig.js"

disableErrorLogging()

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
    sendMode = "agent"
    console.log("----------------------------------------")
    console.log("|| 从聊天框或工具处输入文本", inputText)
    console.log("----------------------------------------")

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

    //前台选定终端窗口的时候（在 xterm 内输入）
    // que.tid 是终端的 appId（新架构）
    if (que?.tid) {
      await appManager.dispatch(que.tid, "write", { data: que.chunk })
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
              chat.snapshotId = res.data.hash;
              await comData.data.edit((data) => {
                data.snapshots = []; // 物理清空全局 comData 中的 snapshots 冗余缓存
              });
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
      chats.refresh(listId)

      // --- [精准转发] 将本地输入的消息同步给物理 QQ 群 ---
      // [HMR 重要注意事项]：
      // 此处【绝对禁止】直接使用静态 import 引入 botMsgCenter，
      // 否则 ioApi_chat 将永远持有旧模块引用，导致热更新对消息转发失效。
      // 必须通过 appManager.dispatch 动态查找当前“活着”的最新实例。
      const qqBotApp = [...appManager.apps.values()].find(a => a.type === "qqBot");
      if (qqBotApp) {
        await appManager.dispatch(qqBotApp.id, "send", {
          source: "local",
          tag: chat.name,
          msg: chat.content,
          ext: { listId: listId }
        });
      }

      //去掉回复和引用
      if (!que.isSystemCall) {
        await comData.data.edit((data) => {
          data.quotes = []
          data.call = null
        })
      }
    }


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
      await chats.add(chat, listId)
      chats.refresh(listId)
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
      const currentTokenConfig = aiList.find(m => m.name === currentModelName)

      // 如果 AI 已经在思考中（递归循环内），则只记录消息不重复启动新的递归任务
      // AI 在当前任务的下一轮迭代会自动抓取到刚才 addAsk 进去的新消息
      if (targetModel.replying) return;

      // [精准拦截] 如果是 QQ 机器人相关的列表，且不是系统命令触发，则只同步记忆和转发，不触发 AI 自动思考
      const qqBotApp = [...appManager.apps.values()].find(a => a.type === "qqBot");
      const cfg = qqBotApp?.data?.config;
      const qqListIds = [
        ...(cfg?.["3rd_qqRobot_groups"] || []),
        ...(cfg?.["3rd_qqRobotLocal_groups"] || []),
        ...(cfg?.["3rd_qqRobot_channels"] || [])
      ].map(g => g.listId);

      // isSystemCall 为 true 时代表是系统工具、自动化脚本或游戏引擎发出的指令（非人类手动输入）。
      // 这种情况下即使在 QQ 列表也允许 AI 自动触发思考，以维持系统逻辑（如游戏回合推进）的连贯性。
      if (qqListIds.includes(listId) && !que.isSystemCall) {
        return;
      }

      await targetModel.sendAskByMsgProtocol(getMsgProtocalConfig({
        targetModel,
        listId,
        currentTokenConfig
      }))
    }


  } catch (error) {
    console.log(error)
    let { targetChatListId: errorListId } = comData.data.get()
    if (que.targetChatListId !== void 0) {
      errorListId = que.targetChatListId
    }

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
      chatListId: errorListId || 0
    }
    await chats.add(chat, chat.chatListId)
    chats.refresh(chat.chatListId)

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

export { idTool, socketOnChat }