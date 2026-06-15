import Joi from "joi"
import appManager from "../../../apps/appManager.js"
import stripAnsi from "strip-ansi"

export default {
  name: "获取终端列表",
  id: "terminalGet",

  fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { appId, limit, offset } = value
    const currentListId = metaData?.listId || 0

    const getLines = (content) => {
      const allLines = stripAnsi(content || "").split(/\r?\n/)
      const totalLines = allLines.length
      const startIdx = Math.max(0, totalLines - offset - limit)
      const endIdx = Math.max(0, totalLines - offset)
      const slicedLines = allLines.slice(startIdx, endIdx)
      return slicedLines.map((line, i) => `${startIdx + i + 1}: ${line}`).join("\n")
    }

    if (appId) {
      const app = appManager.get(appId)
      if (!app || app.type !== "terminal") return `未找到 appId 为 ${appId} 的终端`
      if (app.data.listId !== currentListId) return "权限不足：该终端不属于当前智能体会话列表。"
      return JSON.stringify({
        appId: app.id,
        content: getLines(app.data.content)
      })
    }

    // 返回当前 listId 的所有终端
    const terminals = [...appManager.apps.values()]
      .filter(app => app.type === "terminal" && app.data.listId === currentListId)
      .map(app => ({
        appId: app.id,
        content: getLines(app.data.content),
        cwd: app.data.cwd
      }))
    return JSON.stringify(terminals)
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("终端 appId，不传则返回所有"),
      limit: Joi.number().min(1).max(50).required().description("读取最新 limit 行"),
      offset: Joi.number().min(0).default(0).description("跳过最新的行数（偏移量），配合 limit 实现翻页")
    })
  },

  getDoc() {
    return `
      获取用户或 AI 创建的终端列表，含终端内容
      若传入 appId，则获取指定终端的内容
      支持使用 offset (偏移量) 配合 limit 进行翻页，以此向上查询被截断的历史输出内容。
    `
  }
}
