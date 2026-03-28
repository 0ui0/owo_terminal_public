import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "获取浏览器内容",
  id: "browserGetContent",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, type, startLine, endLine, clean = true, searchQuery, isRegex } = value

    let targetAppId = appId
    if (!targetAppId) {
      const browsers = appManager.getSummary().filter(a => a.type === "browser")
      if (browsers.length > 0) {
        targetAppId = browsers[0].id
      } else {
        return "错误：当前没有运行中的浏览器实例。请先调用 browserLaunch 启动浏览器。"
      }
    }

    const action = "getHTML" // 强制获取 HTML 以便后端解析
    const res = await appManager.dispatch(targetAppId, action)

    if (res && res.ok) {
      let content = res.data || ""

      // 1. 预处理内容
      if (type !== "html") {
        if (clean) {
          // 仅当开启 clean 时移除大块标签
          content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        }

        try {
          const htmlToMarkdown = (await import("../../htmlToMarkdown.js")).default
          content = htmlToMarkdown(content)
        } catch (e) {
          content = content.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n")
        }
      }

      // 2. 行切分与范围选择
      const totalChars = content.length
      const totalBytes = Buffer.byteLength(content, "utf8")
      const kbSize = (totalBytes / 1024).toFixed(2) + " KB"

      let lines = content.split(/\r?\n/)
      const totalLines = lines.length

      let startIdx, endIdx
      if (startLine === -1) {
        // 倒着读模式：endLine 为读取的行数
        const count = endLine || 100
        startIdx = Math.max(0, totalLines - count)
        endIdx = totalLines
      } else {
        // 正常范围模式
        startIdx = Math.max(0, (startLine || 1) - 1)
        endIdx = Math.min(totalLines, endLine || totalLines)
      }

      let outputLines = []

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
              if (!flags.includes("i")) flags += "i" // 缺省加入大小写不敏感
            }
            searchRegExp = new RegExp(pattern, flags)
          } catch (err) {
            return `错误：提供的正则表达式 "${searchQuery}" 不合法：${err.message}`
          }
        } else {
          // 普通搜索，转义特殊字符
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

        outputLines.push(`> [!INFO] 搜索 "${searchQuery}" 找到 ${matchIndices.length} 个匹配项。记录范围内总计约 ${kbSize} 大小。`)
        const maxMatches = 10
        const contextLines = 3
        if (matchIndices.length > maxMatches) {
          outputLines.push(`> [!WARNING] 匹配项过多，仅显示前 ${maxMatches} 个。若想查看完整信息，请查阅目标行号范围后，通过 startLine 及 endLine 再次调用本工具阅读。`)
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
          
          if (currentLength + blockText.length > 5000) {
            outputLines.push(`\n> [!NOTE] 结果因字数限制已被自动截断。请缩小搜索区间或使用更精确的关键字。`)
            break
          }
          
          outputLines.push(blockText)
          currentLength += blockText.length
        }
        return outputLines.join("\n")
      }
      
      if (startIdx === 0) {
        outputLines.push(`> [!INFO] 页面总共 ${totalLines} 行，${totalChars} 字符，大小约为 ${kbSize}。若页面过大阅读困难，请传入 searchQuery 参数进行关键字检索。`)
      }

      let currentLength = outputLines.join("\n").length
      let nextStartLine = -1

      // 遍历选定范围的行
      for (let i = startIdx; i < endIdx; i++) {
        const line = lines[i]
        const lineLen = line.length + 1 // +1 for newline

        // 如果单行就超过限制，强制截断并停止
        if (currentLength === 0 && lineLen > 5000) {
          outputLines.push(line.slice(0, 5000))
          currentLength = 5000
          nextStartLine = i + 1 // 仍然指引到当前行（因为只读了一部分），或者下一行？
          // 简单起见，长行截断后指引到下一行，虽然会丢失该行剩余部分，但符合“5000字截断”
          // 更好的体验是：长行截断暂时不完美支持，优先保证多行分页
          nextStartLine = i + 2
          break
        }

        // 如果累加超过 5000，则停止当前页
        if (currentLength + lineLen > 5000) {
          nextStartLine = i + 1 // 下一次从第 i+1 行开始 (1-based index)
          break
        }

        outputLines.push(line)
        currentLength += lineLen
      }

      let resultText = outputLines.join("\n")

      // 3. 添加分页提示
      let footer = `\n\n--- (读取行 ${startIdx + 1}-${startIdx + outputLines.length} / 内容共 ${totalLines} 行 / 总计 ${totalChars} 字符 / 大小 ${kbSize})`

      if (nextStartLine !== -1 && nextStartLine <= totalLines) {
        const remaining = totalLines - (nextStartLine - 1)
        footer += `\n> [!NOTE] 后续内容已截断，剩余 ${remaining} 行。继续阅读请使用: startLine=${nextStartLine}`
      } else {
        footer += `\n> [!IMPORTANT] 已阅读至末尾 (Total: ${totalLines} lines)`
      }

      return resultText + footer
    }

    return `错误：${res?.error || res?.msg || "获取内容失败 (空响应)"}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string(),
      type: Joi.string().valid("text", "html").default("text").description("text为结构化markdown，html为源码"),
      clean: Joi.boolean().default(true).description("是否清除script/style"),
      startLine: Joi.number().min(-1).default(1).description("起始行 (-1为倒序，搜索时可省)"),
      endLine: Joi.number().min(1).default(999999).description("结束行 (或倒序行数，搜索时可省)"),
      searchQuery: Joi.string().allow("").description("可选。提供关键字时将转为搜索模式，返回匹配行及上下文，并受到 startLine/endLine 的搜索范围限制。"),
      isRegex: Joi.boolean().default(false).description("可选。指示 searchQuery 是否为正则表达式 (支持普通字符串或 /pattern/flags 格式)。")
    })
  },

  getDoc() {
    return `获取当前浏览器页面的内容，支持常规翻页与关键字/正则搜索。利用 searchQuery (可显式配置 isRegex) 搜索并获取目标内容对应的确切行号区间。如果提供 searchQuery，则原长篇正文将被折叠，仅返回局部匹配项(含上下3行)。`.trim()
  }
}
