import comData from "../comData/comData.js"
import aiBasic from "../tools/aiAsk/basic.js"
import { tSession } from "../ioServer/ioApis/chat/ioApi_chat.js"
import subAgents from "../tools/aiAsk/subAgents.js"

export default {
  name: "undoChat",
  func: async (uuid) => {
    try {
      let targetTimestamp = 0;
      let targetTid = null;
      let targetListId = -1;

      await comData.data.edit((data) => {
        if (!data.chatLists) return;
        for (const list of data.chatLists) {
          const chat = list.data.find(c => c.uuid === uuid);
          if (chat) {
            targetListId = list.id;
            targetTimestamp = chat.timestamp;
            targetTid = chat.tid;
            list.data = list.data.filter(c => c.uuid !== uuid);
            break;
          }
        }
      });

      // 如果有 tid，检查是否需要关闭终端
      if (targetTid) {
        const { chatLists } = comData.data.get();
        if (chatLists) {
          let stillExists = chatLists.some(list => list.data.some(c => c.tid === targetTid));
          if (!stillExists) {
            tSession.close(targetTid);
          }
        }
      }

      // 重置回复锁定状态
      await comData.data.edit((data) => {
        if (data.call) {
          if (data.call.uuid === uuid || (targetTid && data.call.tid === targetTid)) {
            data.call = null;
          }
        }
      });

      // 同步清理 AI 模型的上下文 (增加隔离逻辑)
      const cleanupModel = (model) => {
        model.asks = model.asks.filter((ask, index) => {
          if (index === 0 || index === 1) return true;
          // 同时通过 ID 和时间戳判断
          if (ask.id === uuid) return false;
          if (targetTimestamp > 0 && ask.timestamp === targetTimestamp) return false;
          return true;
        });
        // 强制清空镜像
        model.messages = [];
      };

      if (targetListId === 0) {
        aiBasic.list.forEach(cleanupModel);
      } else if (targetListId > 0) {
        const targetAgent = subAgents.get(targetListId);
        if (targetAgent) cleanupModel(targetAgent);
      }

      return { ok: true };
    } catch (err) {
      console.error(err);
      return { ok: false, msg: err.message };
    }
  }
}
