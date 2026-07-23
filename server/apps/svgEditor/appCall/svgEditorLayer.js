import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "调整组层级",
  id: "svgEditorLayer",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, id, action, index } = value

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

    const res = await appManager.dispatch(appId, "layer", { id, action, index })
    if (res && res.ok) {
      return `${res.msg || "成功调整组层级"}。调整后的组层级结构数据为: ${JSON.stringify(res.data)}`
    }
    throw new Error(res?.msg || "调整组层级失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      id: Joi.string().required().description("要调整层级的组 ID（必须是编组 Group，只有组支持调整层级。若需调整普通图元层级，请先将其编组）"),
      action: Joi.string().valid("up", "down", "set").default("set").description("层级调整动作：set (直接指定绝对层级 index，默认), up (上移一层), down (下移一层)"),
      index: Joi.number().integer().min(0).description("目标层级序号（当 action 为 set 时生效，0 表示组列表中最底层，数值越大越在顶层）")
    })
  },

  getDoc() {
    return `
      调整画布中组（Group）的图层 z-index 层级。
      【关键层级规则】：
      1. 画布渲染层级规则永远是：组（Group） > 普通独立图元。所有的组都会无条件覆盖显示在普通图元上方。
      2. 只有“组（Group）”才可以进行层级调整！如果需要调整线条、图形或文字的层级，必须先使用 svgEditorGroup 工具将其编组。
      3. 支持输入目标层级 index（从 0 开始指定绝对层级），或使用 up/down 进行相对上移/下移。操作完成后会向 AI 返回最新所有组的层级列表及目标组的位置数据。
    `
  }
}
