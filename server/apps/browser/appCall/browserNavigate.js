import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "浏览器导航/打开",
  id: "browserNavigate",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { appId, url } = value

    // 模式1：启动新浏览器 (类似 terminalSet tid="-1")
    if (!appId || appId === "-1") {
      const launchRes = await appManager.launch("browser", { data: { url: url || "about:blank" } })
      if (launchRes && launchRes.ok) {
        return `已启动新浏览器，ID: ${launchRes.app.id}，并访问: ${url || "about:blank"}`
      } else {
        return `启动失败: ${String(launchRes?.msg || "未知错误")}`
      }
    }

    // 模式2：控制已有浏览器跳转
    // 检查 App 是否存在
    const app = appManager.get(appId)
    if (!app) {
      return `错误：找不到 ID 为 ${appId} 的浏览器实例。若要启动新窗口，请不传 appId 或传 "-1"。`
    }

    const res = await appManager.dispatch(appId, "navigate", { url })
    if (res && res.ok) return `跳转完成 (ID: ${appId})`
    return `错误：${String(res?.error || res?.msg || "跳转失败 (空响应)")}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().allow("-1", "").description("浏览器实例 ID。若留空或填 '-1'，则打开新窗口。"),
      url: Joi.string().default("about:blank").description("网址")
    })
  },

  getDoc() {
    return `打开浏览器`
  }
}
