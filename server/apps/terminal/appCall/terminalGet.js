import Joi from "joi"
import appManager from "../../../apps/appManager.js"
// 【架构铁律】严禁通过 backend 触碰任何内部状态！工具内部禁止直接引用 backend，否则热更新会导致模块版本异常与实例分叉。
// 此处仅暂时借用 cleanTerminalContent 这一无状态纯函数，会话一律通过 appManager.dispatch 获取。
import backend from "../backend.js"

export default {
  name: "获取终端列表或历史输出",
  id: "terminalGet",
  mode: {
    read: true,
    write: false
  },

  async fn(argObj, metaData) {
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
      
      let finalText = numbered
      if (finalText.length > 15000) {
        finalText = finalText.slice(0, 15000) + "\n\n⚠️ 【系统警告】：由于单行超长或字符密度过高，本次查询结果总字数超出 15000 字符安全限制，已被强制尾部截断。如需查看被截断内容，请缩小 startLine 和 endLine 区间，或使用写入文件的方式进行分析。"
      }

      return {
        text: finalText,
        totalLines,
        from: start,
        to: end
      }
    }

    if (appId) {
      const app = appManager.get(appId)
      if (!app || app.type !== "terminal") return `未找到 appId 为 ${appId} 的终端`
      if (app.data.listId !== currentListId) return "权限不足：该终端不属于当前智能体会话列表。"

      const session = (await appManager.dispatch(app.id, "getSession")).data
      const isVm = Boolean(session?.isVirtual || app.data.mode === "vm")
      const mode = isVm ? "vm" : "host"
      const currentCwd = session?.cwd || app.data.cwd
      const raw = session?.content ?? app.data.content
      const res = getLines(raw, startLine, endLine)

      // 💡 遵照长官最高指示：在返回信息的最开头客观呈现 mode 类型与路径，不绑定审核主观标注
      const headerNotice = `【终端类型】：${mode}\n【终端编号】：${app.id}\n【工作路径】：${currentCwd}\n---\n`
      return `${headerNotice}终端第 ${res.from} ~ ${res.to} 行输出（共 ${res.totalLines} 行）：\n<terminal>\n${res.text}\n</terminal>`
    }

    // 返回当前会话的所有终端列表 (每项首要标明终端模式类型)
    const terminals = []
    for (const app of appManager.apps.values()) {
      if (app.type !== "terminal" || app.data.listId !== currentListId) continue
      const session = (await appManager.dispatch(app.id, "getSession")).data
      const isVm = Boolean(session?.isVirtual || app.data.mode === "vm")
      const raw = session?.content ?? app.data.content
      const res = getLines(raw, startLine, endLine)
      terminals.push({
        appId: app.id,
        mode: isVm ? "vm" : "host",
        cwd: session?.cwd || app.data.cwd,
        totalLines: res.totalLines,
        content: res.text
      })
    }

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
