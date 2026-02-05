import Joi from "joi"
import appClose from "../../../crossFuncs/appClose.js"

export default {
  name: "停止应用",
  id: "appStop",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { appId, args } = value

    const res = await appClose.func(appId)
    if (res && res.ok) {
      return `已停止实例: ${appId}`
    } else {
      return `停止失败: ${String(res?.msg || "未知错误")}`
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("实例 ID"),
      args: Joi.object({}).unknown().optional().description("可选参数")
    })
  },

  getDoc() {
    return `停止指定应用`
  }
}
