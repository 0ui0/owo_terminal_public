import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "卸载App工具",
  id: "appCallsRemove",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { appType } = value

    if (!appManager.isAppToolsLoaded(appType)) {
      return `[${appType}] 的工具集当前未被加载，无需卸载。`
    }

    // 检查是否是 autoLoadTools 的核心 App
    const appDef = appManager.appDefs.get(appType)
    if (appDef?.autoLoadTools) {
      return `警告：[${appType}] 是核心 App（autoLoadTools），其工具不建议被卸载。如确需卸载请联系系统管理员。`
    }

    appManager.unregisterAppTools(appType)
    return `已卸载 [${appType}] 的工具集。下一轮对话将不再包含这些工具。`
  },

  joi() {
    return Joi.object({
      appType: Joi.string().required().description("要卸载工具集的 App 类型 ID（如 aiRpg, gomoku）")
    })
  },

  getDoc() {
    return "卸载已加载的App工具集以节约上下文"
  }
}
