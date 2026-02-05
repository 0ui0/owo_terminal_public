import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "阅读编辑器内容",
  id: "editorGetContent",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, startLine = 1, endLine = 500 } = value

    // 1. 获取内容
    const appRes = await appManager.dispatch(appId, "getContent")
    if (!appRes || appRes.error || !appRes.ok) {
      return `无法获取编辑器内容: ${appRes?.error || appRes?.msg || "未知错误"}`
    }

    const { content, filePath } = appRes.data
    const lines = content.split('\n')
    const totalLines = lines.length

    // 2. 切片逻辑
    const startIdx = Math.max(0, startLine - 1)
    const endIdx = Math.min(totalLines, endLine)
    const slicedLines = lines.slice(startIdx, endIdx)
    const slicedContent = slicedLines.join('\n')

    // 3. 构造信息头
    const totalChars = content.length
    let finalContent = slicedContent
    const MAX_CHARS = 4000 // 字符硬截断门槛
    let isCharClipped = false

    if (finalContent.length > MAX_CHARS) {
      finalContent = finalContent.slice(0, MAX_CHARS)
      isCharClipped = true
    }

    const info = `编辑器实例 [${appId}] ${filePath ? `(${filePath})` : "(未命名文件)"}\n` +
      `当前视图: L${startIdx + 1} - L${endIdx} (总计 ${totalLines} 行 / ${totalChars} 字符)\n` +
      (endIdx < totalLines ? `> [!NOTE] 后续行已截断，如需阅读更多请指定 startLine 为 ${endIdx + 1}\n` : "") +
      (isCharClipped ? `> [!WARNING] 当前输出字符数超过 ${MAX_CHARS}，已强制物理截断以保护上下文安全。\n` : "") +
      "\n--- 内容开始 ---\n"

    return info + finalContent
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("编辑器实例 ID"),
      startLine: Joi.number().integer().min(1).default(1).description("起始行号 (1-based)"),
      endLine: Joi.number().integer().min(1).default(500).description("结束行号")
    })
  },

  getDoc() {
    return `读取编辑器当前内容`
  }
}
