import Joi from "joi"
import archiveDb from "../../db/archiveDb.js"
import createAPI from "../../tools/createAPI.js"

export default async () => {
  const apis = createAPI("chatMessage", {
    db: archiveDb,
    tableName: "tb_chat_messages",
    idName: "id",
    cnName: "聊天消息",
    setFields: ["content", "reasoning", "name", "group", "timestamp", "chatListId", "attachments", "ask", "snapshotId"],
    getQuery: {
      listId: Joi.number().integer().optional()
    },
    getFindAllWhere: (sendParams) => {
      const { listId } = sendParams.que
      const where = {}
      if (listId !== undefined) {
        where.chatListId = Number(listId)
      }
      return where
    }
  })
  return [
    apis.get,
    apis.set,
    apis.del
  ]
}
