import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "编辑单个图元",
  id: "svgEditorEditElement",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, id, points, fill, delete: del, name } = value

    if (points && (points.length < 2 || points.length > 4)) {
      throw new Error(`线条控制点数量非法：需要2-4个点（2=直线 3=二次贝塞尔 4=三次贝塞尔），实际传入${points.length}个点。`)
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

    const res = await appManager.dispatch(appId, "edit", { id, points, fill, delete: del, name })
    if (res && res.ok) {
      return res.msg || "成功编辑图元"
    }
    throw new Error(res?.msg || "编辑图元失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      id: Joi.string().required().description("要编辑或删除的图元 ID（线段、填充组均可）"),
      points: Joi.array().items(Joi.object({
        x: Joi.number().required(),
        y: Joi.number().required()
      })).description("用于变形的全新控制点阵（只针对线段类型有效）"),
      fill: Joi.string().description("全新的填充颜色（只针对填充色块类型有效，如 #ff0000）"),
      name: Joi.string().description("全新的图元/编组名称，更新名称属性"),
      delete: Joi.boolean().default(false).description("是否直接将该图元（线段或色块）彻底从画布中移除。删除线段会自动解体绑定在此线段上的填充组，以防留空。")
    })
  },

  getDoc() {
    return "根据图元 ID 对其进行变形（修改 points）、改色（修改 fill 属性）或者执行安全销毁删除。注意：修改 points 或删除线条后，编辑器会自动重新执行交叉切割（splitBezier），切割后图元 ID 可能发生变化，如需后续操作请重新调用 getElements 获取最新图元列表。删除线条时会自动解体绑定在该线条上的填充色块。"
  }
}
