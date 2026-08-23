import Joi from "joi"
import { v4 as uuidV4 } from "uuid"
import waitConfirm from "../../../tools/waitConfirm.js"
import appManager from "../../../apps/appManager.js"

export default {
  name: "在浏览器中执行自定义 JS 脚本",
  id: "browserExecuteJS",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { appId, code, argsDesc } = value

    const targetApp = appManager.get(appId)
    if (!targetApp) {
      return "错误：未找到目标应用实例，或应用尚未运行。"
    }

    // 危险操作安全拦截：执行 JS 必须经用户确认
    const confirmId = uuidV4()
    const userConfirm = await waitConfirm({
      id: confirmId,
      type: "text",
      title: "安全警告：执行浏览器 JS 脚本",
      content: code,
      argsDesc: argsDesc || `AI 正在请求在浏览器实例 (${appId}) 的页面中执行这段 JavaScript 脚本。这属于高危操作，请仔细审查脚本内容是否安全！`,
      listId: argObj.listId || 0,
      ext: {
        identifier: "app:browser",
        toolId: this.id
      }
    })

    if (!userConfirm.ok) {
      return `错误：用户拒绝了 AI 执行该脚本的请求。用户备注：${userConfirm.comment || "无"}`
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

    let commentSuffix = userConfirm.comment ? `\n【用户备注】：${userConfirm.comment}` : ""

    if (res && res.ok) {
      try {
        const dataStr = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data)
        return `执行成功。返回值：${dataStr}${commentSuffix}`
      } catch (err) {
        return `执行成功，但返回值序列化失败：${err.message}${commentSuffix}`
      }
    }

    return `执行失败：${String(res?.msg || "响应为空")}${commentSuffix}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("浏览器实例 ID。必须指定要注入脚本的目标浏览器实例。"),
      code: Joi.string().required().description("要在网页上下文里执行的 JavaScript 脚本字符串，例如: 'document.title' 或 '(() => { return document.body.innerHTML })()'"),
      argsDesc: Joi.string().optional().description("对于本次执行脚本的目的和安全性的简短说明，用于向用户展示确认")
    })
  },

  getDoc() {
    return `在指定的内置浏览器窗口中注入并运行自定义 JavaScript 代码，并获取脚本的执行返回值。调用过程中浏览器会被唤到前台`
  }
}
