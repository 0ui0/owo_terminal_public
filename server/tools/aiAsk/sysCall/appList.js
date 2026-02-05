import Joi from "joi"
import appGetTypes from "../../../crossFuncs/appGetTypes.js"

export default {
  name: "可用app列表",
  id: "appList",

  async fn(argObj) {
    const { value } = this.joi().validate(argObj)
    let { appType } = value

    const appDefs = await appGetTypes.func()

    // 过滤掉 icon 字段以节省 token
    const sanitizedDefs = appDefs.map(({ icon, ...rest }) => rest)

    if (appType) {
      const def = sanitizedDefs.find(d => d.id === appType)
      if (def) {
        return JSON.stringify(def)
      } else {
        return `未找到类型为 ${appType} 的应用`
      }
    }

    return JSON.stringify(sanitizedDefs)
  },

  joi() {
    return Joi.object({
      appType: Joi.string().description("可选，查询指定应用，不填全返回")
    })
  },

  getDoc() {
    return `提供app信息和说明`
  }
}
