
import Joi from "joi"
import appLaunch from "../../../crossFuncs/appLaunch.js"
import aiSelectionData from "../../../apps/aiSelection/aiSelectionData.js"

export default {
  name: "气泡选择器",
  id: "aiSelect",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { title, content, options } = value

    // 1. 启动应用
    const launchRes = await appLaunch.func("aiSelection", {
      data: { title, content, options }
    })

    if (!launchRes || !launchRes.ok) {
      return `启动失败: ${String(launchRes?.msg || "未知错误")}`
    }

    const appId = launchRes.app.id

    // 2. 创建并注册 Promise
    return new Promise((resolve, reject) => {
      aiSelectionData.pendingResolves.set(appId, {
        resolve: (result) => {
          if (result && result.selected !== undefined) {
            resolve(`用户选择了：${typeof result.selected === 'string' ? result.selected : JSON.stringify(result.selected)}`)
          } else {
            resolve(`选择异常：${JSON.stringify(result)}`)
          }
        },
        reject: (reason) => {
          resolve(`选择出错：${String(reason)}`)
        }
      })

      // 设置超时保护 (2分钟)
      setTimeout(() => {
        if (aiSelectionData.pendingResolves.has(appId)) {
          aiSelectionData.pendingResolves.delete(appId)
          resolve("选择失败：等待超时")
        }
      }, 120000)
    })
  },

  joi() {
    return Joi.object({
      title: Joi.string().required().description("标题"),
      content: Joi.string().optional().description("markdown"),
      options: Joi.array().items(
        Joi.object({
          label: Joi.string().required().description("按钮文本"),
          value: Joi.any().required().description("返回值"),
          color: Joi.string().optional().description("#十六进制颜色")
        })
      ).min(1).required().description("选项列表")
    })
  },

  getDoc() {
    return `弹出气泡交互，用户选择并返回结果`
  }
}
