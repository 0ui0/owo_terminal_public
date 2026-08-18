import archiveDb from "../db/archiveDb.js"
import appManager from "../apps/appManager.js"
import subAgents from "../tools/aiAsk/subAgents.js"
import ioServer from "../ioServer/ioServer.js"
import comData from "../comData/comData.js"
import { Op } from "sequelize"

export default {
  name: "clearBeforeChat",
  func: async (uuid, listId) => {
    try {
      let { error } = Joi.array().ordered(
        Joi.string().required(),
        Joi.number().required()
      ).validate([uuid, listId]);
      if (error) {
        return { ok: false, msg: "参数校验失败: " + error.details[0].message };
      }

      if (!archiveDb.tb_chat_messages) {
        return { ok: false, msg: "数据库未准备好" };
      }

      let targetTimestamp = 0;
      let removedTids = new Set();
      let removedUuids = new Set();
      let targetListId = typeof listId === 'number' ? listId : -1;

      // 查找锚点消息
      const anchorMsg = await archiveDb.tb_chat_messages.findOne({ where: { uuid }, raw: true });
      if (anchorMsg) {
        if (targetListId === -1) {
          targetListId = anchorMsg.chatListId;
        } else if (targetListId !== anchorMsg.chatListId) {
          console.warn(`clearBeforeChat: provided listId ${targetListId} doesn't match db record ${anchorMsg.chatListId}`);
        }
        targetTimestamp = anchorMsg.timestamp;

        // 收集在此消息之前的所有消息
        const prevChats = await archiveDb.tb_chat_messages.findAll({
          where: {
            chatListId: targetListId,
            timestamp: { [Op.lt]: targetTimestamp }
          },
          raw: true
        });

        for (const c of prevChats) {
          if (c.tid) {
            removedTids.add(c.tid);
          }
          removedUuids.add(c.uuid);
        }

        // 物理删除在此消息之前的所有消息
        await archiveDb.tb_chat_messages.destroy({
          where: {
            chatListId: targetListId,
            timestamp: { [Op.lt]: targetTimestamp }
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

      // 同步清理 AI 模型的上下文
      // 1. Main AI
      if (targetTimestamp > 0) {
        const cleanupModel = (model) => {
          let askIndex = model.asks.findIndex(ask => ask.id === uuid || ask.timestamp === targetTimestamp);
          if (askIndex !== -1) {
            if (askIndex > 1) {
              model.asks.splice(1, askIndex - 1);
            }
          }
          model.messages = [];
        };

        const targetAgent = subAgents.get(targetListId);
        if (targetAgent) cleanupModel(targetAgent);
      }

      // 广播刷新事件
      if (ioServer.io && targetListId !== -1) {
        ioServer.io.emit("chat:refresh", { listId: targetListId });
      }

      return { ok: true, msg: "聊天历史已清空" };
    } catch (err) {
      console.error(err);
      return { ok: false, msg: err.message };
    }
  }
}
