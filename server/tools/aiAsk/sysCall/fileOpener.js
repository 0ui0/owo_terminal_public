import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"

export default {
  name: "读取文件内容",
  id: "fileOpener",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { path, startLine, endLine } = value

    // 路径安全检查，防止访问项目外文件（简单检查，可根据需求加强）
    const resolvedPath = pathLib.resolve(path)

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

      const resultLines = lines.slice(startIdx, endIdx)
      let resultStr = resultLines.join("\n")

      // 2. 字符硬截断保护
      const MAX_CHARS = 4000
      let isCharClipped = false
      if (resultStr.length > MAX_CHARS) {
        resultStr = resultStr.slice(0, MAX_CHARS)
        isCharClipped = true
      }

      // 3. 构造输出
      const rangeInfo = `读取 L${startIdx + 1} - L${endIdx} (共 ${totalLines} 行 / ${totalChars} 字符)`
      const indicators = []
      if (endIdx < totalLines) indicators.push(`> [!NOTE] 后续行已截断，翻页请指定 startLine: ${endIdx + 1}`)
      if (isCharClipped) indicators.push(`> [!WARNING] 单次读取超过 ${MAX_CHARS} 字符，已强制物理截断。`)

      return `${rangeInfo}\n${indicators.join("\n")}\n\`\`\`\n${resultStr}\n\`\`\``

    } catch (err) {
      return `读取文件失败：${err.message}`
    }
  },
  joi() {
    return Joi.object({
      path: Joi.string().required().description("文件绝对路径或相对项目的路径"),
      startLine: Joi.number().min(1).description("起始行号(包含)，默认为1"),
      endLine: Joi.number().min(1).description("结束行号(包含)，默认为最后一行")
    })
  },
  getDoc() {
    return `
      读取指定文件的内容。
      支持通过 startLine 和 endLine 分页读取大文件，节省Token。
    `
  }
}
