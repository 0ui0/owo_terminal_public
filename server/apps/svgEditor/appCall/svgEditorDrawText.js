import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "添加文本",
  id: "svgEditorDrawText",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, texts } = value

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

    const res = await appManager.dispatch(appId, "drawText", { texts })
    if (res && res.ok) {
      if (res.elementIds && res.elementIds.length > 0) {
        return `${res.msg || "成功添加文本"}。添加的文本元素 ID 列表为: ${JSON.stringify(res.elementIds)}`
      }
      return res.msg || "成功添加文本"
    }
    throw new Error(res?.msg || "添加文本失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      texts: Joi.array().items(Joi.object({
        text: Joi.string().required().description("文本内容（Markdown模式下可包含 Markdown 语法、LaTeX 公式及甘特图代码）"),
        x: Joi.number().default(0).description("文本起点X坐标"),
        y: Joi.number().default(0).description("文本起点Y坐标"),
        fontSize: Joi.number().default(24).description("字号大小（像素，仅在 mode 为 svg 时生效，markdown模式下忽略该属性）"),
        color: Joi.string().default("#000000").description("文字颜色（仅在 mode 为 svg 时生效，markdown模式下忽略该属性）"),
        mode: Joi.string().valid("svg", "markdown").default("svg").description("文本模式：svg (纯SVG文本，可控制字号和颜色) 或 markdown (Markdown富文本模式，支持LaTeX数学公式与甘特图等，样式完全由全局Markdown CSS决定，不支持fontSize/color等显式属性)"),
        name: Joi.string().default("").description("文本名称/标签，如：'标题文字'、'注释说明'")
      })).required().description("要批量添加的文本列表")
    })
  },

  getDoc() {
    return "在 svgEditor 画布中批量或单个添加文本对象。支持纯 SVG 文本模式（可自定义字号 fontSize 与颜色 color）以及 Markdown 富文本模式（支持 Markdown 语法、LaTeX 数学公式与甘特图等，样式完全由 Markdown CSS 规则接管，不支持 fontSize 和 color 属性）。【注意】每个文本对象都会被自动放入一个同名的独立编组（Group）中，与图形元素的编组结构保持一致。返回的 elementIds 是编组 ID，可直接用于 svgEditorGroup、svgEditorLayer 等后续操作。"
  }
}
