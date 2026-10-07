import Joi from "joi"
import appManager from "../../../apps/appManager.js"
import joiToText from "../../joiToText.js"

export default {
  name: "查询App说明",
  id: "appGetHelp",
  mode: {
    read: true,
    write: false
  },

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
      doc += `\n此 App 包含以下专属工具，未直接注册到全局系统。请通过 appCall 代理调用：\n`
      for (const tool of appTools) {
        doc += `\n----------------------------------------\n`
        doc += `▶ 工具 ID (id): "${tool.id}"\n`
        doc += `  中文名称: ${tool.name}\n`
        doc += `  功能描述: ${tool.getDoc ? tool.getDoc() : "无描述"}\n`
        
        if (typeof tool.joi === 'function') {
          const schema = tool.joi()
          if (schema) {
            const schemaText = joiToText(schema, "    ")
            if (schemaText) {
              doc += `  参数规范 (请传入 arguments 参数对象中):\n${schemaText}\n`
            } else {
              doc += `  参数规范: 无需入参\n`
            }
          }
        } else {
          doc += `  参数规范: 无需入参\n`
        }

        doc += `  调用范例:\n  appCall({ appType: "${appType}", id: "${tool.id}", arguments: { ... } })\n`
      }
    } else {
      doc += `\n提示：该 App 当前没有可对外暴露的专属工具。`
    }

    return doc
  },

  joi() {
    return Joi.object({
      appType: Joi.string().required().description("查询某个app下未注册到系统的工具及其调用文档")
    })
  },

  getDoc() {
    return `查询指定 App 下未直接注册到全局系统的工具列表及详细参数规范文档`
  }
}
