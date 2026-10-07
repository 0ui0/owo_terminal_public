import Joi from "joi"
import appManager from "../../../apps/appManager.js"

// 隔离的动态工具缓存 Map: appType -> Map(id -> toolModule)
const dynamicToolsCache = new Map()

async function loadAppTools(appType) {
  const appTools = await appManager.scanAppTools(appType)
  const toolMap = new Map()
  for (const tool of appTools) {
    toolMap.set(tool.id, tool)
  }
  dynamicToolsCache.set(appType, toolMap)
}

export default {
  name: "代理调用App工具",
  id: "appCall",

  mode: {
    async read(argObj, metaData) {
      if (!dynamicToolsCache.has(argObj.appType)) {
        await loadAppTools(argObj.appType)
      }
      const tool = dynamicToolsCache.get(argObj.appType).get(argObj.id)
      return tool.mode.read
    },
    async write(argObj, metaData) {
      if (!dynamicToolsCache.has(argObj.appType)) {
        await loadAppTools(argObj.appType)
      }
      const tool = dynamicToolsCache.get(argObj.appType).get(argObj.id)
      return tool.mode.write
    }
  },

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { appType, id, arguments: toolArgs } = value

    // 1. 确保对应 App 的工具已扫描加载到隔离缓存中
    if (!dynamicToolsCache.has(appType)) {
      if (!appManager.appDefs.has(appType)) {
        return `错误：未知的 App 类型 "${appType}"。请调用 appGetList 确认已安装列表。`
      }

      try {
        await loadAppTools(appType)
      } catch (e) {
        return `扫描 App "${appType}" 的工具集失败：${e.message}`
      }
    }

    const tool = dynamicToolsCache.get(appType).get(id)

    if (!tool) {
      return `错误：App "${appType}" 不支持 ID 为 "${id}" 的工具。请使用 appGetHelp 查询该 App 的专属工具列表。`
    }

    // 权限校验：只根据会话的 allowUseTools 白名单拦截被禁用的 App 动作
    if (metaData?.config?.toolAccessMode === 'chatOnly') {
      return "当前为仅聊天模式，该工具调用已被系统拦截"
    }
    const allowUseTools = metaData?.config?.allowUseTools
    if (Array.isArray(allowUseTools) && !allowUseTools.includes(tool.id)) {
      return `当前工具${tool.id}不可用，全部可用工具：[${allowUseTools.join(', ')}]`
    }

    // 2. 参数二次 Joi 强校验
    let validatedArgs = toolArgs
    if (typeof tool.joi === 'function') {
      const toolSchema = tool.joi()
      if (toolSchema) {
        const { value: resArgs, error: valError } = toolSchema.validate(toolArgs)
        if (valError) {
          return `参数校验错误：App "${appType}" 工具 "${id}" 输入参数格式不正确。\n原因：${valError.details[0].message}`
        }
        validatedArgs = resArgs
      }
    }

    // 3. 执行工具逻辑
    try {
      return await tool.fn(validatedArgs, metaData)
    } catch (e) {
      return `执行 App "${appType}" 工具 "${id}" 失败：${e.message}`
    }
  },

  joi() {
    return Joi.object({
      appType: Joi.string().required().description("必填 目标 App 的类型 ID，例如 aiRpg"),
      id: Joi.string().required().description("必填 目标工具的唯一 ID，对应 tool.id，可调用 appGetHelp 查询"),
      arguments: Joi.object().unknown(true).default({}).description("必填 工具入参对象，具体结构请参考 appGetHelp")
    })
  },

  getDoc() {
    return "代理调用指定 App 的专属工具。可配合 appGetHelp 查询各 App 支持的工具详情与入参格式。"
  }
}
