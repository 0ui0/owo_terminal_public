import Joi from "joi"
import { v4 as uuidV4 } from "uuid"
import waitConfirm from "../../../tools/waitConfirm.js"
import appManager from "../../../apps/appManager.js"

export default {
  name: "获取浏览器Cookie",
  id: "browserGetCookies",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, argsDesc } = value

    let targetAppId = appId
    if (!targetAppId) {
      const browsers = appManager.getSummary().filter(a => a.type === "browser")
      if (browsers.length > 0) {
        targetAppId = browsers[0].id
      } else {
        return "错误：当前没有运行中的浏览器实例。请先调用 browserLaunch 启动浏览器。"
      }
    }

    // 危险操作安全拦截：获取 Cookie 必须经用户确认
    const confirmId = uuidV4()
    const userConfirm = await waitConfirm({
      id: confirmId,
      type: "tip",
      title: "安全警告：获取浏览器 Cookie",
      content: `AI 正在请求获取浏览器实例 (${targetAppId}) 当前页面的 Cookie，这可能包含您的敏感登录状态。是否允许？`,
      argsDesc: argsDesc,
      listId: argObj.listId || 0
    })

    if (!userConfirm.ok) {
      return `错误：用户拒绝了 AI 获取浏览器 Cookie 的请求。备注：${userConfirm.comment || "无"}`
    }

    const res = await appManager.dispatch(targetAppId, "getCookies")
    if (res && res.ok) {
      const { cookieString, cookies } = res.data
      if (!cookieString) {
        return `当前浏览器实例 (${targetAppId}) 中没有任何 Cookie。`
      }

      let output = `> [!INFO] 成功获取浏览器实例 (${targetAppId}) 的 Cookies。\n\n`
      output += `**Cookie 字符串 (Cookie String):**\n\`\`\`\n${cookieString}\n\`\`\`\n\n`
      output += `**结构化详情 (Cookies Detail):**\n`
      output += `| 名称 (Name) | 值 (Value) | 域名 (Domain) | 路径 (Path) | HttpOnly | 安全 (Secure) |\n`
      output += `| --- | --- | --- | --- | --- | --- |\n`
      cookies.forEach(c => {
        output += `| ${c.name} | ${c.value} | ${c.domain} | ${c.path} | ${c.httpOnly ? "✅" : "❌"} | ${c.secure ? "✅" : "❌"} |\n`
      })
      return output
    }
    return `错误：${res?.msg || "获取 Cookies 失败"}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("浏览器实例 ID。若留空，则默认使用第一个运行中的浏览器。"),
      argsDesc: Joi.string().required().description("必填，获取 Cookie 的用途说明及安全风险确认（Markdown表格格式）")
    })
  },

  getDoc() {
    return `获取指定浏览器实例中当前加载页面的 Cookie。此操作极其敏感，可能包含用户登录凭证，必须说明调用意图。`
  }
}
