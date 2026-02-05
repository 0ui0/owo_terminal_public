
import comData from "../comData/comData.js"
import aiBasic from "../tools/aiAsk/basic.js"
import subAgents from "../tools/aiAsk/subAgents.js"

export default {
  name: "switchModel",
  func: async (modelName) => {
    try {
      if (!modelName) {
        return { ok: false, msg: "请传入模型名" };
      }

      // 1. 获取当前模型（在更新之前！）
      const currentModelName = comData.data.get().currentModel;
      const currentModel = aiBasic.list.find(m => m.name === currentModelName);

      // 2. 更新全局 Current Model
      await comData.data.edit((data) => {
        data.currentModel = modelName
        data.sendMode = "agent"
        if (data.call) {
          if (data.call.tid) {
            data.call = null
          }
        }
      })

      // 3. 获取目标模型
      const targetModel = aiBasic.list.find(m => m.name === modelName);
      if (!targetModel) {
        return { ok: false, msg: "在aiBasic里未找到选定模型，无法更新模型配置" };
      }

      // 4. 同步 asks 和记忆到所有模型（保留各模型自己的 prompt）
      if (currentModel) {
        const historyAsks = currentModel.asks.slice(1);
        for (const model of aiBasic.list) {
          if (model !== currentModel) {
            // 保留该模型的 System Prompt (asks[0])
            const modelPrompt = model.asks[0];
            model.asks = [modelPrompt, ...historyAsks];
            // 同步记忆
            model.memory = currentModel.memory;
            model.memorys = [...currentModel.memorys];
          }
        }
      }

      const baseConfig = targetModel.aiConfig;

      // 5. 同步所有子智能体
      let count = 0;
      for (const [id, agent] of subAgents.getAll()) {
        await agent.init({
          ...baseConfig,
          prompt: agent.aiConfig.prompt,
          name: agent.aiConfig.name
        });
        count++;
      }

      return {
        ok: true,
        msg: `已切换模型为 ${modelName}`
      }
    } catch (err) {
      console.error(err);
      return { ok: false, msg: err.message };
    }
  }
}
