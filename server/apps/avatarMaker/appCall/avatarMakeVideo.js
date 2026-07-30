import Joi from "joi"
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

    let { appId, firstFramePath, lastFramePath, prompt, concatWith, outputPath } = value

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
      if (!checkFfmpeg()) throw new Error("环境错误: 未安装 FFmpeg")

      const configRes = await appManager.dispatch(app.id, "queryConfig", { safeOnly: false })
      if (!configRes || !configRes.ok || !configRes.data) {
        throw new Error("无法从前端获取最新的 API 配置，请确认前端 App 窗口处于开启状态")
      }
      const config = configRes.data

      const provider = (config.videoProvider || "volcengine").trim()
      const ClientClass = provider === "dashscope" ? DashScopeClient : VolcengineClient

      const rawUrl = (config.videoApiUrl || "").trim()
      const defaultUrl = provider === "dashscope" ? "https://dashscope.aliyuncs.com/api/v1" : "https://ark.cn-beijing.volces.com/api/v3"

      const client = new ClientClass({
        videoApi: {
          baseUrl: rawUrl || defaultUrl,
          apiKey: (config.videoApiKey || "").trim(),
          model: (config.videoModel || "").trim()
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
        log(`▶️ 创建 ${provider === "dashscope" ? "阿里百炼 (DashScope)" : "火山引擎"} 视频生成任务...`)
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

        const rawVideoPath = path.join(tempDir, `raw_${Date.now()}.mp4`)
        log("下载视频原始文件...")
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

        // 清理临时 mp4 原始视频
        try { if (fs.existsSync(rawVideoPath)) fs.unlinkSync(rawVideoPath) } catch (e) {}

        log(`✅ 视频处理完成，保存至: ${resolvedFinal}`)
        return { ok: true, msg: "操作成功", data: { videoPath: resolvedFinal } }
      } finally {
        clearInterval(timer)
      }
    } catch (err) {
      log(`❌ 视频处理失败: ${err.message}`)
      throw err
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().optional().allow("").description("可选 目标 avatarMaker App 实例 ID (例如 app_xa154)"),
      firstFramePath: Joi.string().required().description("视频第一帧图片的绝对路径"),
      lastFramePath: Joi.string().allow(null, "").optional().description("视频最后一帧图片的绝对路径（可选）"),
      prompt: Joi.string().optional().allow("").description("视频动作/表情描述 prompt"),
      concatWith: Joi.string().allow(null, "").optional().description("需在前面拼接的已有 webm 视频绝对路径（可选）"),
      outputPath: Joi.string().required().description("保存最终合成 WebM 视频的目标绝对路径")
    })
  }
}
