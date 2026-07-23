import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "打散/取消编组",
  id: "svgEditorUngroup",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, elementIds } = value

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

    const res = await appManager.dispatch(appId, "ungroup", { elementIds })
    if (res && res.ok) {
      return res.msg || "成功将已选中的群组打散"
    }
    throw new Error(res?.msg || "打散失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      elementIds: Joi.array().items(Joi.string()).description("可选。要打散的元素(群组)ID列表。如果提供，系统将选中这些元素并执行打散。如果留空，系统将对当前处于选中状态的群组进行打散。")
    })
  },

  getDoc() {
    return "将画布上当前被选中的群组（Group）进行打散/取消编组，剥离掉一层群组外壳，恢复为其内部的独立元素。当需要修改某个已有组合图形的内部细节，或者AI之前编错了组时，可以使用该工具。"
  }
}
