import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "打开资源管理器目录",
  id: "explorerOpen",


  async fn(argObj, metaData) {
    try {
      const { value, error } = this.joi().validate(argObj)
      if (error) {
        return { ok: false, msg: "参数校验错误: " + error.details[0].message }
      }

      let { dirPath, appId } = value

      let targetAppId = appId
      if (!targetAppId) {
        const activeApps = appManager.getSummary().filter(a => a.type === "explorer")
        if (activeApps.length > 0) {
          targetAppId = activeApps[0].id
        } else {
          const launchRes = await appManager.launch("explorer", { data: { currentPath: dirPath } })
          if (launchRes && launchRes.app?.id) {
            targetAppId = launchRes.app.id
          }
        }
      }

      if (!targetAppId) {
        return { ok: false, msg: "无法启动或找到资源管理器 App 实例" }
      }

      const res = await appManager.dispatch(targetAppId, "navigate", { path: dirPath })
      if (!res || !res.ok) {
        return { ok: false, msg: res?.msg || "无法跳转到指定的目录路径" }
      }

      return {
        ok: true,
        msg: `成功在资源管理器中呈现目录: ${res.path || dirPath}`,
        data: {
          appId: targetAppId,
          currentPath: res.path || dirPath
        }
      }
    } catch (err) {
      console.error("[explorerOpen Error]", err)
      return { ok: false, msg: `打开资源管理器目录失败: ${err.message}` }
    }
  },

  joi() {
    return Joi.object({
      dirPath: Joi.string().required().description("必填 本地待呈现目录的绝对路径 (如 /Users/xxx/Documents)"),
      appId: Joi.string().optional().allow("").description("可选 目标资源管理器 App 实例 ID (如 app_xa154)")
    })
  },


  getDoc() {
    return "在资源管理器中打开呈现指定路径的目录文件"
  }
}
