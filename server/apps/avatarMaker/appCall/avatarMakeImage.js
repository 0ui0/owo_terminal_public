import Joi from "joi"
import { v4 as uuidV4 } from "uuid"
import waitConfirm from "../../../tools/waitConfirm.js"
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

    let { appId, prompt, baseImagePath, outputPath, apiUrl, model } = value

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

    let config = {}
    try {
      const configRes = await appManager.dispatch(app.id, "queryConfig", { safeOnly: false })
      if (configRes && configRes.ok && configRes.data) {
        config = configRes.data
      }
    } catch (e) {}

    // 计算最终生效的配置（仅 apiUrl 和 model 允许动态覆盖，其余从前端安全表单读取）
    const effectiveProvider = (config.imageProvider || "volcengine").trim()
    const defaultUrl = effectiveProvider === "dashscope" ? "https://dashscope.aliyuncs.com/api/v1" : "https://ark.cn-beijing.volces.com/api/v3"
    const effectiveApiUrl = (apiUrl || config.imageApiUrl || "").trim() || defaultUrl
    const effectiveApiKey = (config.imageApiKey || "").trim()
    const effectiveModel = (model || config.imageModel || "").trim()

    // 危险/消耗性操作安全拦截：生图前必须经用户确认
    const confirmId = uuidV4()
    const userConfirm = await waitConfirm({
      id: confirmId,
      type: "text",
      title: "生成表情立绘/动作图片",
      content: `提示词: ${prompt}\n底图素材: ${baseImagePath}\n输出目标: ${outputPath}\n服务商: ${effectiveProvider}\n模型: ${effectiveModel || "(未设置)"}\n接口地址: ${effectiveApiUrl}`,
      argsDesc: `AI 正在请求调用生图 API 绘制表情图片，输出至: ${outputPath}`,
      listId: argObj.listId || (metaData?.listId) || 0,
      ext: {
        identifier: "app:avatarMaker",
        toolId: this.id
      }
    })

    if (!userConfirm.ok) {
      log(`⚠️ 用户拒绝/取消了生图请求: ${userConfirm.comment || "未提供"}`)
      return { ok: false, msg: `用户主动拒绝/取消了生图操作。原因：${userConfirm.comment || "未提供"}` }
    }

    const commentSuffix = userConfirm.comment ? `。用户备注：${userConfirm.comment}` : ""

    try {
      if (app.data.cancelTask) throw new Error("AbortError: 任务被取消")

      if (!effectiveApiKey) {
        throw new Error(`前端向导中未配置「图片 API Key」，请先在向导中填写保存。`)
      }
      if (!effectiveModel) {
        throw new Error(`未配置「图片生成模型」，请在向导中选择或在调用时传入 model 参数。`)
      }

      log(`▶️ 开始生成图片任务: ${prompt} (服务商: ${effectiveProvider}, 模型: ${effectiveModel})`)
      const ClientClass = effectiveProvider === "dashscope" ? DashScopeClient : VolcengineClient

      const client = new ClientClass({
        imageApi: {
          baseUrl: effectiveApiUrl,
          apiKey: effectiveApiKey,
          model: effectiveModel
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
        log(`调用 ${effectiveProvider === "dashscope" ? "阿里百炼 (DashScope)" : "火山引擎"} 图像 API...`)
        const result = await client.editExpression((baseImagePath || "").trim(), (prompt || "").trim(), {}, controller.signal)
        
        log(`图像生成成功，正在下载...`)
        const requestedOut = (outputPath || "").trim()
        const finalOutPath = getNonConflictingPath(requestedOut)

        const savedPath = await client.downloadFile((result.imageUrl || "").trim(), finalOutPath, controller.signal)
        
        log(`✅ 图像已保存至: ${savedPath}`)
        return { 
          ok: true, 
          msg: `操作成功${commentSuffix}`, 
          data: { outputPath: savedPath },
          comment: userConfirm.comment || null
        }
      } finally {
        clearInterval(timer)
      }
    } catch (err) {
      log(`❌ 生成失败: ${err.message}`)
      return {
        ok: false,
        msg: `调用 ${effectiveProvider} 图像 API 失败: ${err.message}。若由于地址或模型错误导致，长官可在下次调用时提供新的 apiUrl 或 model 参数覆盖重试。`,
        comment: userConfirm.comment || null
      }
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().optional().allow("").description("可选 目标 avatarMaker App 实例 ID (例如 app_xa154)"),
      prompt: Joi.string().required().description("表情提示词"),
      baseImagePath: Joi.string().required().description("基础底图文件路径"),
      outputPath: Joi.string().required().description("保存文件的目标绝对路径"),
      apiUrl: Joi.string().optional().allow("").description("可选 覆盖配置中的 API URL (不填则自动使用程序内部表单配置)"),
      model: Joi.string().optional().allow("").description("可选 覆盖配置中的模型名称/接入点 (不填则自动使用程序内部表单配置)")
    })
  }
}
