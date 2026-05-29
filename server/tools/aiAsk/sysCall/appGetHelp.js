import Joi from "joi"
import appManager from "../../../apps/appManager.js"
import joiToText from "../../joiToText.js"

export default {
  name: "查询App说明",
  id: "appGetHelp",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { appType } = value
    const appDef = appManager.appDefs.get(appType)
    if (!appDef) {
      return `错误：未找到类型为 "${appType}" 的应用。请先调用 appGetList 查看可用列表。`
    }

    // 1. 扫描 appCall 目录下的动态工具
    const appTools = await appManager.scanAppTools(appType)
    
    let doc = `【📄 App 功能手册 - ${appDef.name} (${appType})】\n`
    doc += `应用说明: ${appDef.description || "无描述"}\n`

    if (appTools.length > 0) {
      doc += `\n此 App 支持以下动作(action)可供调用。请通过 sysCalls.appCall 执行：\n`
      for (const tool of appTools) {
        // 剥离 appType 前缀得到小驼峰 action 名
        let rawAction = tool.id
        if (rawAction.toLowerCase().startsWith(appType.toLowerCase())) {
          rawAction = rawAction.slice(appType.length)
        }
        const actionName = rawAction.charAt(0).toLowerCase() + rawAction.slice(1)
        
        doc += `\n----------------------------------------\n`
        doc += `▶ 动作名称(action): "${actionName}"\n`
        doc += `  中文名称: ${tool.name}\n`
        doc += `  功能描述: ${tool.getDoc ? tool.getDoc() : "无描述"}\n`
        
        if (typeof tool.joi === 'function') {
          const schema = tool.joi()
          if (schema) {
            const schemaText = joiToText(schema, "    ")
            if (schemaText) {
              doc += `  参数规范 (请传入 args 参数对象中):\n${schemaText}\n`
            } else {
              doc += `  参数规范: 无需入参\n`
            }
          }
        } else {
          doc += `  参数规范: 无需入参\n`
        }
      }
    } else {
      doc += `\n提示：该 App 当前没有可对外暴露的动作/工具。`
    }

    return doc
  },

  joi() {
    return Joi.object({
      appType: Joi.string().required().description("要查询动作文档的 App 类型 ID（如 browser, aiRpg）")
    })
  },

  getDoc() {
    return `查询指定 App 支持的动作列表及详细参数规范文档`
  }
}
