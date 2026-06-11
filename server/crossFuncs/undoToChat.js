import archiveDb from "../db/archiveDb.js"
import aiBasic from "../tools/aiAsk/basic.js"
import appManager from "../apps/appManager.js"
import subAgents from "../tools/aiAsk/subAgents.js"
import ioServer from "../ioServer/ioServer.js"
import comData from "../comData/comData.js"
import { Op } from "sequelize"

export default {
  name: "undoToChat",
  func: async (uuid) => {
    try {
      if (!archiveDb.tb_chat_messages) {
        return { ok: false, msg: "数据库未准备好" };
      }

      let targetTimestamp = 0;
      let removedTids = new Set();
      let removedUuids = new Set();
      let targetListId = -1;

      // 查找锚点消息
      const anchorMsg = await archiveDb.tb_chat_messages.findOne({ where: { uuid }, raw: true });
      if (anchorMsg) {
        targetListId = anchorMsg.chatListId;
        targetTimestamp = anchorMsg.timestamp;

        // 收集需要回溯的消息
        const nextChats = await archiveDb.tb_chat_messages.findAll({
          where: {
            chatListId: targetListId,
            timestamp: { [Op.gte]: targetTimestamp }
          },
          raw: true
        });

        for (const c of nextChats) {
          if (c.tid) {
            removedTids.add(c.tid);
          }
          removedUuids.add(c.uuid);
        }

        // 物理删除
        await archiveDb.tb_chat_messages.destroy({
          where: {
            chatListId: targetListId,
            timestamp: { [Op.gte]: targetTimestamp }
          }
        });
      }

      // 检查回复锁定是否失效
      await comData.data.edit((data) => {
        if (data.call) {
          if (removedUuids.has(data.call.uuid) || (data.call.tid && removedTids.has(data.call.tid))) {
            data.call = null;
          }
        }
      });

      // 检查收集到的 tid 是否还需要保留
      if (removedTids.size > 0) {
        for (const tid of removedTids) {
          const count = await archiveDb.tb_chat_messages.count({ where: { tid } });
          if (count === 0) {
            appManager.close(tid)
          }
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

        // 补全 targetTimestamp，以防在 chatLists 中没找到但在 asks 中找到了
        if (targetTimestamp === 0 && askIndex !== -1) {
          targetTimestamp = model.asks[askIndex].timestamp || 0;
        }

        // 清理 memorys
        if (model.memorys) {
          model.memorys = model.memorys.filter(mem => {
            let memTimestamp = mem.time ? new Date(mem.time).getTime() : 0;
            if (targetTimestamp > 0 && memTimestamp >= targetTimestamp) return false;
            // 兜底：如果 targetTimestamp 为 0 时，或者时间无法推断，直接匹配 id
            if (mem.id === uuid) return false;
            return true;
          });
        }
      };

      if (targetListId === 0) {
        aiBasic.list.forEach(cleanupModel);
      } else if (targetListId > 0) {
        const targetAgent = subAgents.get(targetListId);
        if (targetAgent) cleanupModel(targetAgent);
      }

      // 广播刷新事件
      if (ioServer.io && targetListId !== -1) {
        ioServer.io.emit("chat:refresh", { listId: targetListId });
      }

      return { ok: true, msg: "已回溯至选定的历史节点" };
    } catch (err) {
      console.error(err);
      return { ok: false, msg: err.message };
    }
  }
}
