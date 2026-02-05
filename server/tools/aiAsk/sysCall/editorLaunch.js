import Joi from "joi"
import appLaunch from "../../../crossFuncs/appLaunch.js"

export default {
  name: "启动编辑器",
  id: "editorLaunch",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { filePath, content, args } = value

    const launchRes = await appLaunch.func("editor", {
      data: {
        filePath,
        content,
        ...args
      }
    })

    if (launchRes && launchRes.ok) {
      return `已启动编辑器, 实例 ID: ${launchRes.app.id}`
    } else {
      return `启动失败: ${String(launchRes?.msg || "未知错误")}`
    }
  },

  joi() {
    return Joi.object({
      filePath: Joi.string().optional().description("打开指定文件路径"),
      content: Joi.string().optional().description("初始填充内容"),
      args: Joi.object({}).unknown().optional().description("额外参数")
    })
  },

  getDoc() {
    return `启动编辑器。支持直接打开文件或填充文本内容。`
  }
}
