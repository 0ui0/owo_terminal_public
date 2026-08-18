import chats from "../../../ioServer/ioApis/chat/chats.js"
import ioServer from "../../../ioServer/ioServer.js"
import subAgents from "../subAgents.js"
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

    // 提前确定发送者名称（闭包捕获），在真正的发送环节执行
    let senderName;
    let targetAgent = aiAskInstance || subAgents.get(listId);
    
    if (aiAskInstance) {
      senderName = aiAskInstance.name;
    } else {
      senderName = targetAgent ? targetAgent.name : (listId === 0 ? "主控AI" : `智能体(List:${listId})`);
    }

    const processSend = async () => {
      // 1. 先通过 addAsk 将消息加入 AI 记忆，并获取标准的 ask 元数据对象
      const ask = targetAgent.addAsk(senderName, "assistant", content, {
        group: "agent",
        listId: listId
      });

      // 2. 构造发往前端和数据库的 chat 对象，确保包含 ask 字段，与底层存储结构保持一致
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

      // 4. 存入数据库
      await chats.add(chat, listId);
    };

    // 如果处于工具调用周期中（deferredFns 由底层注入），进入延迟队列，确保安全执行
    // 否则直接执行
    if (deferredFns) {
      deferredFns.push(processSend);
      return "消息已加入延迟队列，将在本轮工具调用全部结束后发送。";
    } else {
      await processSend();
      return "消息已发送";
    }

  },
  joi() {
    return Joi.object({
      content: Joi.string().required().description("消息正文 (支持 markdown)")
    });
  },
  getDoc() {
    return "往你所在的当前队列发送消息，注意区分给智能体队列发送消息的工具。";
  }
}
