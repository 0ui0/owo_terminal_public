import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "浏览器交互",
  id: "browserInteract",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, action, selector, text } = value

    let targetAppId = appId
    if (!targetAppId) {
      const browsers = appManager.getSummary().filter(a => a.type === "browser")
      if (browsers.length > 0) {
        targetAppId = browsers[0].id
      } else {
        return "错误：当前没有运行中的浏览器实例。请先调用 browserLaunch 启动浏览器。"
      }
    }

    const targetApp = appManager.get(targetAppId)
    if (!targetApp) {
      return "错误：未找到目标应用实例，或应用尚未运行。"
    }

    // 记录交互前的窗口最小化状态
    const wasMinimized = targetApp.data?.window?.minimized === true

    // 强制唤醒，确保渲染引擎活跃以及 DOM 交互受信任 (User Activation)
    await appManager.launch("browser", { appId: targetAppId })

    // 等待 300ms 避开界面动画导致的选择器位置偏移
    await new Promise(r => setTimeout(r, 300))

    let resultMsg = ""
    try {
      if (action === "click") {
        const res = await appManager.dispatch(targetAppId, "click", { selector })
        if (res && res.ok) resultMsg = "点击成功"
        else resultMsg = `错误：${String(res?.error || res?.msg || "点击失败")}`
      } else if (action === "type") {
        const res = await appManager.dispatch(targetAppId, "type", { selector, text, pressEnter: value.pressEnter })
        if (res && res.ok) resultMsg = "输入完成"
        else resultMsg = `错误：${String(res?.error || res?.msg || "输入失败")}`
      } else if (action === "pressKey") {
        const res = await appManager.dispatch(targetAppId, "pressKey", { selector, key: value.key || value.text || "Enter" })
        if (res && res.ok) resultMsg = "按键成功"
        else resultMsg = `错误：${String(res?.error || res?.msg || "按键失败")}`
      } else {
        resultMsg = "错误：不支持的交互操作"
      }
    } finally {
      // 操作完成后还原最小化状态
      if (wasMinimized && appManager.io) {
        appManager.io.emit("app:minimize", { appId: targetAppId })
      }
    }

    return resultMsg
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("浏览器实例 ID"),
      action: Joi.string().valid("click", "type", "pressKey").required().description("操作类型：click (点击), type (输入文字), pressKey (按下特定键)"),
      selector: Joi.string().required().description("CSS 选择器"),
      text: Joi.string().description("要输入的文字 (仅 type 操作需要)"),
      key: Joi.string().description("按键名称 (仅 pressKey 需要，默认为 Enter)"),
      pressEnter: Joi.boolean().default(false).description("在 type 操作完成后是否按下回车 (仅 type 操作可选)")
    })
  },

  getDoc() {
    return `
      控制浏览器点击元素或输入文本。调用过程中浏览器会被唤到前台
    `
  }
}
