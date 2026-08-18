import comData from "../comData/comData.js"
import subAgents from "../tools/aiAsk/subAgents.js"
import idTool from "../tools/idTool.js"
import { trs } from "../tools/i18n.js"
import chats from "../ioServer/ioApis/chat/chats.js"
import ioServer from "../ioServer/ioServer.js"
import archiveDb from "../db/archiveDb.js"
import options from "../config/options.js"

export default {
  name: "switchModel",
  func: async ({ listId = 0, modelId, options: opts = {} }) => {
    const { coverPrompt = true, clearContext = false } = opts;
    try {
      if (!modelId) {
        return { ok: false, msg: "请传入配置id" };
      }

      await comData.data.edit((data) => {
        const chatLists = data.chatLists || [];
        const targetList = chatLists.find(l => l.id === listId);
        if (targetList) {
          targetList.currentModelId = modelId;
        }
      });

      // 沙盒处理：
      // - 已有 agent：switchModelAgent 覆盖模型配置（含 coverPrompt/clearContext 选项）
      // - 无 agent：initAgent 全新初始化
      let agent;
      const hasAgent = !!subAgents.get(listId);
      if (hasAgent) {
        agent = await subAgents.switchModelAgent(listId, modelId, { coverPrompt, clearContext });
      } else {
        agent = await subAgents.initAgent(listId, modelId);
      }

      // 仅在勾选"清空临时上下文并插入历史阅读提示"时，植入恢复指令
      if (clearContext) {
        // 植入恢复指令
        const sysMsgContent = "用户指定了你和它继续对话，请调用【历史记录查询工具】查询先前的对话情况，然后接前面的对话或者任务继续。";
        
        let historyCount = 0;
        if (archiveDb.tb_chat_messages) {
          historyCount = await archiveDb.tb_chat_messages.count({
            where: { chatListId: listId }
          });

          // 检查最后一条消息是否也是切换模型的提示，如果是，则删掉旧的防止刷屏
          const lastMsg = await archiveDb.tb_chat_messages.findOne({
            where: { chatListId: listId },
            order: [['timestamp', 'DESC']],
            raw: true
          });

          if (lastMsg && lastMsg.content === sysMsgContent) {
            await archiveDb.tb_chat_messages.destroy({
              where: { uuid: lastMsg.uuid }
            });
            historyCount -= 1; // 扣除这条即将被删掉的旧系统提示
          }
        }
        
        // 只有在队列中真的有实质性历史记录时，才发送恢复指令
        if (historyCount > 0) {
          const chat = {
            uuid: idTool.get("sys"),
            content: sysMsgContent,
            name: trs("角色/系统"),
            group: "system",
            timestamp: Date.now(),
            chatListId: listId
          };

          const ask = agent.addAsk("系统", "user", sysMsgContent, { id: chat.uuid });
          chat.ask = ask;

          // 写入物理数据库并广播给前端
          await chats.add(chat, listId);
          ioServer.io.emit("chat:refresh", { listId: listId });
        }
      }

      // 读取模型名用于提示
      const aiList = await options.get("ai_aiList");
      const modelName = aiList.find(m => m.id === modelId)?.name;

      return {
        ok: true,
        msg: `已将队列 ${listId} 切换至为 模型${modelId} ：${modelName}`
      }
    } catch (err) {
      console.error(err);
      return { ok: false, msg: err.message };
    }
  }
}
