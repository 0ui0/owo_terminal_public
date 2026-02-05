import comData from "../comData/comData.js"
import aiBasic from "../tools/aiAsk/basic.js"
import { tSession } from "../ioServer/ioApis/chat/ioApi_chat.js"
import subAgents from "../tools/aiAsk/subAgents.js"

export default {
  name: "undoToChat",
  func: async (uuid) => {
    try {
      let targetTimestamp = 0;
      let removedTids = new Set();
      let removedUuids = new Set();
      let targetListId = -1;

      await comData.data.edit((data) => {
        if (!data.chatLists) return;
        for (const list of data.chatLists) {
          let index = list.data.findIndex(c => c.uuid === uuid);
          if (index !== -1) {
            targetListId = list.id;
            let cutIndex = index;
            targetTimestamp = list.data[index].timestamp;

            // Collecting logic
            for (let i = cutIndex; i < list.data.length; i++) {
              if (list.data[i].tid) {
                removedTids.add(list.data[i].tid);
              }
              removedUuids.add(list.data[i].uuid);
            }
            list.data.splice(cutIndex, list.data.length);
            break;
          }
        }

        // 检查回复锁定是否失效
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

      console.log("== 开始同步清理 AI 内存 ==");
      const cleanupModel = (model) => {
        // 1. 尝试通过 UUID 精确匹配
        let askIndex = model.asks.findIndex(ask => ask.id === uuid);

        if (askIndex !== -1) {
          // 撤到本条包含本条，所以从 askIndex 开始往后切
          model.asks.splice(askIndex, model.asks.length);
        } else if (targetTimestamp > 0) {
          // 如果 UUID 没找到（可能被滑动窗口剔除了），尝试通过时间戳匹配
          let cutStart = model.asks.findIndex(ask => ask.timestamp >= targetTimestamp);
          if (cutStart !== -1) {
            model.asks.splice(cutStart, model.asks.length);
          }
        }
        model.messages = [];

        // 修复：如果撤回导致 System Prompt 被删，必须重建。
        // 否则后续消息会占据 index 0，被 formatMsg 误认为是系统提示词而覆盖内容，导致上下文丢失。
        if (model.asks.length === 0 || (model.asks[0] && model.asks[0].role !== "system")) {
          model.initPrompt();
        }
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
