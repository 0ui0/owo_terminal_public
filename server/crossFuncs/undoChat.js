import archiveDb from "../db/archiveDb.js"
import aiBasic from "../tools/aiAsk/basic.js"
import appManager from "../apps/appManager.js"
import subAgents from "../tools/aiAsk/subAgents.js"
import ioServer from "../ioServer/ioServer.js"
import comData from "../comData/comData.js"

export default {
  name: "undoChat",
  func: async (uuid) => {
    try {
      if (!archiveDb.tb_chat_messages) {
        return { ok: false, msg: "数据库未准备好" };
      }

      let targetTimestamp = 0;
      let targetTid = null;
      let targetListId = -1;

      // 从数据库中查找并删除
      const chat = await archiveDb.tb_chat_messages.findOne({ where: { uuid }, raw: true });
      if (chat) {
        targetListId = chat.chatListId;
        targetTimestamp = chat.timestamp;
        targetTid = chat.tid;
        await archiveDb.tb_chat_messages.destroy({ where: { uuid } });
      }

      // 如果有 tid，检查是否需要关闭终端
      if (targetTid) {
        const count = await archiveDb.tb_chat_messages.count({ where: { tid: targetTid } });
        if (count === 0) {
          appManager.close(targetTid)
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

        // 清理 memorys
        if (model.memorys) {
          model.memorys = model.memorys.filter(mem => {
            let memTimestamp = mem.time ? new Date(mem.time).getTime() : 0;
            if (mem.id === uuid) return false;
            if (targetTimestamp > 0 && memTimestamp === targetTimestamp) return false;
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

      return { ok: true, msg: "已撤销最后一条聊天记录" };
    } catch (err) {
      console.error(err);
      return { ok: false, msg: err.message };
    }
  }
}
