import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "获取角色包制作配置",
  id: "avatarGetConfig",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return { ok: false, msg: "参数校验错误: " + error.details[0].message }
    }

    let { appId } = value

    if (!appId) {
      const activeApps = appManager.getSummary().filter(a => a.type === "avatarMaker")
      if (activeApps.length > 0) {
        appId = activeApps[0].id
      } else {
        return { ok: false, msg: "当前没有运行中的 avatarMaker 实例" }
      }
    }

    const app = appManager.get(appId)
    if (!app) {
      return { ok: false, msg: `找不到 ID 为 ${appId} 的 avatarMaker 实例` }
    }

    try {
      const res = await appManager.dispatch(app.id, "queryConfig", { safeOnly: true })
      if (!res || !res.ok) {
        return { ok: false, msg: res?.msg || "无法从前端窗口获取最新的业务配置数据" }
      }
      return { ok: true, msg: "查询配置成功", data: res.data }
    } catch (err) {
      return { ok: false, msg: `获取配置失败: ${err.message}` }
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().optional().allow("").description("可选 目标 avatarMaker App 实例 ID (例如 app_xa154)")
    })
  }
}
