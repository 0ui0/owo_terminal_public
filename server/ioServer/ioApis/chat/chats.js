import archiveDb from "../../../db/archiveDb.js"
import ioServer from "../../ioServer.js"

export default {
  async add(chat, listId = 0) {
    try {
      if (!archiveDb.tb_chat_messages) {
        console.error("[chats.js] tb_chat_messages is not defined on archiveDb")
        return
      }
      await archiveDb.tb_chat_messages.create({
        uuid: chat.uuid,
        content: chat.content || "",
        reasoning: chat.reasoning || null,
        name: chat.name || "",
        group: chat.group || "",
        timestamp: chat.timestamp || Date.now(),
        chatListId: listId,
        attachments: chat.attachments || [],
        ask: chat.ask || null,
        tid: chat.tid || null,
        snapshotId: chat.snapshotId || null
      })
    } catch (err) {
      console.error("[chats.js] Add chat message to DB failed:", err)
    }
  },

  async find(uuid) {
    try {
      if (!archiveDb.tb_chat_messages) return undefined
      const msg = await archiveDb.tb_chat_messages.findOne({ where: { uuid }, raw: true })
      return msg || undefined
    } catch (err) {
      console.error("[chats.js] find chat failed:", err)
      return undefined
    }
  },

  async findByTid(tid) {
    try {
      if (!archiveDb.tb_chat_messages) return undefined
      const msg = await archiveDb.tb_chat_messages.findOne({ where: { tid }, raw: true })
      return msg || undefined
    } catch (err) {
      console.error("[chats.js] findByTid failed:", err)
      return undefined
    }
  },

  refresh(listId = 0) {
    if (ioServer && ioServer.io) {
      ioServer.io.emit("chat:refresh", { listId })
    }
  }
}