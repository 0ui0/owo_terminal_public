import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "在浏览器中执行自定义 JS 脚本",
  id: "browserExecuteJS",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { appId, code } = value

    const targetApp = appManager.get(appId)
    if (!targetApp) {
      return "错误：未找到目标应用实例，或应用尚未运行。"
    }

    // 记录操作前的窗口最小化状态
    const wasMinimized = targetApp.data?.window?.minimized === true

    // 强制唤醒，确保渲染引擎活跃
    await appManager.launch("browser", { appId })

    // 短暂等待，确保重绘活跃 (200ms)
    await new Promise(r => setTimeout(r, 200))

    let res = null
    try {
      // 发送执行 JS 指令给浏览器 App
      res = await appManager.dispatch(appId, "executeJS", { code })
    } finally {
      // 操作完成后还原最小化状态
      if (wasMinimized && appManager.io) {
        appManager.io.emit("app:minimize", { appId })
      }
    }

    if (res && res.ok) {
      try {
        const dataStr = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data)
        return `执行成功。返回值：${dataStr}`
      } catch (err) {
        return `执行成功，但返回值序列化失败：${err.message}`
      }
    }

    return `执行失败：${String(res?.msg || "响应为空")}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("浏览器实例 ID。必须指定要注入脚本的目标浏览器实例。"),
      code: Joi.string().required().description("要在网页上下文里执行的 JavaScript 脚本字符串，例如: 'document.title' 或 '(() => { return document.body.innerHTML })()'")
    })
  },

  getDoc() {
    return `在指定的内置浏览器窗口中注入并运行自定义 JavaScript 代码，并获取脚本的执行返回值。调用过程中浏览器会被唤到前台`
  }
}
