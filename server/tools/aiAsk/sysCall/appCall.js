import Joi from "joi"
import appManager from "../../../apps/appManager.js"

// 隔离的动态工具缓存 Map: appType -> Map(action -> toolModule)
const dynamicToolsCache = new Map()

export default {
  name: "调用App动作",
  id: "appCall",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { appType, action, args } = value

    // 1. 确保对应 App 的工具已扫描加载到隔离缓存中
    if (!dynamicToolsCache.has(appType)) {
      // 检查 App 定义是否存在
      if (!appManager.appDefs.has(appType)) {
        return `错误：未知的 App 类型 "${appType}"。请调用 appGetList 确认已安装列表。`
      }

      try {
        const appTools = await appManager.scanAppTools(appType)
        const actionMap = new Map()
        
        for (const tool of appTools) {
          // 提取动作名称，例如将 browserNavigate 的 "browser" 部分剥离
          // 若 id 为 browserNavigate, 剥离后为 Navigate, 转成小驼峰 navigate
          let rawAction = tool.id
          if (rawAction.toLowerCase().startsWith(appType.toLowerCase())) {
            rawAction = rawAction.slice(appType.length)
          }
          if (rawAction.length > 0) {
            const actionName = rawAction.charAt(0).toLowerCase() + rawAction.slice(1)
            actionMap.set(actionName, tool)
          }
        }
        dynamicToolsCache.set(appType, actionMap)
      } catch (e) {
        return `扫描 App "${appType}" 的工具集失败：${e.message}`
      }
    }

    const actionMap = dynamicToolsCache.get(appType)
    const tool = actionMap.get(action)

    if (!tool) {
      return `错误：App "${appType}" 不支持动作 "${action}"。请使用 appGetHelp 查询该 App 的动作列表。`
    }

    // 2. 参数二次 Joi 强校验
    if (typeof tool.joi === 'function') {
      const toolSchema = tool.joi()
      if (toolSchema) {
        const { value: validatedArgs, error: valError } = toolSchema.validate(args)
        if (valError) {
          return `参数校验错误：App "${appType}" 的动作 "${action}" 输入参数格式不正确。\n原因：${valError.details[0].message}`
        }
        // 使用校验过滤后的合法入参
        argObj.args = validatedArgs
      }
    }

    // 3. 执行工具逻辑
    try {
      // 动态工具执行时，需要 metaData 包含原本的 aiAskInstance 和 listId
      const result = await tool.fn(argObj.args, metaData)
      return result
    } catch (e) {
      return `执行 App "${appType}" 动作 "${action}" 失败：${e.message}`
    }
  },

  joi() {
    return Joi.object({
      appType: Joi.string().required().description("必填 目标 App 的类型 ID，例如 browser, aiRpg"),
      action: Joi.string().required().description("必填 执行动作名称，例如 navigate, scroll, interact"),
      args: Joi.object().unknown(true).required().description("必填 包含具体动作所需参数的对象，可调用 appGetHelp 确认具体字段说明")
    })
  },

  getDoc() {
    return "调用指定 App 的操控动作。可配合 appGetHelp 查询各 App 支持的动作详情与入参格式。"
  }
}
