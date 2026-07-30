/**
 * 火山引擎方舟 API 客户端
 * 封装 Doubao-Seedream 图像生成 和 Doubao-Seedance 图生视频 的 HTTP 调用
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export class VolcengineClient {
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

  async _requestImageApi(endpoint, body, timeout = 120000, abortSignal) {
    const baseUrl = (this.imageApi.baseUrl || "").trim() || "https://ark.cn-beijing.volces.com/api/v3"
    const url = `${baseUrl}${endpoint}`
    let timeoutId
    const controller = new AbortController()
    
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort())
    }
    timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
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
      const data = await response.json()
      if (!response.ok) {
        throw new Error(`火山引擎 API 错误 [${response.status}]: ${JSON.stringify(data.error || data)}`)
      }
      return data
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async _requestVideoApi(endpoint, method = 'POST', body = null, timeout = 120000, abortSignal) {
    const baseUrl = (this.videoApi.baseUrl || "").trim() || "https://ark.cn-beijing.volces.com/api/v3"
    const url = `${baseUrl}${endpoint}`
    let timeoutId
    const controller = new AbortController()

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort())
    }
    timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const apiKey = (this.videoApi.apiKey || "").trim()
      const opts = {
        method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
      if (body && method === 'POST') {
        opts.body = JSON.stringify(body)
      }
      const response = await fetch(url, opts)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(`火山引擎 API 错误 [${response.status}]: ${JSON.stringify(data.error || data)}`)
      }
      return data
    } finally {
      clearTimeout(timeoutId)
    }
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

    const modelName = (this.imageApi.model || "").trim()

    const body = {
      model: modelName,
      prompt: fullPrompt,
      image: base64Image,
      sequential_id: options.sequential_id || `exp_${Date.now()}`,
      response_format: 'url',
      ...options,
    }

    const data = await this._requestImageApi('/images/generations', body, 120000, abortSignal)
    const imageUrl = data?.data?.[0]?.url
    if (!imageUrl) {
      throw new Error(`图像生成失败，未获取到图片URL: ${JSON.stringify(data)}`)
    }

    return {
      imageUrl,
      raw: data,
    }
  }

  async imageToVideo(firstFramePath, lastFramePath, prompt, options = {}, abortSignal) {
    const firstFrame = this._imageToBase64(firstFramePath)
    
    const content = [
      { type: 'text', text: prompt || '角色自然过渡动画' },
      { type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' },
    ]

    if (lastFramePath) {
      const lastFrame = this._imageToBase64(lastFramePath)
      content.push({ type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' })
    }

    const modelName = (this.videoApi.model || "").trim()

    const body = {
      model: modelName,
      content,
      duration: options.duration || 5,
    }

    const data = await this._requestVideoApi('/contents/generations/tasks', 'POST', body, 60000, abortSignal)
    if (!data.id) {
      throw new Error(`视频生成任务创建失败: ${JSON.stringify(data)}`)
    }

    return {
      taskId: data.id,
      status: data.status || 'queued',
      raw: data,
    }
  }

  async getTaskStatus(taskId, abortSignal) {
    const data = await this._requestVideoApi(`/contents/generations/tasks/${taskId}`, 'GET', null, 30000, abortSignal)
    return {
      status: data.status,
      videoUrl: data.content?.video_url,
      raw: data,
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

      if (status === 'succeeded') {
        if (!task.videoUrl) {
          throw new Error('任务成功但未获取到视频 URL')
        }
        return { videoUrl: task.videoUrl, raw: task.raw }
      }

      if (status === 'failed' || status === 'cancelled') {
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
