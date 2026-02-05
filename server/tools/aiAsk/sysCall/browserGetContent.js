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

    const { appId, type, startLine, endLine, clean = true } = value

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
      let currentLength = 0
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

      // 添加分页提示
      if (nextStartLine !== -1 && nextStartLine <= totalLines) {
        const remaining = totalLines - (nextStartLine - 1)
        resultText += `\n\n--- (已截断: 显示行 ${startIdx + 1}-${nextStartLine - 1} / 共 ${totalLines} 行. 剩余 ${remaining} 行. 继续阅读请使用: startLine=${nextStartLine}) ---`
      }

      return resultText
    }

    return `错误：${res?.error || res?.msg || "获取内容失败 (空响应)"}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string(),
      type: Joi.string().valid("text", "html").default("text").description("text为结构化markdown，html为源码"),
      clean: Joi.boolean().default(true).description("是否清除script/style"),
      startLine: Joi.number().min(-1).required().description("起始行 (-1为倒序)"),
      endLine: Joi.number().min(1).required().description("结束行 (或倒序行数)")
    })
  },

  getDoc() {
    return `
      获取当前浏览器页面的内容，若需要验证可以提示用户手动完成后继续
    `.trim()
  }
}
