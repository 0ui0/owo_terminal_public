import Joi from "joi"
import appActive from "../../../crossFuncs/appActive.js"

export default {
  name: "唤醒应用",
  id: "appActive",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { appId } = value

    await appActive.func(appId, args)
    return `已发送唤醒指令 (实例 ID: ${appId})`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required(),
      args: Joi.object({}).unknown().optional().description("可选参数")
    })
  },

  getDoc() {
    return `激活指定应用窗口到前台`
  }
}
