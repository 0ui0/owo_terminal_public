import { spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

export function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function ffmpeg(args, description = 'ffmpeg', abortSignal, onProgress) {
  return new Promise((resolve, reject) => {
    if (onProgress) onProgress(`⏳ 开始执行: ${description}`)
    if (abortSignal?.aborted) return reject(new Error("AbortError: 任务被取消"))

    const proc = spawn('ffmpeg', args, { stdio: 'pipe' })
    
    let abortHandler
    if (abortSignal) {
      abortHandler = () => {
        proc.kill('SIGKILL')
        reject(new Error("AbortError: 任务被取消"))
      }
      abortSignal.addEventListener('abort', abortHandler)
    }

    let stderr = ''
    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      stderr += msg
      if (onProgress) {
        // 提取核心进度信息，避免刷屏
        const timeMatch = msg.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/)
        if (timeMatch) onProgress(`⏳ [${description}] 进度: ${timeMatch[1]}`)
      }
    })
    
    proc.on('close', (code) => {
      if (abortSignal && abortHandler) abortSignal.removeEventListener('abort', abortHandler)
      if (code === 0 || code === null) { // code is null if killed
        if (abortSignal?.aborted) return // handled by abortHandler
        if (onProgress) onProgress(`✅ ${description} 完成`)
        resolve()
      } else {
        reject(new Error(`ffmpeg 退出码 ${code}: ${stderr.slice(-500)}`))
      }
    })
    
    proc.on('error', (err) => {
      if (abortSignal && abortHandler) abortSignal.removeEventListener('abort', abortHandler)
      reject(err)
    })
  })
}

export async function chromaKey(inputPath, outputPath, options = {}, abortSignal, onProgress) {
  const { color = '0x11A743', similarity = 0.20, blend = 0.1, speed = 1 } = options
  let filter = `colorkey=${color}:${similarity}:${blend}`
  if (speed !== 1) filter += `,setpts=${1/speed}*PTS`
  
  const args = [
    '-i', inputPath,
    '-vf', `${filter},scale=1454:1080`,
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    '-crf', '40',
    '-b:v', '0',
    '-r', '30',
    '-y',
    outputPath,
  ]
  await ffmpeg(args, `抠像: ${path.basename(inputPath)}`, abortSignal, onProgress)
  return outputPath
}

export async function concatVideos(inputs, outputPath, abortSignal, onProgress) {
  const listPath = outputPath.replace(/\.\w+$/, '_list.txt')
  const listContent = inputs.map(p => `file '${path.resolve(p)}'`).join('\n')
  fs.writeFileSync(listPath, listContent)
  
  const args = [
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'libvpx-vp9',
    '-crf', '40',
    '-b:v', '0',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    '-an',
    '-y',
    outputPath,
  ]
  
  try {
    await ffmpeg(args, `拼接 ${inputs.length} 个视频`, abortSignal, onProgress)
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }
  return outputPath
}
