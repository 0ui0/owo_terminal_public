import Joi from "joi"
import appLaunch from "../../../crossFuncs/appLaunch.js"

export default {
  name: "启动应用",
  id: "appLaunch",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { type, args } = value

    const launchRes = await appLaunch.func(type, { data: args })
    if (launchRes && launchRes.ok) {
      return `已启动 ${type}, ID: ${launchRes.app.id}`
    } else {
      return `启动失败: ${String(launchRes?.msg || "未知错误")}`
    }
  },

  joi() {
    return Joi.object({
      type: Joi.string().required().description("应用类型"),
      args: Joi.object({}).unknown().optional().description("可选参数")
    })
  },

  getDoc() {
    return `启动应用`
  }
}
