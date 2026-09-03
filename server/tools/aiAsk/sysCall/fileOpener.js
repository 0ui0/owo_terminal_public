import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import workDirTool from "../../workDirTool.js"

export default {
  name: "读取文件内容",
  id: "fileOpener",
  async fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { path, startLine, endLine } = value
    const fileState = (await import("../../fileState.js")).default

    const mainDir = workDirTool.getMainWorkDir(metaData.listId)
    if (!mainDir && (!path || !pathLib.isAbsolute(path))) {
      return "错误：当前会话未设置工作目录。请先要求用户配置工作目录，或者在使用工具时提供绝对路径。"
    }
    const resolvedPath = pathLib.isAbsolute(path) ? path : pathLib.resolve(mainDir, path)

    // 缓存校验（Token Dedup）
    try {
      const stat = await fs.stat(resolvedPath)
      const existingState = fileState.get(resolvedPath)
      // 如果读取范围一致且 mtime 未变，则返回已读存根
      if (existingState && existingState.timestamp === stat.mtimeMs) {
        const rangeMatch = existingState.startLine === startLine && existingState.endLine === endLine
        if (rangeMatch) {
          return `> [!NOTE] 文件内容自上次读取以来未发生变化 (${path})。已利用缓存存根减少 Token 消耗。`
        }
      }
    } catch (err) {
      // 忽略 stat 错误，后续 readFile 会处理
    }

    let commentSuffix = ""
    // 读白名单 = 主目录 + 辅助目录，全部工作目录内不拦截
    const workDirs = workDirTool.getWorkDirs(metaData.listId)
    const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
    if (!isInProject) {
      const userConfirm = await waitConfirm({
        type: "tip",
        content: `路径：${resolvedPath}`,
        title: "是否允许在工作目录外执行 fileOpener 工具？",
        listId: metaData.listId,
        ext: {
          identifier: `tool:${this.id}`,
          toolId: this.id
        }
      })
      if (!userConfirm.ok) {
        return `用户拒绝访问项目外文件：${resolvedPath}。原因：${userConfirm.comment || "未提供"}`
      }
      if (userConfirm.comment) {
        commentSuffix = `。用户备注：${userConfirm.comment}`
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

      // 1. 确定行范围（默认给前500行窗口，防止大文件全量刷屏；小文件自动全量）
      let currentStart = startLine || 1
      let currentEnd = endLine || (startLine ? currentStart + 500 : 500)

      // 如果文件本身很小且没指定范围，则尝试全量读取
      if (!startLine && !endLine && totalLines <= 500) {
        currentEnd = totalLines
      }

      const startIdx = Math.max(0, currentStart - 1)
      const endIdx = Math.min(totalLines, currentEnd)

      // 参数合法性校验：防止标题倒挂与静默空读
      if (startLine && endLine && startLine > endLine) {
        return `错误：startLine(${startLine}) 大于 endLine(${endLine})，读取范围非法。请检查参数顺序。`
      }
      if (startLine && startLine > totalLines) {
        return `错误：startLine(${startLine}) 超出文件总行数（共 ${totalLines} 行）。请检查参数。`
      }

      const kbSize = (Buffer.byteLength(content, "utf8") / 1024).toFixed(2) + " KB"

      const resultLines = lines.slice(startIdx, endIdx)
        .map((line, i) => `${startIdx + i + 1}: ${line}`)
      let resultStr = resultLines.join("\n")

      // 2. 字符硬截断保护（按行截断，避免截断在行中间）
      const MAX_CHARS = 15000
      let isCharClipped = false
      if (resultStr.length > MAX_CHARS) {
        while (resultStr.length > MAX_CHARS && resultLines.length > 1) {
          resultLines.pop()
          resultStr = resultLines.join("\n")
        }
        isCharClipped = true
      }

      // 3. 构造输出
      const rangeInfo = `读取 L${startIdx + 1} - L${startIdx + resultLines.length} (文件共 ${totalLines} 行 / 大小 ${kbSize})${commentSuffix}`
      const indicators = []

      indicators.push(`> [!TIP] 每行开头的数字是行号（格式：\`行号: 内容\`），用于定位代码位置。使用补丁工具替换时，target 和 replace 参数中**不要包含行号前缀**，只需提供实际的代码内容。`)

      if (startIdx + resultLines.length < totalLines) {
        indicators.push(`> [!NOTE] 后续行已截断，翻页请指定 startLine: ${startIdx + resultLines.length + 1}`)
      } else if (!isCharClipped) {
        indicators.push(`> [!IMPORTANT] 已读完至文件末尾 (Total: ${totalLines} lines)`)
      }

      if (isCharClipped) {
        indicators.push(`> [!WARNING] 单次读取超过 ${MAX_CHARS} 字符，已按行截断。剩余内容请通过增加 startLine 继续。`)
      }

      // 4. 更新缓存
      fileState.set(resolvedPath, {
        timestamp: stat.mtimeMs,
        startLine,
        endLine,
        content: resultStr
      })

      return `${rangeInfo}\n${indicators.join("\n")}\n\`\`\`\n${resultStr}\n\`\`\``

    } catch (err) {
      return `读取文件失败：${err.message}`
    }
  },
  joi() {
    return Joi.object({
      path: Joi.string().required().description("文件绝对路径或相对项目根目录的路径"),
      startLine: Joi.number().min(1).description("起始行号(包含，默认为1)"),
      endLine: Joi.number().min(1).description("结束行号(包含，默认前500行窗口；文件≤500行时自动全量)")
    })
  },
  getDoc() {
    return `读取指定文件的内容。支持通过 startLine, endLine 分页读取大文件以节省上下文。本工具仅负责单文件读取；跨文件全文检索请使用 codeSearch。`
  }
}
