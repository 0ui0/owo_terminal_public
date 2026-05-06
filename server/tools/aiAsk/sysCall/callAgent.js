import chats from "../../../ioServer/ioApis/chat/chats.js"
import comData from "../../../comData/comData.js"
import { socketOnChat } from "../../../ioServer/ioApis/chat/ioApi_chat.js"
import idTool from "../../idTool.js"
import subAgents from "../subAgents.js"
import aiBasic from "../basic.js"
import options from "../../../config/options.js"
import ioServer from "../../../ioServer/ioServer.js"
import Joi from "joi"

import getMsgProtocalConfig from "../../../ioServer/ioApis/chat/getMsgProtocalConfig.js"

export default {
  name: "呼叫智能体",
  id: "callAgent",
  async fn(argObj, metaData) {
    try {
      const { value, error } = this.joi().validate(argObj);
      if (error) {
        return "错误：" + error.details[0].message;
      }
      const { targetListId, content } = value;
      const { listId: senderListId } = metaData;

      // 禁止自我呼叫
      if (targetListId === senderListId) {
        return "错误：禁止呼叫自己。";
      }

      // 1. 确定调用者身份名称
      // 如果元数据里没有名字（例如主AI调用的），默认为 "主控AI" 还是 "系统"？
      // 如果是子AI调用的，metaData.user 通常是子AI名字。
      let finalSenderName = null
      if (!senderListId || senderListId === 0) {
        // 如果发送者是 0，或者是未定义的（系统调用），且没有名字
        finalSenderName = "主控AI";
      } else {
        // 尝试获取子智能体真实名称
        const senderAgent = subAgents.get(senderListId);
        if (senderAgent) {
          finalSenderName = senderAgent.name;
        } else {
          finalSenderName = `智能体(List:${senderListId})`;
        }
      }

      // 2. 路由目标 Agent
      let targetAgent = null;
      let targetListIdArg = targetListId;

      if (targetListId === 0) {
        // 呼叫主 AI -> 获取当前活跃的主模型
        const currentModelName = comData.data.get().currentModel;
        targetAgent = aiBasic.list.find(m => m.name === currentModelName);
        if (!targetAgent) {
          return `错误：找不到当前活跃的主模型 (${currentModelName})`;
        }
      } else {
        // 呼叫子 AI
        targetAgent = subAgents.get(targetListId);
        if (!targetAgent) {
          return `错误：找不到 ID 为 ${targetListId} 的子智能体`;
        }
      }

      // 3. 添加到目标上下文并构造消息
      const ask = targetAgent.addAsk(finalSenderName, "user", content, {
        id: idTool.get("chat"), // 呼叫属于行为消息，使用与 ioApi_chat 一致的 chat_ 前缀
        listId: targetListId
      });

      let chat = {
        uuid: ask.id,
        content: content,
        name: finalSenderName,
        group: "user", // 以用户视角发送，触发 AI 回复
        timestamp: Date.now(),
        chatListId: targetListId,
        ask: ask
      };

      // 4. 广播 & 存库
      if (ioServer.io) ioServer.io.emit("chat", chat);
      await chats.add(chat, targetListId);

      // 5. 触发执行循环 (复制 ioApi_chat.js 核心逻辑)
      (async () => {
        try {
          // 初始化 UI 状态
          targetAgent.noStopRun();
          await comData.data.edit((data) => {
            const list = data.chatLists.find(l => l.id === targetListId);
            if (list) {
              list.stop = false;
              list.replying = true;
              list.streamChunks = "";
            }
          });

          // 获取当前模型配置用于 Token 统计
          const aiList = await options.get("ai_aiList");
          const modelName = comData.data.get().currentModel;
          const currentTokenConfig = aiList.find(m => m.name === modelName);

          await targetAgent.sendAskByMsgProtocol(getMsgProtocalConfig({
            targetModel: targetAgent,
            listId: targetListId,
            currentTokenConfig
          }))

          // 自动汇报检测逻辑
          if (targetListId !== 0) { // 仅针对子智能体
            const lastMsg = targetAgent.asks.at(-1); // 获取子智能体上下文最后一条记忆

            // 检查最后一条消息是否包含 callAgent 调用
            let hasReported = false;
            if (lastMsg.role === 'assistant') {
              // 检查 toolCalls
              if (lastMsg.toolCalls?.some(t => t.function.name === 'callAgent')) {
                hasReported = true;
              }
              // 检查 sysCalls (兼容旧协议)
              if (lastMsg.sysCalls?.some(c => c.name === 'callAgent')) {
                hasReported = true;
              }
            }

            if (!hasReported) {
              // 由系统代为汇报给调用者（senderListId，若无则发给主列表 0）
              const reportContent = `【系统自动汇报】\n检测到智能体【${targetAgent.name}】任务已结束，但未主动汇报。请检查其上下文。`;

              // 使用 socketOnChat 模拟消息发送
              if (socketOnChat) {
                await socketOnChat({
                  targetChatListId: senderListId,
                  inputText: reportContent,
                  name: "系统",
                  group: "user", // 模拟用户消息
                  sendMode: "agent",
                  isSystemCall: true
                });
              }
            }
          }

        } catch (err) {
          console.error("CallAgent Execution Error:", err);
          let errorChat = {
            uuid: idTool.get("sys"),
            content: "执行错误: " + err.message,
            name: "系统",
            group: "error",
            timestamp: Date.now(),
            chatListId: targetListId
          };
          if (ioServer.io) ioServer.io.emit("chat", errorChat);
          await chats.add(errorChat, targetListId);

          await comData.data.edit(data => {
            const l = data.chatLists.find(x => x.id === targetListId);
            if (l) l.replying = false;
          });
        }
      })();

      return `已呼叫列表 ${targetListId} 的智能体 (${targetAgent.name}) 并发送消息：${content}`;

    } catch (err) {
      console.error(err);
      return "呼叫失败: " + err.message;
    }
  },
  joi: () => {
    return Joi.object({
      targetListId: Joi.number().required().description("目标列表 ID (0为主AI，其他为子AI)"),
      content: Joi.string().required().description("发送给目标的消息内容")
    })
  },
  getDoc: () => "向指定列表的智能体(主或从)发起呼叫对话，并强制启动其回复流程。执行结束后系统会自动提醒你"
}
