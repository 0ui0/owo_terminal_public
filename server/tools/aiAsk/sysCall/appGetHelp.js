import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "查询App说明",
  id: "appGetHelp",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { appType } = value
    const appDef = appManager.appDefs.get(appType)
    if (!appDef) {
      return `未找到类型为 ${appType} 的应用。请先调用 appGetList 查看可用列表。`
    }

    // 基础信息
    const info = {
      id: appDef.id,
      name: appDef.name,
      description: appDef.description || "无描述",
      toolsLoaded: appManager.isAppToolsLoaded(appType)
    }

    // 扫描 appCall 工具列表
    const appTools = await appManager.scanAppTools(appType)
    if (appTools.length > 0) {
      info.availableTools = appTools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.getDoc ? tool.getDoc() : ""
      }))
    } else {
      info.availableTools = []
      info.note = "该 App 没有提供专属工具函数（appCall 目录为空或不存在）"
    }

    return JSON.stringify(info, null, 2)
  },

  joi() {
    return Joi.object({
      appType: Joi.string().required().description("要查询的 App 类型 ID（如 browser, editor）")
    })
  },

  getDoc() {
    return `获取指定 App 的详细说明和可用工具列表`
  }
}
