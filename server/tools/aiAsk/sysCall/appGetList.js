import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "可用app列表",
  id: "appGetList",

  async fn(argObj) {
    const { value } = this.joi().validate(argObj)

    const appDefs = [...appManager.appDefs.values()]
    const runningApps = appManager.getSummary()

    const result = appDefs.map(def => {
      // 查找运行中的实例
      const instances = runningApps.filter(app => app.type === def.id)
      const toolsLoaded = appManager.isAppToolsLoaded(def.id)

      return {
        id: def.id,
        name: def.name,
        description: def.description || "",
        autoLoadTools: def.autoLoadTools || false,
        toolsLoaded,
        status: instances.length > 0 ? "running" : "stopped",
        instances: instances.map(i => i.id)
      }
    })

    if (value.appType) {
      const found = result.find(r => r.id === value.appType)
      return found ? JSON.stringify(found) : `未找到类型为 ${value.appType} 的应用`
    }

    return JSON.stringify(result)
  },

  joi() {
    return Joi.object({
      appType: Joi.string().description("app类型id，区别于运行实例的appid")
    })
  },

  getDoc() {
    return `查询系统中所有可用App基本信息及工具加载状态。`
  }
}
