import Joi from "joi"
import appManager from "../../appManager.js"

export default {
  name: "阅读编辑器内容",
  id: "editorGetContent",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, startLine = 1, endLine = 500, searchQuery, isRegex } = value

    // 1. 获取内容
    const appRes = await appManager.dispatch(appId, "getContent")
    if (!appRes || appRes.error || !appRes.ok) {
      return `无法获取编辑器内容: ${appRes?.error || appRes?.msg || "未知错误"}`
    }

    const { content, filePath } = appRes.data
    const lines = content.split('\n')
    const totalLines = lines.length

    const startIdx = Math.max(0, startLine - 1)
    const endIdx = Math.min(totalLines, endLine)

    const totalChars = content.length
    const totalBytes = Buffer.byteLength(content, "utf8")
    const kbSize = (totalBytes / 1024).toFixed(2) + " KB"

    // [Search logic block]
    if (searchQuery) {
      let matchIndices = []
      let searchRegExp

      if (isRegex) {
        try {
          let pattern = searchQuery
          let flags = "i"
          const match = searchQuery.match(/^\/(.*)\/([gimsuy]*)$/)
          if (match) {
            pattern = match[1]
            flags = match[2]
            if (!flags.includes("i")) flags += "i"
          }
          searchRegExp = new RegExp(pattern, flags)
        } catch (err) {
          return `错误：提供的正则表达式 "${searchQuery}" 不合法：${err.message}`
        }
      } else {
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        searchRegExp = new RegExp(escapedQuery, "i")
      }

      for (let i = startIdx; i < endIdx; i++) {
        if (searchRegExp.test(lines[i])) {
          matchIndices.push(i)
        }
      }

      if (matchIndices.length === 0) {
        return `未在当前范围(第${startIdx + 1}行到第${endIdx}行)中找到关于 "${searchQuery}" 的内容。`
      }

      let outputLines = []
      outputLines.push(`> [!INFO] 搜索 "${searchQuery}" 找到 ${matchIndices.length} 个匹配项。文件总计约 ${kbSize}。`)
      const maxMatches = 10
      const contextLines = 3
      if (matchIndices.length > maxMatches) {
        outputLines.push(`> [!WARNING] 匹配项过多，仅显示前 ${maxMatches} 个。请查阅目标行号后，通过 startLine 及 endLine 再次读取。`)
      }

      const limit = Math.min(matchIndices.length, maxMatches)
      let currentLength = outputLines.join("\n").length

      for (let i = 0; i < limit; i++) {
        const matchIdx = matchIndices[i]
        const displayStart = Math.max(0, matchIdx - contextLines)
        const displayEnd = Math.min(totalLines - 1, matchIdx + contextLines)

        let matchBlock = []
        matchBlock.push(`\n### 匹配项 ${i + 1} (位于第 ${matchIdx + 1} 行)`)
        for (let j = displayStart; j <= displayEnd; j++) {
          const prefix = j === matchIdx ? ">>" : "  "
          matchBlock.push(`${j + 1}: ${prefix} ${lines[j]}`)
        }

        let blockText = matchBlock.join("\n")

        if (currentLength + blockText.length > 4000) {
          outputLines.push(`\n> [!NOTE] 结果因字数限制已被自动截断。请缩小搜索区间或使用更精确的关键字。`)
          break
        }

        outputLines.push(blockText)
        currentLength += blockText.length
      }
      return outputLines.join("\n")
    }

    // 2. 切片逻辑
    const slicedLines = lines.slice(startIdx, endIdx)
    const slicedContent = slicedLines.join('\n')

    // 3. 构造信息头
    let finalContent = slicedContent
    const MAX_CHARS = 4000 // 字符硬截断门槛
    let isCharClipped = false

    if (finalContent.length > MAX_CHARS) {
      finalContent = finalContent.slice(0, MAX_CHARS)
      isCharClipped = true
    }

    const info = `编辑器实例 [${appId}] ${filePath ? `(${filePath})` : "(未命名文件)"}\n` +
      `当前视图: L${startIdx + 1} - L${endIdx} (总计 ${totalLines} 行 / 大小 ${kbSize})\n` +
      `> [!TIP] 若内容过长遇到截断，可传入 searchQuery (及 isRegex) 搜索关键内容以突破限制锁定行号。\n` +
      (endIdx < totalLines ? `> [!NOTE] 后续行已截断，如需阅读更多请指定 startLine 为 ${endIdx + 1}\n` : "") +
      (isCharClipped ? `> [!WARNING] 当前输出字符数超过 ${MAX_CHARS}，已强制物理截断以保护上下文安全。\n` : "") +
      "\n--- 内容开始 ---\n"

    return info + finalContent
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("编辑器实例 ID"),
      startLine: Joi.number().integer().min(1).default(1).description("起始行号 (1-based，搜索时表示范围起点)"),
      endLine: Joi.number().integer().min(1).default(500).description("结束行号 (搜索时表示范围终点)"),
      searchQuery: Joi.string().allow("").description("可选。提供关键字时将转为搜索模式返回匹配段落"),
      isRegex: Joi.boolean().default(false).description("可选。指示 searchQuery 是否为正则")
    })
  },

  getDoc() {
    return `读取编辑器当前内容，支持普通翻页以及长文搜索(searchQuery)。`
  }
}
