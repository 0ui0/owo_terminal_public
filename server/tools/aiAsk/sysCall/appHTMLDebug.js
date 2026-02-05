import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "应用运行状态调试",
  id: "appHTMLDebug",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, type = "text", clean = true } = value

    // 1. 检查或启动 App
    let targetApp = appManager.get(appId)
    if (!targetApp) {
      return `错误：未找到运行中的 App 实例 "${appId}"。请先确保应用已启动。`
    }

    // 2. 向 App 发送获取运行状态的请求
    // 我们约定：App 实例如果实现了 onDispatch，且能响应 action: "getHTML" 或 "getDebugInfo"
    const action = "getHTML"
    const res = await appManager.dispatch(appId, action)

    if (res && res.ok) {
      let content = res.data || ""

      // 3. 预处理内容 (类似于浏览器内容的清理逻辑)
      if (type === "text") {
        if (clean) {
          content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        }

        try {
          // 尝试转换为 Markdown 结构
          const htmlToMarkdown = (await import("../../htmlToMarkdown.js")).default
          content = htmlToMarkdown(content)
        } catch (e) {
          // 降级：仅剥离标签
          content = content.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n")
        }
      }

      // 4. 长度截断
      if (content.length > 5000) {
        content = content.slice(0, 5000) + "\n\n...(内容过多，已截断)"
      }

      return `--- App: ${targetApp.type} (${appId}) 运行状态 ---\n\n${content}`
    }

    return `错误：无法获取 App 运行内容。原因：${res?.error || res?.msg || "App 未响应或不支持调试指令"}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("目标应用的唯一 appId (例如: editor_123)"),
      type: Joi.string().valid("text", "html").default("text").description("返回类型：text 为净化的 Markdown，html 为原始 HTML"),
      clean: Joi.boolean().default(true).description("是否自动移除 script 和 style 标签")
    })
  },

  getDoc() {
    return `
      获取指定应用在屏幕上运行时的实时 HTML/DOM 结构。
      用于调试 App 界面显示异常、验证代码执行结果或 AI 自助排查 App 运行时错误。
    `.trim()
  }
}
