import Joi from "joi"
import { v4 as uuidV4 } from "uuid"
import waitConfirm from "../../../tools/waitConfirm.js"
import appManager from "../../../apps/appManager.js"
import { VolcengineClient } from "../lib/volcengine.js"
import { DashScopeClient } from "../lib/dashscope.js"
import { checkFfmpeg, chromaKey, concatVideos } from "../modules/postProcess.js"
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
  name: "生成并合成视频",
  id: "avatarMakeVideo",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return { ok: false, msg: "参数校验错误: " + error.details[0].message }
    }

    let { appId, firstFramePath, lastFramePath, prompt, concatWith, outputPath, apiUrl, model } = value

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
    const effectiveProvider = (config.videoProvider || "volcengine").trim()
    const defaultUrl = effectiveProvider === "dashscope" ? "https://dashscope.aliyuncs.com/api/v1" : "https://ark.cn-beijing.volces.com/api/v3"
    const effectiveApiUrl = (apiUrl || config.videoApiUrl || "").trim() || defaultUrl
    const effectiveApiKey = (config.videoApiKey || "").trim()
    const effectiveModel = (model || config.videoModel || "").trim()

    // 危险/消耗性操作安全拦截：视频生成前必须经用户确认
    const confirmId = uuidV4()
    const userConfirm = await waitConfirm({
      id: confirmId,
      type: "text",
      title: "生成并合成动作视频",
      content: `提示词: ${prompt || "默认动作"}\n首帧素材: ${firstFramePath}${lastFramePath ? `\n尾帧素材: ${lastFramePath}` : ""}\n输出目标: ${outputPath}\n服务商: ${effectiveProvider}\n模型: ${effectiveModel || "(未设置)"}\n接口地址: ${effectiveApiUrl}`,
      argsDesc: `AI 正在请求调用视频生成 API 进行动作合成，输出至: ${outputPath}`,
      listId: argObj.listId || (metaData?.listId) || 0,
      ext: {
        identifier: "app:avatarMaker",
        toolId: this.id
      }
    })

    if (!userConfirm.ok) {
      log(`⚠️ 用户拒绝/取消了视频生成请求: ${userConfirm.comment || "未提供"}`)
      return { ok: false, msg: `用户主动拒绝/取消了视频生成操作。原因：${userConfirm.comment || "未提供"}` }
    }

    const commentSuffix = userConfirm.comment ? `。用户备注：${userConfirm.comment}` : ""

    try {
      if (app.data.cancelTask) throw new Error("AbortError: 任务被取消")
      if (!checkFfmpeg()) throw new Error("环境错误: 未安装 FFmpeg")

      if (!effectiveApiKey) {
        throw new Error(`前端向导中未配置「视频 API Key」，请先在向导中填写保存。`)
      }
      if (!effectiveModel) {
        throw new Error(`未配置「视频生成模型」，请在向导中选择或在调用时传入 model 参数。`)
      }

      const ClientClass = effectiveProvider === "dashscope" ? DashScopeClient : VolcengineClient

      const client = new ClientClass({
        videoApi: {
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
        log(`▶️ 创建 ${effectiveProvider === "dashscope" ? "阿里百炼 (DashScope)" : "火山引擎"} 视频生成任务 (模型: ${effectiveModel})...`)
        const cleanFirst = (firstFramePath || "").trim()
        const cleanLast = lastFramePath ? lastFramePath.trim() : ""
        const cleanPrompt = (prompt || "").trim()
        const requestedOut = (outputPath || "").trim()
        const cleanConcat = concatWith ? concatWith.trim() : null

        // 自动计算非冲突目标输出路径
        const finalOutPath = getNonConflictingPath(requestedOut)
        const tempDir = path.dirname(finalOutPath)

        const task = await client.imageToVideo(cleanFirst, cleanLast, cleanPrompt, { duration: 5 }, controller.signal)
        
        log(`任务已提交，TaskID: ${task.taskId}`)
        const result = await client.waitForTask(task.taskId, 600, 10, controller.signal, (progressMsg) => {
          log(progressMsg)
        })

        const baseName = path.basename(finalOutPath, path.extname(finalOutPath))
        const rawVideoPath = getNonConflictingPath(path.join(tempDir, `${baseName}_raw.mp4`))
        log(`下载视频原始文件至: ${rawVideoPath}`)
        await client.downloadFile(result.videoUrl, rawVideoPath, controller.signal)

        const keyedVideoPath = path.join(tempDir, `keyed_${Date.now()}.webm`)
        log("🎬 正在进行 FFmpeg 绿幕抠图与 alpha 通道处理...")
        await chromaKey(rawVideoPath, keyedVideoPath, {}, controller.signal, (msg) => log(msg))

        let resolvedFinal = finalOutPath
        if (cleanConcat) {
          log("🎞️ 正在拼接前置视频...")
          // 修正 Bug：传入 [cleanConcat, keyedVideoPath] 数组
          await concatVideos([cleanConcat, keyedVideoPath], resolvedFinal, controller.signal, (msg) => log(msg))
        } else {
          fs.renameSync(keyedVideoPath, resolvedFinal)
        }

        log(`✅ 视频处理完成，最终合成: ${resolvedFinal}，原始绿幕视频已保留至: ${rawVideoPath}`)
        return { 
          ok: true, 
          msg: `视频处理完成${commentSuffix}`, 
          data: { videoPath: resolvedFinal, rawVideoPath },
          comment: userConfirm.comment || null
        }
      } finally {
        clearInterval(timer)
      }
    } catch (err) {
      log(`❌ 视频处理失败: ${err.message}`)
      return {
        ok: false,
        msg: `调用 ${effectiveProvider} 视频 API 失败: ${err.message}。若由于地址或模型错误导致，长官可在下次调用时提供新的 apiUrl 或 model 参数覆盖重试。`,
        comment: userConfirm.comment || null
      }
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().optional().allow("").description("可选 目标 avatarMaker App 实例 ID (例如 app_xa154)"),
      firstFramePath: Joi.string().required().description("视频第一帧图片的绝对路径"),
      lastFramePath: Joi.string().allow(null, "").optional().description("视频最后一帧图片的绝对路径（可选）"),
      prompt: Joi.string().optional().allow("").description("视频动作/表情描述 prompt"),
      concatWith: Joi.string().allow(null, "").optional().description("需在前面拼接的已有 webm 视频绝对路径（可选）"),
      outputPath: Joi.string().required().description("保存最终合成 WebM 视频的目标绝对路径"),
      apiUrl: Joi.string().optional().allow("").description("可选 覆盖配置中的 API URL (不填则自动使用程序内部表单配置)"),
      model: Joi.string().optional().allow("").description("可选 覆盖配置中的模型名称/接入点 (不填则自动使用程序内部表单配置)")
    })
  }
}
