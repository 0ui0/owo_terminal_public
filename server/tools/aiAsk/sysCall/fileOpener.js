import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"

export default {
  name: "读取文件内容",
  id: "fileOpener",
  async fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { path, startLine, endLine, searchQuery, isRegex } = value

    const comData = (await import("../../../comData/comData.js")).default
    const cwd = comData.data.get()?.customCwd || process.cwd()
    const resolvedPath = pathLib.resolve(cwd, path)

    const isInProject = resolvedPath.startsWith(cwd)
    if (!isInProject) {
      const currentListId = metaData?.listId || 0
      const userConfirm = await waitConfirm({
        type: "tip",
        content: `路径：${resolvedPath}`,
        title: "AI 请求访问项目外文件，是否允许？",
        listId: currentListId
      })
      if (!userConfirm.ok) {
        return `用户拒绝访问项目外文件：${resolvedPath}。原因：${userConfirm.comment || "未提供"}`
      }
    }

    try {
      const stat = await fs.stat(resolvedPath)
      if (!stat.isFile()) {
        return `错误：${path} 不是一个文件`
      }

      const content = await fs.readFile(resolvedPath, 'utf8')
      const lines = content.split(/\r?\n/)
      const totalLines = lines.length
      const totalChars = content.length

      // 1. 确定行范围
      let currentStart = startLine || 1
      let currentEnd = endLine || (startLine ? currentStart + 500 : 500) // 如果指定了开始没写结束，给500行；如果都没写，默认前500行

      // 如果文件本身很小且没指定范围，则尝试全量读取
      if (!startLine && !endLine && totalLines <= 500) {
        currentEnd = totalLines
      }

      const startIdx = Math.max(0, currentStart - 1)
      const endIdx = Math.min(totalLines, currentEnd)

      const kbSize = (Buffer.byteLength(content, "utf8") / 1024).toFixed(2) + " KB"

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
              if (!flags.includes("i")) flags += "i" // default i
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
        outputLines.push(`> [!INFO] 搜索 "${searchQuery}" 找到 ${matchIndices.length} 个匹配项。文件总计约 ${kbSize} 大小。`)
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

      const resultLines = lines.slice(startIdx, endIdx)
        .map((line, i) => `${startIdx + i + 1}: ${line}`)
      let resultStr = resultLines.join("\n")

      // 2. 字符硬截断保护（按行截断，避免截断在行中间）
      const MAX_CHARS = 4000
      let isCharClipped = false
      if (resultStr.length > MAX_CHARS) {
        while (resultStr.length > MAX_CHARS && resultLines.length > 1) {
          resultLines.pop()
          resultStr = resultLines.join("\n")
        }
        isCharClipped = true
      }

      // 3. 构造输出
      const rangeInfo = `读取 L${startIdx + 1} - L${startIdx + resultLines.length} (文件共 ${totalLines} 行 / 大小 ${kbSize})`
      const indicators = []

      indicators.push(`> [!TIP] 每行开头的数字是行号（格式：\`行号: 内容\`），用于定位代码位置。使用 filePatcher 替换时，target 和 replace 参数中**不要包含行号前缀**，只需提供实际的代码内容。`)

      if (startIdx + resultLines.length < totalLines) {
        indicators.push(`> [!NOTE] 后续行已截断，翻页请指定 startLine: ${startIdx + resultLines.length + 1}`)
      } else if (!isCharClipped) {
        indicators.push(`> [!IMPORTANT] 已读完至文件末尾 (Total: ${totalLines} lines)`)
      }

      if (isCharClipped) {
        indicators.push(`> [!WARNING] 单次读取超过 ${MAX_CHARS} 字符，已按行截断。剩余内容请通过增加 startLine 继续。`)
      }

      return `${rangeInfo}\n${indicators.join("\n")}\n\`\`\`\n${resultStr}\n\`\`\``

    } catch (err) {
      return `读取文件失败：${err.message}`
    }
  },
  joi() {
    return Joi.object({
      path: Joi.string().required().description("文件绝对路径或相对项目根目录的路径"),
      startLine: Joi.number().min(1).description("起始行号(包含，默认为1。搜索时为搜索范围起点)"),
      endLine: Joi.number().min(1).description("结束行号(包含，默认为最后一行。搜索时为范围终点)"),
      searchQuery: Joi.string().allow("").description("可选。提供关键字时将转为搜索模式返回匹配段落"),
      isRegex: Joi.boolean().default(false).description("可选。指示 searchQuery 是否为正则。")
    })
  },
  getDoc() {
    return `读取指定文件的内容。支持通过 startLine, endLine 分页读取大文件保存上下文，同时也支持全文搜索(searchQuery/isRegex)以快速跳读。`
  }
}
