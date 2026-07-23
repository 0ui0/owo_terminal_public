import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "切割画布线段",
  id: "svgEditorSplit",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId } = value

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

    const res = await appManager.dispatch(appId, "split")
    if (res && res.ok) {
      return res.msg || "成功对画布中的相交图元进行了交叉切割"
    }
    throw new Error(res?.msg || "切割画布失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。")
    })
  },

  getDoc() {
    return "对当前画布中相交的所有线条或几何图元进行相交点切割。切割后，原本交叉在一起的线段将在交点处分裂成相互独立的图元，每个图元获得新的独立 ID。"
  }
}
