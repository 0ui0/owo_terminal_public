
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

      // 4. 获取同步源数据 (对话历史从当前模型拿，记忆直接从 comData 拿)
      let historyAsks = [];
      if (currentModel) {
        historyAsks = currentModel.asks.slice(1);
      }

      const mainList = comData.data.get().chatLists.find(l => l.id === 0);
      const historyMemorys = mainList ? [...(mainList.notes || [])] : [];
      const historyMemory = historyMemorys[historyMemorys.length - 1]?.memory || "";

      /* 
      // 旧同步逻辑（从当前模型实例获取记忆）- 已弃用并注释
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
      */

      // 5. 基础模型全量对齐 (记忆以 comData 为准，历史从当前模型同步)
      for (const model of aiBasic.list) {
        // 记忆对齐：所有人（含 currentModel）都必须与 comData 的笔记保持绝对一致
        model.memory = historyMemory;
        model.memorys = [...historyMemorys];

        // 历史对话对齐：仅同步给非当前模型，且必须保留模型自己的 System Prompt (asks[0])
        if (currentModel && model !== currentModel) {
          const modelPrompt = model.asks[0];
          model.asks = [modelPrompt, ...historyAsks];
        }
      }

      const baseConfig = targetModel.aiConfig;

      // 5. 同步所有子智能体，智能体保持独立上下文
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
