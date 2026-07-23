import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "编组图元",
  id: "svgEditorGroup",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    const { appId, elementIds, name } = value

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

    const res = await appManager.dispatch(appId, "group", { elementIds, name })
    if (res && res.ok) {
      return res.msg || "成功将已选中的元素编组"
    }
    throw new Error(res?.msg || "编组失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      elementIds: Joi.array().items(Joi.string()).description("可选。要编组的元素ID列表。如果提供，系统将选中这些元素并进行编组。如果留空，系统将对当前处于选中状态的元素进行编组。"),
      name: Joi.string().default("").description("编组名称/标签，如：'风扇整体'、'背景框架'")
    })
  },

  getDoc() {
    return `
      编组画布元素
      一般在连续调用 svgEditorDraw 画出一系列相关图元后调用此接口
      把它们打包为一个整体群组
      编组后元件将不会被切割
      注意画布排序永远是 组1 > 普通元素，组会显示在上层，调整层级也是按组调整。
      所以完整的画必须所有内容全部编组
    `
  }
}
