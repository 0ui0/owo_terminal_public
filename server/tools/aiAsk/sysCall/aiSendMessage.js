import chats from "../../../ioServer/ioApis/chat/chats.js"
import ioServer from "../../../ioServer/ioServer.js"
import subAgents from "../subAgents.js"
import aiBasic from "../basic.js"
import comData from "../../../comData/comData.js"
import Joi from "joi"

export default {
  name: "发送消息",
  id: "aiSendMessage",
  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj);
    if (error) return "错误：" + error.details[0].message;

    const { content } = value;
    const listId = metaData?.listId || 0;

    const { deferredFns, aiAskInstance } = metaData || {};

    // 提前确定发送者名称（闭包捕获），agent 的最终实例在 sendFn 内部解析
    let senderName;
    if (aiAskInstance) {
      senderName = aiAskInstance.name;
    } else if (listId === 0) {
      const currentModelName = comData.data.get().currentModel;
      const m = aiBasic.list.find(m => m.name === currentModelName);
      senderName = m ? m.name : "主控AI";
    } else {
      const m = subAgents.get(listId);
      senderName = m ? m.name : `智能体(List:${listId})`;
    }

    const sendFn = async () => {
      // 确定最终使用的 agent（优先 aiAskInstance，其次从 listId 查找）
      let agent = aiAskInstance;
      if (!agent) {
        if (listId === 0) {
          const currentModelName = comData.data.get().currentModel;
          agent = aiBasic.list.find(m => m.name === currentModelName);
        } else {
          agent = subAgents.get(listId);
        }
      }

      // 1. 先通过 agent.addAsk 将消息加入 AI 记忆，并获取标准的 ask 元数据对象
      const ask = agent.addAsk(senderName, "assistant", content, {
        group: "agent",
        listId: listId
      });

      // 2. 构造发往前端和数据库的 chat 对象，确保包含 ask 字段，与 ioApi_chat.js 保持 100% 一致
      const chat = {
        uuid: ask.id,
        content: content,
        name: senderName,
        group: "agent",
        timestamp: Date.now(),
        chatListId: listId,
        ask: ask
      };

      // 3. 广播到前端
      if (ioServer.io) {
        ioServer.io.emit("chat", chat);
      }

      // 4. 存入数据库（comData.chatLists）
      await chats.add(chat, listId);
    };

    // 如果处于工具调用周期中（deferredFns 由 AiAsk.coffee 注入），进入延迟队列，协议安全执行
    // 否则（如直接调用等场景）立即执行
    if (deferredFns) {
      deferredFns.push(sendFn);
      return "消息已加入延迟队列，将在本轮工具调用全部结束后发送。";
    } else {
      await sendFn();
      return "消息已发送";
    }

  },
  joi() {
    return Joi.object({
      content: Joi.string().required().description("消息正文 (支持 markdown)")
    });
  },
  getDoc() {
    return "往当前队列发送消息";
  }
}
