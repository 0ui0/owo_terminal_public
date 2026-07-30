/**
 * DashScope (阿里百炼 / 通义万相) API 客户端
 * 封装通义万相 图像编辑 和 图生视频 的 HTTP 调用
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export class DashScopeClient {
  constructor(config) {
    this.imageApi = {
      baseUrl: (config?.imageApi?.baseUrl || "").trim(),
      apiKey: (config?.imageApi?.apiKey || "").trim(),
      model: (config?.imageApi?.model || "").trim()
    }
    this.videoApi = {
      baseUrl: (config?.videoApi?.baseUrl || "").trim(),
      apiKey: (config?.videoApi?.apiKey || "").trim(),
      model: (config?.videoApi?.model || "").trim()
    }
  }

  _getImageSize(imagePath) {
    try {
      const stdout = execSync(`sips -g pixelWidth -g pixelHeight "${imagePath}"`, { encoding: 'utf8' })
      const widthMatch = stdout.match(/pixelWidth: (\d+)/)
      const heightMatch = stdout.match(/pixelHeight: (\d+)/)
      if (widthMatch && heightMatch) {
        return `${widthMatch[1]}*${heightMatch[1]}`
      }
    } catch (e) {
      console.warn('⚠️ 读取图片宽高失败，使用默认 1456*1088 兜底:', e.message)
    }
    return '1456*1088'
  }

  _imageToBase64(imagePath) {
    const buffer = fs.readFileSync(imagePath)
    const ext = path.extname(imagePath).toLowerCase()
    let mimeType = 'image/png'
    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg'
    } else if (ext === '.webp') {
      mimeType = 'image/webp'
    }
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  }

  async editExpression(baseImagePath, expressionPrompt, options = {}, abortSignal) {
    const base64Image = this._imageToBase64(baseImagePath)
    const imgSize = this._getImageSize(baseImagePath)
    
    const fullPrompt = [
      `修改角色的面部表情为：${expressionPrompt}。`,
      `保持以下内容完全不变：`,
      `- 角色身体 and 位置`,
      `- 背景（绿幕背景）`,
      `- 服饰和发型`,
      `- 镜头位置和构图`,
      `- 图片尺寸和比例`,
      `只改变面部五官、眉毛、嘴巴的表情形态。`,
    ].join(' ')

    const modelName = (this.imageApi.model || "").trim() || "wanx2.1-i2i-turbo"

    const body = {
      model: modelName,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: base64Image },
              { text: fullPrompt },
            ],
          },
        ],
      },
      parameters: {
        n: 1,
        size: imgSize,
        ...options,
      },
    }

    const baseUrl = (this.imageApi.baseUrl || "").trim() || "https://dashscope.aliyuncs.com/api/v1"
    const url = `${baseUrl}/services/aigc/multimodal-generation/generation`

    const controller = new AbortController()
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort())
    }

    const apiKey = (this.imageApi.apiKey || "").trim()
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(`阿里百炼 API 错误 [${response.status}]: ${result.message || JSON.stringify(result)}`)
    }

    const outputUrl = result?.output?.choices?.[0]?.message?.content?.[0]?.image
      || result?.output?.results?.[0]?.url
      || result?.output?.image_url

    if (!outputUrl) {
      throw new Error(`图像生成失败，未获取到图片URL: ${JSON.stringify(result)}`)
    }

    return {
      imageUrl: outputUrl,
      taskId: result?.output?.task_id || result?.request_id,
      raw: result,
    }
  }

  async imageToVideo(firstFramePath, lastFramePath, prompt, options = {}, abortSignal) {
    const firstFrame = this._imageToBase64(firstFramePath)
    
    const media = [
      { type: 'first_frame', url: firstFrame },
    ]

    if (lastFramePath) {
      const lastFrame = this._imageToBase64(lastFramePath)
      media.push({ type: 'last_frame', url: lastFrame })
    }

    const modelName = (this.videoApi.model || "").trim() || "wanx2.1-kf2v-plus"

    const body = {
      model: modelName,
      input: {
        prompt: prompt || '角色自然过渡动画',
        media,
      },
      parameters: {
        resolution: options.resolution || '720P',
        duration: options.duration || 5,
        watermark: options.watermark !== undefined ? options.watermark : false,
      },
    }

    const baseUrl = (this.videoApi.baseUrl || "").trim() || "https://dashscope.aliyuncs.com/api/v1"
    const url = `${baseUrl}/services/aigc/video-generation/video-synthesis`

    const controller = new AbortController()
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort())
    }

    const apiKey = (this.videoApi.apiKey || "").trim()
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(`阿里百炼 API 错误 [${response.status}]: ${result.message || JSON.stringify(result)}`)
    }

    const taskId = result?.output?.task_id
    if (!taskId) {
      throw new Error(`视频生成任务创建失败: ${JSON.stringify(result)}`)
    }

    return {
      taskId,
      status: result?.output?.task_status || 'PENDING',
    }
  }

  async getTaskStatus(taskId, abortSignal) {
    const baseUrl = (this.videoApi.baseUrl || "").trim() || "https://dashscope.aliyuncs.com/api/v1"
    const url = `${baseUrl}/tasks/${taskId}`

    const controller = new AbortController()
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort())
    }

    const apiKey = (this.videoApi.apiKey || "").trim()
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(`获取任务状态失败 [${response.status}]: ${result.message || JSON.stringify(result)}`)
    }

    return {
      status: result?.output?.task_status,
      videoUrl: result?.output?.video_url,
      raw: result,
    }
  }

  async waitForTask(taskId, maxWaitSeconds = 600, pollIntervalSeconds = 10, abortSignal, onProgress) {
    const startTime = Date.now()
    let elapsed = 0

    while (elapsed < maxWaitSeconds * 1000) {
      if (abortSignal?.aborted) {
        throw new Error('AbortError: 轮询已取消')
      }

      const task = await this.getTaskStatus(taskId, abortSignal)
      const status = task.status

      if (onProgress) {
        onProgress(`⏳ 视频生成中 (${Math.round(elapsed / 1000)}s)... 状态: ${status}`)
      }

      if (status === 'SUCCEEDED') {
        if (!task.videoUrl) {
          throw new Error('任务成功但未获取到视频 URL')
        }
        return { videoUrl: task.videoUrl, raw: task.raw }
      }

      if (status === 'FAILED' || status === 'CANCELED') {
        throw new Error(`视频生成任务失败，状态: ${status}, 原因: ${JSON.stringify(task.raw)}`)
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalSeconds * 1000))
      elapsed = Date.now() - startTime
    }

    throw new Error(`视频生成超时 (${maxWaitSeconds}s)`)
  }

  async downloadFile(fileUrl, outputPath, abortSignal) {
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const controller = new AbortController()
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort())
    }

    const response = await fetch(fileUrl, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`下载文件失败 [${response.status}]`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(outputPath, buffer)
    return outputPath
  }
}
