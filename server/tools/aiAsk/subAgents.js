import AiAsk from "./AiAsk.js";
import options from "../../config/options.js";
import tempPath from "../tempPath.js";

const subAgents = new Map();

export default {
  /**
   * 初始化并覆盖/创建 Agent 实例
   * @param {Number} listId - The chatListId
   * @param {String} modelId - 后台配置的唯一 id（name/model 都可能重复，只有 id 唯一）
   * @returns {Object} 初始化的 AiAsk 实例
   */
  async initAgent(listId, modelId) {
    let aiList = await options.get("ai_aiList");
    let model = aiList.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`找不到模型配置id: ${modelId}`);
    }

    let existingAgent = subAgents.get(listId);
    let targetPrompt = existingAgent ? existingAgent.aiConfig.prompt : model.prompt;
    // name 规则：仅主队列(listId=0)切换模型时跟随新模型名，其余队列（子智能体等）保留创建时的名字
    let targetName = listId === 0 ? model.name : (existingAgent ? existingAgent.aiConfig.name : model.name);

    const config = {
      apiKey: model.apiKey,
      baseURL: model.url,
      model: model.model,
      prompt: targetPrompt,
      name: targetName,
      modelId: model.id,
      mediaDir: tempPath.get("attachment")
    };

    const agent = new AiAsk(config);
    await agent.init(config);
    
    this.add(listId, agent);
    return agent;
  },
  /**
   * 切换模型：覆盖模型配置并刷新初始提示词，可选清空临时上下文列表
   * @param {Number} listId - The chatListId
   * @param {String} modelId - 后台配置的唯一 id
   * @param {Object} opts - { coverPrompt: 是否用新模型 prompt 覆盖初始提示词（默认 true）, clearContext: 是否清空临时上下文列表（默认 false） }
   * @returns {Object} AiAsk 实例
   */
  async switchModelAgent(listId, modelId, { coverPrompt = true, clearContext = false } = {}) {
    let existingAgent = subAgents.get(listId);
    if (!existingAgent) {
      throw new Error(`队列 ${listId} 尚无已初始化的 agent，无法直接切换模型，请先发起一次对话`);
    }

    let aiList = await options.get("ai_aiList");
    let model = aiList.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`找不到模型配置id: ${modelId}`);
    }

    // coverPrompt=true 用新模型的 prompt；false 沿用旧 agent 的 prompt
    let targetPrompt = coverPrompt ? model.prompt : existingAgent.aiConfig.prompt;
    // name 规则：仅主队列(listId=0)切换模型时跟随新模型名，其余队列保留创建时的名字
    let targetName = listId === 0 ? model.name : existingAgent.aiConfig.name;

    const config = {
      ...existingAgent.aiConfig,
      apiKey: model.apiKey,
      baseURL: model.url,
      model: model.model,
      prompt: targetPrompt,
      name: targetName,
      modelId: model.id,
      mediaDir: tempPath.get("attachment")
    };

    // 使用 init 覆盖配置：重建 openAi 连接并刷新 asks[0]（system prompt），保留 asks 其余临时上下文
    await existingAgent.init(config);

    // 若需清空临时上下文：仅保留 asks[0] 初始提示词，删除其后的所有临时消息
    if (clearContext) {
      existingAgent.asks.splice(1);
      existingAgent.clearUsage()
    }

    return existingAgent;
  },

  /**
   * Add a sub-agent instance
   * @param {Number} id - The chatListId
   * @param {Object} agent - The AiAsk instance
   */
  add(id, agent) {
    subAgents.set(id, agent);
  },

  /**
   * Get a sub-agent instance
   * @param {Number} id 
   * @returns {Object|undefined}
   */
  get(id) {
    return subAgents.get(id);
  },

  /**
   * Remove a sub-agent instance
   * @param {Number} id 
   */
  remove(id) {
    const agent = subAgents.get(id);
    if (agent) {
      // If AiAsk has a cleanup method, call it here
    }
    subAgents.delete(id);
  },

  /**
   * Get all agents map
   * @returns {Map}
   */
  getAll() {
    return subAgents;
  }
}
