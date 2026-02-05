import comData from "../comData/comData.js"
import aiBasic from "../tools/aiAsk/basic.js"
import { tSession } from "../ioServer/ioApis/chat/ioApi_chat.js"
import subAgents from "../tools/aiAsk/subAgents.js"

export default {
  name: "clearBeforeChat",
  func: async (uuid) => {
    try {
      let targetTimestamp = 0;
      let removedTids = new Set();
      let removedUuids = new Set();
      let targetListId = -1;

      await comData.data.edit((data) => {
        if (!data.chatLists) return;
        // Find which list contains the uuid
        for (const list of data.chatLists) {
          let chatIndex = list.data.findIndex(c => c.uuid === uuid);
          if (chatIndex !== -1) {
            targetListId = list.id;
            targetTimestamp = list.data[chatIndex].timestamp;

            // 收集即将被删除的消息中的所有 tid 和 uuid
            for (let i = 0; i < chatIndex; i++) {
              if (list.data[i].tid) {
                removedTids.add(list.data[i].tid);
              }
              removedUuids.add(list.data[i].uuid);
            }
            list.data.splice(0, chatIndex);
            break; // Found and processed
          }
        }

        // 检查回复锁定是否失效 (Global check)
        if (data.call) {
          if (removedUuids.has(data.call.uuid) || (data.call.tid && removedTids.has(data.call.tid))) {
            data.call = null;
          }
        }
      });

      // 检查收集到的 tid 是否还需要保留
      if (removedTids.size > 0) {
        const { chatLists } = comData.data.get();
        if (chatLists) {
          removedTids.forEach(tid => {
            let stillExists = chatLists.some(list => list.data.some(c => c.tid === tid));
            if (!stillExists) {
              tSession.close(tid);
            }
          });
        }
      }

      // 同步清理 AI 模型的上下文
      // 1. Main AI
      if (targetTimestamp > 0) {
        const cleanupModel = (model) => {
          let askIndex = model.asks.findIndex(ask => ask.id === uuid || ask.timestamp === targetTimestamp);
          if (askIndex !== -1) {
            if (askIndex > 2) {
              model.asks.splice(2, askIndex - 2);
            }
          }
          model.messages = [];
        };

        if (targetListId === 0) {
          aiBasic.list.forEach(cleanupModel);
        } else if (targetListId > 0) {
          const targetAgent = subAgents.get(targetAgent);
          if (targetAgent) cleanupModel(targetAgent);
        }
      }

      return { ok: true };
    } catch (err) {
      console.error(err);
      return { ok: false, msg: err.message };
    }
  }
}
