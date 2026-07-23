import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "填充色块",
  id: "svgEditorFill",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, x, y, color, gapTolerance } = value

    if (!appId) {
      const activeApps = appManager.getSummary().filter(a => a.type === "svgEditor")
      if (activeApps.length > 0) {
        appId = activeApps[0].id
      } else {
        throw new Error("当前没有运行中的 svgEditor 实例。")
      }
    }

    const targetApp = appManager.get(appId)
    if (!targetApp) throw new Error("目标 svgEditor 实例不存在。")

    await appManager.launch("svgEditor", { appId })

    const res = await appManager.dispatch(appId, "fill", { x, y, color, gapTolerance })
    if (res && res.ok) {
      return res.msg || "成功填充色块"
    }
    throw new Error(res?.msg || "填充色块失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      x: Joi.number().required().description("填充起始点的 X 坐标。系统会自动寻找包含该点的最小封闭区域。"),
      y: Joi.number().required().description("填充起始点的 Y 坐标。"),
      color: Joi.string().required().description("填充的十六进制颜色值（如 #ff0000 或 #00ff00）"),
      gapTolerance: Joi.number().optional().description("闭合缝隙容差值（单位像素，默认为 10）。允许在存在极小缝隙未封闭的情况下自动补缝并填充。")
    })
  },

  getDoc() {
    return "在 svgEditor 的闭合区域内，指定点坐标 and 颜色，进行油漆桶填色。系统会自动搜索线段包裹的闭合平面进行着色。"
  }
}
