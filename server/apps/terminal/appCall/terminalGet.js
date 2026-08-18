import Joi from "joi"
import appManager from "../../../apps/appManager.js"
import backend from "../backend.js"

export default {
  name: "获取终端列表或历史输出",
  id: "terminalGet",

  fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    let { appId, startLine, endLine } = value
    const currentListId = metaData?.listId
    if (typeof currentListId !== "number") {
      throw new Error(`[terminalGet] 系统错误：metaData 中缺少必需的 listId 参数 (当前值为: ${currentListId})`)
    }

    const getLines = (content, sLine, eLine) => {
      const allLines = backend.cleanTerminalContent(content || "").split(/\r?\n/)
      const totalLines = allLines.length
      if (totalLines === 0 || (totalLines === 1 && allLines[0] === "")) {
        return { text: "(无输出)", totalLines: 0, from: 0, to: 0 }
      }

      let start = sLine
      let end = eLine

      // 如果都没传，默认返回最新的 100 行
      if (!start && !end) {
        start = Math.max(1, totalLines - 99)
        end = totalLines
      } else if (!start) {
        start = Math.max(1, end - 99)
      } else if (!end) {
        end = Math.min(totalLines, start + 99)
      }

      // 单次最多读取 500 行，保护上下文 Token
      if (end - start + 1 > 500) {
        end = start + 499
      }

      // 边界收敛
      start = Math.max(1, Math.min(start, totalLines))
      end = Math.max(start, Math.min(end, totalLines))

      const sliceStart = start - 1
      const sliceEnd = end
      const sliced = allLines.slice(sliceStart, sliceEnd)
      const numbered = sliced.map((line, i) => `${start + i}: ${line}`).join("\n")

      return {
        text: numbered,
        totalLines,
        from: start,
        to: end
      }
    }

    if (appId) {
      const app = appManager.get(appId)
      if (!app || app.type !== "terminal") return `未找到 appId 为 ${appId} 的终端`
      if (app.data.listId !== currentListId) return "权限不足：该终端不属于当前智能体会话列表。"

      const session = backend.getSession(app.id)
      const raw = session?.content ?? app.data.content
      const res = getLines(raw, startLine, endLine)

      return `终端 (appId="${app.id}") 第 ${res.from} ~ ${res.to} 行输出（共 ${res.totalLines} 行）：\n<terminal>\n${res.text}\n</terminal>`
    }

    // 返回当前会话的所有终端列表
    const terminals = [...appManager.apps.values()]
      .filter(app => app.type === "terminal" && app.data.listId === currentListId)
      .map(app => {
        const session = backend.getSession(app.id)
        const raw = session?.content ?? app.data.content
        const res = getLines(raw, startLine, endLine)
        return {
          appId: app.id,
          cwd: session?.cwd || app.data.cwd,
          totalLines: res.totalLines,
          content: res.text
        }
      })

    if (terminals.length === 0) return "当前会话下暂无活跃的终端。"
    return JSON.stringify(terminals, null, 2)
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("终端 appId。若不传则返回当前会话的所有终端列表"),
      startLine: Joi.number().integer().min(1).description("起始行号。若只传 startLine，系统会自动向后顺推读取 100 行"),
      endLine: Joi.number().integer().min(1).description("结束行号。若只传 endLine，系统会自动向前倒推读取 100 行（极其适合倒序向上回溯日志，单次上限 500 行）")
    })
  },

  getDoc() {
    return `
      获取终端列表或根据行号范围精准查看指定终端的历史输出。
      【翻页模式】支持传入 startLine 和 endLine 进行灵活查询：
      1. 倒序向上翻页（最推荐）：仅传入 endLine，系统会自动向前倒推提取该行之前的 100 行输出。
      2. 绝对范围查询：同时传入 startLine 和 endLine，精准截取指定行区间（单次最多 500 行）。
      3. 默认查看：若两个行号都不传，系统默认返回最新的 100 行输出。
      调用范例：
      1. 倒序向上回溯上一页（极其便捷，查看第 200 行往前的 100 行）：
      { appId: "term_xxx", endLine: 200 }
      2. 指定绝对区间查询（查看第 1 到 50 行）：
      { appId: "term_xxx", startLine: 1, endLine: 50 }
      3. 获取当前会话所有终端列表及最新输出：
      {}
    `
  }
}
