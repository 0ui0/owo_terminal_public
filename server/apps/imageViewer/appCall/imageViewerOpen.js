import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "打开图片查看器",
  id: "imageViewerOpen",



  async fn(argObj, metaData) {
    try {
      const { value, error } = this.joi().validate(argObj)
      if (error) {
        return { ok: false, msg: "参数校验错误: " + error.details[0].message }
      }

      let { filePath, appId } = value

      let targetAppId = appId
      if (!targetAppId) {
        const activeApps = appManager.getSummary().filter(a => a.type === "imageViewer")
        if (activeApps.length > 0) {
          targetAppId = activeApps[0].id
        } else {
          const launchRes = await appManager.launch("imageViewer", { data: { currentImagePath: filePath } })
          if (launchRes && launchRes.app?.id) {
            targetAppId = launchRes.app.id
          }
        }
      }

      if (!targetAppId) {
        return { ok: false, msg: "无法启动或找到图片查看器 App 实例" }
      }

      const res = await appManager.dispatch(targetAppId, "openImage", { filePath })
      if (!res || !res.ok) {
        return { ok: false, msg: res?.msg || "无法在图片查看器中打开该图片文件" }
      }

      const { dataUri, sisterImages, ...cleanData } = res.data || {}
      return {
        ok: true,
        msg: `成功在图片查看器中呈现图片: ${filePath}`,
        data: cleanData
      }
    } catch (err) {
      console.error("[imageViewerOpen Error]", err)
      return { ok: false, msg: `打开图片失败: ${err.message}` }
    }
  },

  joi() {
    return Joi.object({
      filePath: Joi.string().required().description("必填 本地待预览图片文件的绝对路径 (如 /Users/xxx/image.png)"),
      appId: Joi.string().optional().allow("").description("可选 目标图片查看器 App 实例 ID (如 app_xa154)")
    })
  },

  getDoc() {
    return "在图片查看器中打开呈现指定路径的本地图片文件"
  },
}
