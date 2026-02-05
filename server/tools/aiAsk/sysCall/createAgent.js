import comData from "../../../comData/comData.js"
import AiAsk from "../AiAsk.js" // Compiled JS 
import subAgents from "../subAgents.js"
import { idTool } from "../../../ioServer/ioApis/chat/ioApi_chat.js"
import chats from "../../../ioServer/ioApis/chat/chats.js"
import ioServer from "../../../ioServer/ioServer.js"
import Joi from "joi"
import aiBasic from "../basic.js" // To copy config

export default {
  name: "创建智能体",
  id: "createAgent",
  async fn(argObj, metaData) {
    try {
      const { value, error } = this.joi().validate(argObj);
      if (error) {
        return "错误：" + error.details[0].message;
      }
      const { name, prompt } = value;
      const { listId } = metaData;

      let newListId = 0;
      let currentListId = listId;
      let toolCallGroupId = metaData?.toolCallGroupId

      console.log("智能体tcgid", toolCallGroupId)

      await comData.data.edit((data) => {
        // 计算新 ID
        if (!data.chatLists) {
          data.chatLists = [{ id: 0, linkid: 0, data: data.chatList || [] }];
        }

        // 获取最大 ID
        const maxId = data.chatLists.reduce((max, l) => Math.max(max, l.id), 0);
        newListId = maxId + 1;

        // 确定当前上下文（父级）已经在上面确定了 (currentListId)
        // currentListId = data.targetChatListId || 0; // Removed legacy fallback block

        // 创建物理列表
        data.chatLists.push({
          id: newListId,
          linkid: currentListId,
          data: []
        });
      });

      // 将容器消息插入父列表
      let containerMsg = {
        uuid: idTool.get(),
        content: `创建子AI: ${name}`,
        name: "系统", // System -> 系统
        group: "childChatList", // 前端使用它来渲染唯一的 UI
        timestamp: Date.now(),
        chatListId: currentListId,
        ask: {
          toolCallGroupId: toolCallGroupId,
        },
        ext: {
          targetSubListId: newListId,
          agentName: name
        }
      };
      // 发送到父列表，触发滚动条和终端推送
      if (ioServer.io) {
        ioServer.io.emit("chat", containerMsg);
      }
      // 并同步到数据库（add comData->chatLists）
      await chats.add(containerMsg, currentListId);


      // 实例化子智能体

      // 1. 获取当前全局选中的模型配置
      const currentModelName = comData.data.get().currentModel;
      const selectedModel = aiBasic.list.find(m => m.name === currentModelName);

      if (!selectedModel) {
        return `错误：找不到当前选中的模型配置 (${currentModelName})`;
      }

      // 2. 使用选中模型的配置 (apiKey, baseURL, model)
      const baseConfig = selectedModel.aiConfig;

      // 强制注入“通讯闭环”指令
      const forcedInstruction = `
【系统通讯协议】
本环境支持多智能体通讯。你可以使用 callAgent发起或回复通讯。
若收到其他智能体的呼叫或任务指令，请在任务执行完毕后，务必使用 callAgent 向发送方汇报结果（注：主控AI的列表ID固定为 0，不调用工具直接回复他们是看不到的。）。
`.trim();

      const finalPrompt = `${prompt}\n\n${forcedInstruction}`;

      const newAgent = new AiAsk({
        apiKey: baseConfig.apiKey,
        baseURL: baseConfig.baseURL,
        model: baseConfig.model,
        name: name,
        prompt: finalPrompt
      });

      // 3. 初始化实例
      // 必须调用 init() 以创建 OpenAI 客户端连接和初始 System Prompt
      await newAgent.init({
        apiKey: baseConfig.apiKey,
        baseURL: baseConfig.baseURL,
        model: baseConfig.model,
        prompt: finalPrompt,
        name: name
      });

      // 注册
      subAgents.add(newListId, newAgent);

      return `智能体 ${name} 已创建，listId 为 ${newListId}`;

    } catch (err) {
      console.error(err);
      return "错误创建智能体: " + err.message;
    }
  },
  joi: () => {
    return Joi.object({
      name: Joi.string().required().description("子智能体名称"),
      prompt: Joi.string().required().description("子智能体提示词")
    })
  },
  getDoc: () => "创建一个带有自己聊天队列的新子智能体 。"
}
