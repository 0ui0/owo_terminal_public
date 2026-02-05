import { tSession } from "../../../ioServer/ioApis/chat/ioApi_chat.js"
import Joi from "joi"
import stripAnsi from 'strip-ansi'

export default {
  name: "获取终端列表",
  id: "terminalGet",
  fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { tid, limit } = value
    const currentListId = metaData?.listId || 0

    if (tid) {
      let session = tSession.find(tid)
      // 只能查看自己列表所属的终端
      if (session && session.listId === currentListId) {
        return JSON.stringify({
          tid: session.tid,
          content: stripAnsi(session.content).split(/\r?\n/).slice(-limit).join("\n")
        })
      }
      else {
        return `未找到tid为${tid}的终端，或权限不足`
      }

    }

    let sessions = Object.entries(tSession.sessions)
      .filter(([key, session]) => session.listId === currentListId) // 过滤隔离
      .map(([key, session]) => {
        return {
          tid: session.tid,
          content: stripAnsi(session.content).split(/\r?\n/).slice(-limit).join("\n")
        }
      })
    return JSON.stringify(sessions)

  },
  joi() {
    return Joi.object({
      tid: Joi.string().description("终端tid"),
      limit: Joi.number().min(1).max(50).required().description("读取最新limit行")
    })
  },
  getDoc() {
    return `
      获取用户或者ai创建的终端列表数组，含终端内容
      若传入tid，则获取指定tid的终端
    `
  }
}