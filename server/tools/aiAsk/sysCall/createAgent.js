import comData from "../../../comData/comData.js"
import AiAsk from "../AiAsk.js" // Compiled JS
import subAgents from "../subAgents.js"
import idTool from "../../idTool.js"
import chats from "../../../ioServer/ioApis/chat/chats.js"
import ioServer from "../../../ioServer/ioServer.js"
import Joi from "joi"
import aiBasic from "../basic.js" // To copy config

export default {
  name: "创建智能体",
  id: "createAgent",
  async fn(argObj, metaData) {
    try {
      //系统QQ机器人用特殊参数，对ai隐藏
      const isBotAgent = argObj.isBotAgent
      const noAutoOpen = argObj.noAutoOpen
      const derivedFromAgentName = argObj.derivedFromAgentName

      const { value, error } = this.joi().validate(argObj);
      if (error) {
        return {
          ok: false,
          msg: "错误：" + error.details[0].message
        };
      }
      const { name, prompt } = value;
      const { listId } = metaData;



      //【注意】这里的currentModel用的是智能体名，不是模型名，一个模型可以创建多个智能体
      const currentModelName = derivedFromAgentName ?? comData.data.get().currentModel;
      const selectedModel = aiBasic.list.find(m => m.name === currentModelName);
      //必须找name，不能找model，同一个模型允许创建多个智能体。
      if (!selectedModel) {
        return {
          ok: false,
          msg: `错误：找不到当前选中的模型配置，请先选择一个ai模型 (${currentModelName})`
        };
      }


      let newListId = 0;
      let currentListId = listId;
      let toolCallGroupId = metaData?.toolCallGroupId

      console.log("智能体tcgid", toolCallGroupId)




      await comData.data.edit((data) => {
        // 计算新 ID
        if (!data.chatLists) {
          data.chatLists = [{
            id: 0,
            linkid: 0,
            data: data.chatList || [],
            replying: false,
            streamChunks: "",
            streamDisplayContent: "",
            streamReasoningChunks: "",
            confirmCmds: [],
            stop: false,
            tasks: [],
            notes: [],
            graph: { nodes: {}, links: [] },
          }];
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
          data: [],
          replying: false,
          streamChunks: "",
          streamDisplayContent: "",
          streamReasoningChunks: "",
          confirmCmds: [],
          stop: false,
          tasks: [],
          notes: [],
          graph: {
            nodes: {},
            links: []
          }
        });
      });

      // 将容器消息插入父列表
      let containerMsg = {
        uuid: idTool.get("agent"),
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


      // 如果不是机器人消息，发送到父列表，触发滚动条和终端推送
      if (!isBotAgent) {
        if (ioServer.io) {
          ioServer.io.emit("chat", containerMsg);
        }
        // 并同步到数据库（add comData->chatLists）
        await chats.add(containerMsg, currentListId);
      }




      // 2. 使用选中模型的配置 (apiKey, baseURL, model)
      // 2. 使用选中模型的配置 (apiKey, baseURL, model)
      const baseConfig = selectedModel.aiConfig;

      // 解析创建者名称
      let creatorName = "主控AI";
      if (currentListId > 0) {
        const creatorAgent = subAgents.get(currentListId);
        if (creatorAgent) {
          creatorName = creatorAgent.name;
        } else {
          creatorName = `智能体(List:${currentListId})`;
        }
      }

      // 强制注入“通讯闭环”指令
      const forcedInstruction = `
【系统通讯协议】
你叫【${name}】。
你的最高上级是【主控AI】（通讯ID固定为 0）。
你的创建者（直属来源）是【${creatorName}】（通讯ID：${currentListId}）。
本环境支持多智能体通讯。你可以使用 callAgent 发起或回复通讯。
重要规则：若收到其他智能体的呼叫或任务指令，请在任务执行完毕后，务必使用 callAgent 优先向【发送指令的来源方】汇报结果。
`.trim();

      const finalPrompt = `${prompt}\n\n${forcedInstruction}`;

      const newAgent = new AiAsk({
        apiKey: baseConfig.apiKey,
        baseURL: baseConfig.baseURL,
        model: baseConfig.model,
        name: name,
        prompt: finalPrompt,
        mediaDir: "./attachment"
      });

      // 3. 初始化实例
      // 必须调用 init() 以创建 OpenAI 客户端连接和初始 System Prompt
      await newAgent.init({
        apiKey: baseConfig.apiKey,
        baseURL: baseConfig.baseURL,
        model: baseConfig.model,
        prompt: finalPrompt,
        name: name,
        mediaDir: "./attachment",
        derivedFromAgentName: derivedFromAgentName ?? undefined, //QQ机器人余额校验用
      });

      // 注册
      subAgents.add(newListId, newAgent);

      if (!noAutoOpen && ioServer.io) {
        ioServer.io.emit("agentWindow:open", { listId: newListId, name });
      }


      return {
        ok: true,
        msg: `智能体 ${name} 已创建，listId 为 ${newListId}`,
        newListid: newListId,
        name: name
      };

    } catch (err) {
      console.error(err);
      return {
        ok: false,
        msg: "错误创建智能体: " + err.message
      };
    }
  },
  joi: () => {
    return Joi.object({
      name: Joi.string().required().description("子智能体名称"),
      prompt: Joi.string().required().description("子智能体提示词")
    }).unknown(true)
  },
  getDoc: () => "创建一个带有自己聊天队列的新子智能体 。"
}
