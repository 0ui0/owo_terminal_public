import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "绘制图元",
  id: "svgEditorDraw",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, elements } = value

    for (const el of elements) {
      if (el.type === "line" && el.points) {
        const n = el.points.length
        if (n < 2 || n > 4) {
          throw new Error(`线条控制点数量非法：需要2-4个点（2=直线 3=二次贝塞尔 4=三次贝塞尔），实际传入${n}个点。`)
        }
      }
    }

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

    const res = await appManager.dispatch(appId, "draw", { elements })
    if (res && res.ok) {
      if (res.elementIds && res.elementIds.length > 0) {
        return `${res.msg || "成功批量绘制图元"}。绘制的元素 ID 列表为: ${JSON.stringify(res.elementIds)}`
      }
      return res.msg || "成功批量绘制图元"
    }
    throw new Error(res?.msg || "绘制图元失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      elements: Joi.array().items(Joi.object({
        type: Joi.string().valid("line", "rect", "ellipse").required().description("图元类型：line(直线/贝塞尔曲线), rect(矩形), ellipse(椭圆)"),
        points: Joi.array().items(Joi.object({
          x: Joi.number().required(),
          y: Joi.number().required()
        })).description("图元的控制点阵（当且仅当类型为 line 时必填。2个点表示直线，3个点表示二次贝塞尔，4个点表示三次贝塞尔）"),
        x: Joi.number().description("矩形/椭圆起点X坐标（非line图元必填）"),
        y: Joi.number().description("矩形/椭圆起点Y坐标（非line图元必填）"),
        w: Joi.number().description("矩形宽度（类型为 rect 时必填）"),
        h: Joi.number().description("矩形高度（类型为 rect 时必填）"),
        rx: Joi.number().description("椭圆X轴半径（类型为 ellipse 时必填）"),
        ry: Joi.number().description("椭圆Y轴半径（类型为 ellipse 时必填）"),
        name: Joi.string().default("").description("图元名称/标签，如：'外边框'、'主线条'")
      })).required().description("要批量绘制的几何图形列表")
    })
  },

  getDoc() {
    return "在 svgEditor 画布中批量绘制几何图元（如直线、曲线、矩形或椭圆）。注意：该工具绘制完毕后不会自动切割线段。如果需要对相交线段进行交叉分割，必须在绘图完成后主动调用 svgEditorSplit 工具。"
  }
}
