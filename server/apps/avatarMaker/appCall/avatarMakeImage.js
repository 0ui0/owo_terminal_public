import Joi from "joi"
import appManager from "../../../apps/appManager.js"
import { VolcengineClient } from "../lib/volcengine.js"
import { DashScopeClient } from "../lib/dashscope.js"
import path from "path"
import fs from "fs"

function getNonConflictingPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath
  const dir = path.dirname(targetPath)
  const ext = path.extname(targetPath)
  const name = path.basename(targetPath, ext)

  let counter = 1
  while (true) {
    const candidate = path.join(dir, `${name}_${counter}${ext}`)
    if (!fs.existsSync(candidate)) return candidate
    counter++
  }
}

export default {
  name: "生成表情静态图",
  id: "avatarMakeImage",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return { ok: false, msg: "参数校验错误: " + error.details[0].message }
    }

    let { appId, prompt, baseImagePath, outputPath } = value

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

    const log = (msg) => {
      appManager.io.emit("app:dispatch", { appId: app.id, action: "log", args: { message: msg } })
    }

    try {
      if (app.data.cancelTask) throw new Error("AbortError: 任务被取消")

      const configRes = await appManager.dispatch(app.id, "queryConfig", { safeOnly: false })
      if (!configRes || !configRes.ok || !configRes.data) {
        throw new Error("无法从前端获取最新的 API 配置，请确认前端 App 窗口处于开启状态")
      }
      const config = configRes.data

      log(`▶️ 开始生成图片任务: ${prompt}`)
      const provider = (config.imageProvider || "volcengine").trim()
      const ClientClass = provider === "dashscope" ? DashScopeClient : VolcengineClient
      
      const rawUrl = (config.imageApiUrl || "").trim()
      const defaultUrl = provider === "dashscope" ? "https://dashscope.aliyuncs.com/api/v1" : "https://ark.cn-beijing.volces.com/api/v3"

      const client = new ClientClass({
        imageApi: {
          baseUrl: rawUrl || defaultUrl,
          apiKey: (config.imageApiKey || "").trim(),
          model: (config.imageModel || "").trim()
        }
      })

      const controller = new AbortController()
      const timer = setInterval(() => {
        if (app.data.cancelTask) {
          controller.abort()
          clearInterval(timer)
        }
      }, 1000)

      try {
        log(`调用 ${provider === "dashscope" ? "阿里百炼 (DashScope)" : "火山引擎"} 图像 API...`)
        const result = await client.editExpression((baseImagePath || "").trim(), (prompt || "").trim(), {}, controller.signal)
        
        log(`图像生成成功，正在下载...`)
        const requestedOut = (outputPath || "").trim()
        const finalOutPath = getNonConflictingPath(requestedOut)

        const savedPath = await client.downloadFile((result.imageUrl || "").trim(), finalOutPath, controller.signal)
        
        log(`✅ 图像已保存至: ${savedPath}`)
        return { ok: true, msg: "操作成功", data: { outputPath: savedPath } }
      } finally {
        clearInterval(timer)
      }
    } catch (err) {
      log(`❌ 生成失败: ${err.message}`)
      throw err
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().optional().allow("").description("可选 目标 avatarMaker App 实例 ID (例如 app_xa154)"),
      prompt: Joi.string().required().description("表情提示词"),
      baseImagePath: Joi.string().required().description("基础底图文件路径"),
      outputPath: Joi.string().required().description("保存文件的目标绝对路径")
    })
  }
}
