import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "浏览器滚动",
  id: "browserScroll",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { appId, x, y, distanceX, distanceY } = value

    // 自动寻找浏览器实例
    if (!appId) {
      const browsers = appManager.getSummary().filter(a => a.type === "browser")
      if (browsers.length > 0) {
        appId = browsers[0].id
      } else {
        return "错误：当前没有运行中的浏览器实例。"
      }
    }

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
      // 发送滚动指令给浏览器 App
      res = await appManager.dispatch(appId, "scroll", {
        x, y, distanceX, distanceY
      })
    } finally {
      // 操作完成后还原最小化状态
      if (wasMinimized && appManager.io) {
        appManager.io.emit("app:minimize", { appId })
      }
    }

    if (res && res.ok) {
      return `已执行滚动操作。`;
    }

    return `滚动失败：${String(res?.error || res?.msg || "响应为空")}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("浏览器实例 ID。若留空则自动选择当前活跃的浏览器。"),
      x: Joi.number().description("绝对滚动水平坐标 (px)"),
      y: Joi.number().description("绝对滚动垂直坐标 (px)"),
      distanceX: Joi.number().description("相对滚动水平距离 (负数为向左)"),
      distanceY: Joi.number().description("相对滚动垂直距离 (负数为向上)")
    })
  },

  getDoc() {
    return `控制浏览器页面滚动。可以指定绝对坐标 (x, y) 或相对距离 (distanceX, distanceY)。调用过程中浏览器会被唤到前台`
  }
}
