import comData from "../../../comData/comData.js"
import AiAsk from "../AiAsk.js" // Compiled JS
import subAgents from "../subAgents.js"
import idTool from "../../idTool.js"
import chats from "../../../ioServer/ioApis/chat/chats.js"
import ioServer from "../../../ioServer/ioServer.js"
import Joi from "joi"
import defaultComData from "../../defaultComData.js"
import tempPath from "../../tempPath.js"

export default {
  name: "创建智能体",
  id: "createAgent",
  async fn(argObj, metaData) {
    try {
      //系统QQ机器人用特殊参数，对ai隐藏
      const isBotAgent = argObj.isBotAgent
      const noAutoOpen = argObj.noAutoOpen
      const derivedFromModelId = argObj.derivedFromModelId

      const { value, error } = this.joi().validate(argObj);
      if (error) {
        return {
          ok: false,
          msg: "错误：" + error.details[0].message
        };
      }
      const { name, prompt } = value;
      const { listId } = metaData;

      // 解析配置源：三场景统一处理（优先级：显式指定 > 父级继承）
      // 1) 会话管理器/QQ bot：derivedFromModelId 显式指定后台配置（按精确 id 匹配）
      // 2) AI 工具调用：未指定则继承创建者 aiConfig
      const creatorAgent = subAgents.get(listId);
      
      // 提炼并归一化配置项，彻底解耦原始数据库对象与内部状态对象
      let normalizedConfig = {
        apiKey: "",
        baseURL: "",
        model: "",
        modelId: ""
      };

      if (derivedFromModelId) {
        const aiList = await (await import("../../../config/options.js")).default.get("ai_aiList");
        const found = aiList.find(m => m.id === derivedFromModelId);
        if (!found) {
          return {
            ok: false,
            msg: `错误：未找到指定的模型配置（derivedFromModelId: ${derivedFromModelId}）。`
          };
        }
        normalizedConfig.apiKey = found.apiKey;
        normalizedConfig.baseURL = found.url; // 后台原始数据字段名为 url
        normalizedConfig.model = found.model;
        normalizedConfig.modelId = found.id;
      } else if (creatorAgent?.aiConfig) {
        normalizedConfig.apiKey = creatorAgent.aiConfig.apiKey;
        normalizedConfig.baseURL = creatorAgent.aiConfig.baseURL; // 已实例化的对象字段名为 baseURL
        normalizedConfig.model = creatorAgent.aiConfig.model;
        normalizedConfig.modelId = creatorAgent.aiConfig.modelId;
      } else {
        return {
          ok: false,
          msg: `错误：未找到模型配置（derivedFromModelId: 无，父级 ${listId} 亦无可用 aiConfig）。`
        };
      }

      let newListId = 0;
      let currentListId = listId;
      let targetModelId = normalizedConfig.modelId;
      let toolCallGroupId = metaData?.toolCallGroupId

      console.log("智能体tcgid", toolCallGroupId)




      await comData.data.edit((data) => {
        // 计算新 ID
        if (!data.chatLists) {
          data.chatLists = [{ ...defaultComData().chatLists[0], id: 0 }];
        }

        // 获取最大 ID
        const maxId = data.chatLists.reduce((max, l) => Math.max(max, l.id), 0);
        newListId = maxId + 1;

        // 确定当前上下文（父级）已经在上面确定了 (currentListId)
        // currentListId = data.targetChatListId || 0; // Removed legacy fallback block

        // 创建物理列表 (以系统默认模板为基础，防止将来新增字段丢失)
        const templateList = defaultComData().chatLists[0];
        data.chatLists.push({
          ...templateList,
          id: newListId,
          linkid: currentListId,
          currentModelId: targetModelId
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
        // 刷新父列表，让容器消息立即显示（无需等待下一条消息触发 pull）
        ioServer.io.emit("chat:push", { listId: currentListId })
      }




      // 2. 使用选中模型的配置 (apiKey, baseURL, model)

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
        apiKey: normalizedConfig.apiKey,
        baseURL: normalizedConfig.baseURL,
        model: normalizedConfig.model,
        name: name,
        prompt: finalPrompt,
        modelId: targetModelId,
        mediaDir: tempPath.get("attachment")
      });

      // 3. 初始化实例
      // 必须调用 init() 以创建 OpenAI 客户端连接和初始 System Prompt
      await newAgent.init({
        apiKey: normalizedConfig.apiKey,
        baseURL: normalizedConfig.baseURL,
        model: normalizedConfig.model,
        prompt: finalPrompt,
        name: name,
        modelId: targetModelId,
        mediaDir: tempPath.get("attachment"),
        derivedFromModelId: derivedFromModelId ?? undefined, //QQ机器人余额校验用
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
