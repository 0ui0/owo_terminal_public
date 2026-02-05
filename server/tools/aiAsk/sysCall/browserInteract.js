import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "浏览器交互",
  id: "browserInteract",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, action, selector, text } = value

    let targetAppId = appId
    if (!targetAppId) {
      const browsers = appManager.getSummary().filter(a => a.type === "browser")
      if (browsers.length > 0) {
        targetAppId = browsers[0].id
      } else {
        return "错误：当前没有运行中的浏览器实例。请先调用 browserLaunch 启动浏览器。"
      }
    }

    if (action === "click") {
      const res = await appManager.dispatch(targetAppId, "click", { selector })
      if (res && res.ok) return "点击成功"
      return `错误：${String(res?.error || res?.msg || "点击失败 (空响应)")}`
    } else if (action === "type") {
      const res = await appManager.dispatch(targetAppId, "type", { selector, text })
      if (res && res.ok) return "输入完成"
      return `错误：${String(res?.error || res?.msg || "输入失败 (空响应)")}`
    }

    return "错误：不支持的交互操作"
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("浏览器实例 ID"),
      action: Joi.string().valid("click", "type").required().description("操作类型：click (点击), type (输入文字)"),
      selector: Joi.string().required().description("CSS 选择器"),
      text: Joi.string().description("要输入的文字 (仅 type 操作需要)")
    })
  },

  getDoc() {
    return `
      控制浏览器点击元素或输入文本。
    `
  }
}
