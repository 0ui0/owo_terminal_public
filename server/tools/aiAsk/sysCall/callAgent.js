
import chats from "../../../ioServer/ioApis/chat/chats.js"
import comData from "../../../comData/comData.js"
import { idTool } from "../../../ioServer/ioApis/chat/ioApi_chat.js"
import subAgents from "../subAgents.js"
import aiBasic from "../basic.js"
import options from "../../../config/options.js"
import ioServer from "../../../ioServer/ioServer.js"
import Joi from "joi"

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

      // 1. 确定调用者身份名称
      // 如果元数据里没有名字（例如主AI调用的），默认为 "主控AI" 还是 "系统"？
      // 如果是子AI调用的，metaData.user 通常是子AI名字。
      let finalSenderName = null
      if (!senderListId || senderListId === 0) {
        // 如果发送者是 0，或者是未定义的（系统调用），且没有名字
        finalSenderName = "主控AI";
      } else {
        finalSenderName = `智能体(List:${senderListId})`;
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

      // 3. 构造并发送消息
      let chat = {
        uuid: idTool.get(),
        content: content,
        name: finalSenderName,
        group: "user", // 以用户视角发送，触发 AI 回复
        timestamp: Date.now(),
        chatListId: targetListId
      };

      // 广播 & 存库
      if (ioServer.io) ioServer.io.emit("chat", chat);
      await chats.add(chat, targetListId);

      // 4. 添加到目标上下文
      targetAgent.addAsk(chat.name, "user", chat.content, {
        id: chat.uuid,
        listId: targetListId
      });

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

          await targetAgent.sendAskByMsgProtocol({
            toolsMode: comData.data.get().toolsMode,
            listId: targetListId,

            async onSendAskBefore(aiAskInstance) {
              const aiList = await options.get("ai_aiList");
              // 计费模型：无论主从，都使用从用户当前的模型里扣费
              const modelName = comData.data.get().currentModel;
              const modelConfig = aiList.find(m => m.name === modelName);

              if (!modelConfig) {
                throw new Error(`找不到扣除preToken模型 ${modelName} 的配置`);
              }
              if (modelConfig.preTokens <= 0) {
                throw new Error(`模型 ${modelName} preToken 不足`);
              }
            },

            async onTokenChange(aiAskInstance, usage) {
              const aiList = await options.get("ai_aiList");
              const modelName = comData.data.get().currentModel;
              const modelIndex = aiList.findIndex(m => m.name === modelName);

              if (modelIndex >= 0) {
                aiList[modelIndex].preTokens = Number(aiList[modelIndex].preTokens) - Number(usage.totalT);
                await options.set("ai_aiList", aiList);
              }
            },

            async onResponse(reply) {
              let mind, content;
              let replyJSON = null;
              let contentJSON = null;
              mind = content = "";

              if (reply.role === "assistant") {
                try {
                  contentJSON = JSON.parse(reply.content);
                  mind = contentJSON.mind;
                  content = contentJSON.content;

                  // 数人动作 (全局)
                  /* if (contentJSON.faceAction) {
                    await comData.data.edit(data => data.faceAction = contentJSON.faceAction);
                  }
                  if (contentJSON.playFace) {
                    await comData.data.edit(data => data.playFaces.current = contentJSON.playFace);
                  } */
                } catch (error) {
                  replyJSON = {
                    user: "系统错误",
                    mind: "解析错误",
                    content: `原始json${reply}`
                  };
                }
              } else {
                mind = null;
                content = reply.content;
              }

              let msg = `${mind ? `(${mind})\n` : ""}${content}`;

              let responseChat = {
                uuid: reply.id,
                content: msg,
                name: reply.user,
                group: reply.group,
                timestamp: Date.now(),
                chatListId: targetListId,
                ask: {
                  ...reply,
                  content: contentJSON
                }
              };

              if (ioServer.io) ioServer.io.emit("chat", responseChat);
              await chats.add(responseChat, targetListId);
            },

            async beforeRun() {
              const list = comData.data.get().chatLists.find(l => l.id === targetListId);
              if (list?.stop) {
                targetAgent.addAsk("系统", "user", "用户手动中断回复");
                targetAgent.stopRun();
              }
              await comData.data.edit((data) => {
                const l = data.chatLists.find(x => x.id === targetListId);
                if (l) l.replying = targetAgent.replying;
              });
            },

            async endRun() {
              await comData.data.edit((data) => {
                const l = data.chatLists.find(x => x.id === targetListId);
                if (l) l.replying = targetAgent.replying;
              });
            },

            async streamFn({ chunk, replyChunk }) {
              await comData.data.edit((data) => {
                const l = data.chatLists.find(x => x.id === targetListId);
                if (l) {
                  l.streamChunks += replyChunk;
                }
              });
            }
          });

        } catch (err) {
          console.error("CallAgent Execution Error:", err);
          let errorChat = {
            uuid: idTool.get(),
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
  getDoc: () => "向指定列表的智能体(主或从)发起呼叫对话，并强制启动其回复流程。"
}
