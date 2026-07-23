import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "通过SVG代码画图",
  id: "svgEditorDrawSvg",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, svgString } = value

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

    const res = await appManager.dispatch(appId, "drawSvg", { svgString })
    if (res && res.ok) {
      return res.msg || "成功将SVG代码转化为图纸元件"
    }
    throw new Error(res?.msg || "导入SVG失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      svgString: Joi.string().required().description("包含完整 <svg>...</svg> 结构的字符串代码。")
    })
  },

  getDoc() {
    return `允许直接传入原生的 SVG 文本代码。系统会在前台启动内置解析器，将其转换为画布内的元件树并自动做好相互隔离与编组。
【重要提示：支持特性的白名单】
系统仅支持以下 SVG 特性，范围外的均不支持会被丢弃：
1. 仅支持的标签：<svg>, <g>, <path>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <text>。
2. 仅支持的形状属性：d, x, y, width, height, cx, cy, rx, ry, r, x1, y1, x2, y2, points。
3. 仅支持的样式属性：可以直接在标签上写，或写在内联 style="..." 中：fill, stroke, stroke-width, stroke-linejoin, stroke-linecap, opacity。请尽量使用基本的 HEX 颜色（如 #ff0000）。
4. 仅支持的变换属性：transform (如 translate, scale, rotate, matrix 等，解析器会将其扁平化计算到物理坐标中)。
5. 元素名称与图层标签：请在 <g> 或 <path> 等节点内部编写 <title>名称</title> 子标签，系统解析时会自动将其提取并转存为编辑器元素的 name 属性！
6. 文本标签 <text> 支持以下属性：x, y（基线位置，系统会自动补偿为视觉顶部）, font-size, font-family, fill（文字颜色）。多行文本请使用多个 <tspan> 子标签，每个 tspan 代表一行，系统会自动合并为换行内容。
生成 SVG 时，请尽量保持结构扁平，绝对不要使用上述白名单以外的任何特性。`
  }
}
