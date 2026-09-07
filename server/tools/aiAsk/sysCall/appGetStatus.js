import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "查询App状态",
  id: "appGetStatus",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId } = value

    // 1. 先验证实例是否存在
    const app = appManager.get(appId)
    if (!app) {
      const runningIds = [...appManager.apps.keys()]
      const runningHint = runningIds.length > 0
        ? `当前运行中的实例有: [${runningIds.join(", ")}]`
        : "当前没有任何运行中的 App 实例"
      return `未找到 ID 为 "${appId}" 的 App 实例。${runningHint}。请调用 appGetList 确认。`
    }

    // 2. 直接复用 getAiSummary 全量概要并过滤目标 appId
    const summaries = appManager.getAiSummary(Infinity, 2000)
    const matched = summaries.find(item => item.includes(` ${appId}]`))

    if (matched) {
      return matched
    }

    // 兜底（如果实例存在但在摘要中未格式化）
    const appDef = appManager.appDefs.get(app.type)
    const appName = appDef?.name || app.type
    return `[${appName} ${app.id}] 运行中 | 状态: ${app.state}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().trim().required().description("目标 App 运行实例的 ID，例如 terminal_xxx, editor_xxx, browser_xxx")
    })
  },

  getDoc() {
    return "查询单个指定 App 实例的运行状态和属性"
  }
}
