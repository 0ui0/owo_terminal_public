import { parse as parseBestEffort, disableErrorLogging } from "best-effort-json-parser"

import { v4 as uuidV4 } from "uuid"
import idTool from "../../../tools/idTool.js"
import { trs } from "../../../tools/i18n.js"
import yaml from "js-yaml"
import chats from "./chats.js"
import comData from "../../../comData/comData.js"
import AiAsk from "../../../tools/aiAsk/AiAsk.js"
import options from "../../../config/options.js"
import subAgents from "../../../tools/aiAsk/subAgents.js"
import appManager from "../../../apps/appManager.js"
import ioServer from "../../ioServer.js"
import timeMachineEngine from "../../../apps/owoTimeMachine/timeMachineEngine.js"
import pathLib from "path"
import getMsgProtocalConfig from "./getMsgProtocalConfig.js"
import workDirTool from "../../../tools/workDirTool.js"

disableErrorLogging()

const socketOnChat = async (que, callback) => {
  let io = ioServer.io
  try {
    // 前台选定终端窗口的时候（在 xterm 内直接敲击键盘）
    // 前端遗留的 ChatTerm.js 目前依然复用了 chat 事件通道来发送按键 chunk
    if (que?.tid && que?.chunk !== undefined) {
      await appManager.dispatch(que.tid, "write", { data: que.chunk });
      return;
    }

    // 1. 参数与环境解析
    let inputText = que.inputText ?? comData.data.get().inputText;
    let call = que.call ?? null;
    let quotes = que.quotes ?? [];

    // 获取最终目标 listId：如果是前端聊天框发来的带 targetChatListId，则优先采用，否则使用普通的 listId 或主队列 0
    let listId = que.targetChatListId ?? que.listId ?? 0;

    console.log("----------------------------------------")
    console.log("|| 从聊天框或工具处输入文本", inputText)
    console.log("----------------------------------------")

    // 2. 提取队列级配置
    const listConfig = comData.getChatList(listId);
    let currentModelId = que.currentModelId ?? listConfig.currentModelId ?? null;
    const mainWorkDir = workDirTool.getMainWorkDir(listId);

    // 预先生成消息 UUID 供时光机使用
    const chatUuid = idTool.get("chat");
    let snapshotId = null;

    // 3. 时光机自动快照拦截
    try {
      if (mainWorkDir) {
        const repoPath = pathLib.resolve(mainWorkDir, ".owoTimeMachine")
        console.log("[TimeMachine] 尝试自动快照:", { mainWorkDir, repoPath });
        const checkGitRes = await timeMachineEngine.checkGit()
        const isBackupRepoRes = await timeMachineEngine.isBackupRepo({ repoPath })

        if (checkGitRes.ok && isBackupRepoRes.ok) {
          const res = await timeMachineEngine.snapshot({ repoPath, message: `Auto-snapshot for message: ${inputText.substring(0, 30)}...`, msgId: chatUuid });
          if (res.ok) {
            console.log("[TimeMachine] 自动快照成功:", mainWorkDir, "MsgId:", chatUuid);
            snapshotId = res.data.hash;
          } else {
            console.error("[TimeMachine] 自动快照失败:", res.msg);
          }
        }
      }
    } catch (e) {
      console.error("时光机自动快照失败:", e);
    }

    // 预先构造用户发送的基础 Chat 实体，数据库字段
    let chat = {
      uuid: chatUuid,
      content: inputText,
      name: trs("角色/用户"),
      group: "user",
      timestamp: Date.now(),
      chatListId: listId,
      attachments: que.attachments || [],
      snapshotId: snapshotId,
      ext: {}
    };



    // 5. 获取目标智能体并注入上下文
    const agent = subAgents.get(listId);

    if (!agent) {
      // 找不到模型，走异常报错流，直接入库并退出
      await chats.add(chat, listId); // 保存用户的问题

      let errorChat = {
        uuid: idTool.get("sys"),
        content: listId > 0
          ? trs("错误/找不到子智能体", { cn: `找不到子智能体 ID: ${listId}`, en: `Agent ID not found: ${listId}` })
          : trs("错误/找不到模型", { cn: `找不到模型id: ${currentModelId}，请检查是否选择了模型，以及后台模型列表的配置是否正确`, en: `Model id not found: ${currentModelId}, please check model selection and backend model list config` }),
        name: trs("角色/系统"),
        group: "error", // 改为 error 以在 UI 上有区分
        timestamp: Date.now(),
        chatListId: listId
      }
      await chats.add(errorChat, listId);
      ioServer.io.emit("chat:push", { listId })
      return;
    }

    const ask = agent.addAsk(chat.name, "user", chat.content, {
      id: chat.uuid,
      listId: listId,
      attachments: chat.attachments,
      call: call?.uuid,
      quotes: quotes?.map(quote => quote.uuid) || [],
    });

    chat.ask = ask;


    // 6. 落库及同步事件
    await chats.add(chat, listId);
    ioServer.io.emit("chat:push", { listId })

    // 同步给物理 QQ 群
    const qqBotApp = [...appManager.apps.values()].find(a => a.type === "qqBot");
    if (qqBotApp) {
      await appManager.dispatch(qqBotApp.id, "send", {
        source: "local",
        tag: chat.name,
        msg: chat.content,
        ext: { listId: listId }
      });
    }

    // 7. 启动模型思考
    agent.noStopRun();
    await comData.editChatList(listId, (list) => {
      list.stop = false;
      list.streamChunks = "";
    });

    const aiList = await options.get("ai_aiList");
    const currentTokenConfig = aiList.find(m => m.id === currentModelId);

    // 防重入：如果在思考中，则退出（上面的 addAsk 已经被录入上下文循环，下一帧会自动处理）
    if (agent.replying) return;

    // QQ Bot 白名单拦截逻辑
    const cfg = qqBotApp?.data?.config;
    const qqListIds = [
      ...(cfg?.["3rd_qqRobot_groups"] || []),
      ...(cfg?.["3rd_qqRobotLocal_groups"] || []),
      ...(cfg?.["3rd_qqRobot_channels"] || [])
    ].map(g => g.listId);

    if (qqListIds.includes(listId) && !que.isSystemCall) {
      return;
    }

    // 正式触发大模型
    await agent.sendAskByMsgProtocol(getMsgProtocalConfig({
      targetModel: agent,
      listId,
      currentTokenConfig
    }));

  } catch (error) {
    console.error(error);
    let errorListId = typeof listId === 'number' ? listId : (que.listId ?? 0);

    await comData.editChatList(errorListId, list => {
      list.replying = false;
    });

    let chat = {
      uuid: idTool.get("sys"),
      content: trs("crossFuncs/错误/系统错误") + error?.message,
      name: trs("角色/系统"),
      group: "error",
      timestamp: Date.now(),
      chatListId: errorListId || 0
    };
    await chats.add(chat, chat.chatListId);
    ioServer.io.emit("chat:push", { listId: errorListId })
  }
}

export default ({ socket, server, io, db, verifyCookie }) => {
  socket.on("chat", socketOnChat)
}

export { idTool, socketOnChat }