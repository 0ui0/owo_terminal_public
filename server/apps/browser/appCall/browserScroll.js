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

    // 发送滚动指令给浏览器 App
    // 这里的参数逻辑需要与浏览器端定义的接口匹配，通常支持 absolute(x,y) 或 relative(dx,dy)
    const res = await appManager.dispatch(appId, "scroll", {
      x, y, distanceX, distanceY
    })

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
    return `控制浏览器页面滚动。可以指定绝对坐标 (x, y) 或相对距离 (distanceX, distanceY)。`
  }
}
