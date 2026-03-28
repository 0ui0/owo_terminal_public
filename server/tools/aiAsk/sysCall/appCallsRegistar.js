import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "注册App工具",
  id: "appCallsRegistar",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { appType } = value

    // 检查 App 是否存在
    if (!appManager.appDefs.has(appType)) {
      return `错误：未知的 App 类型 "${appType}"。请先调用 appGetList 查看可用列表。`
    }

    try {
      const success = await appManager.registerAppTools(appType)
      if (success) {
        // 列出已注册的工具
        const loadedTools = appManager.getTools().filter(t => t._appType === appType)
        const toolNames = loadedTools.map(t => t.name).join(", ")
        return `成功注册 [${appType}] 的工具集（${loadedTools.length} 个）：${toolNames}。下一轮对话将可使用这些工具。`
      } else {
        return `注册失败：[${appType}] 没有提供工具集目录 (/appCall) 或目录为空。`
      }
    } catch (e) {
      return `发生错误：${e.message}`
    }
  },

  joi() {
    return Joi.object({
      appType: Joi.string().required().description("要注册工具集的 App 类型 ID（如 browser, editor）")
    })
  },

  getDoc() {
    return "动态注册指定 App 的操控函数/工具集。注册后，能使用该app的函数/工具。"
  }
}
