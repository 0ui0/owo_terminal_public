import { socketOnChat } from "../../ioServer/ioApis/chat/ioApi_chat.js"
import comData from "../../comData/comData.js"
import path from "path"
import fs from "fs"

const pendingConfigRequests = new Map()

function getExpressionKey(prompt) {
  if (!prompt) return "custom_expression"
  const cleanPrompt = prompt.trim()
  const presets = [
    { key: "smile", keywords: ["微笑", "smile"] },
    { key: "smileEye", keywords: ["闭眼笑", "smileEye"] },
    { key: "grin", keywords: ["露齿笑", "grin"] },
    { key: "grinHappy", keywords: ["欢快露齿笑", "grinHappy"] },
    { key: "grinEmbarrassed", keywords: ["尴尬露齿笑", "grinEmbarrassed"] },
    { key: "angry", keywords: ["生气怒视", "angry"] },
    { key: "clenchedTeeth", keywords: ["咬牙", "clenchedTeeth"] },
    { key: "clenchedTeethAngry", keywords: ["愤怒咬牙", "clenchedTeethAngry"] },
    { key: "clenchedTeethEmbarrassed", keywords: ["尴尬咬牙", "clenchedTeethEmbarrassed"] },
    { key: "crySad", keywords: ["伤心流泪", "crySad"] },
    { key: "cryHappy", keywords: ["喜极而泣", "cryHappy"] },
    { key: "sad", keywords: ["悲伤沮丧", "sad"] },
    { key: "pout", keywords: ["嘟嘴", "pout"] },
    { key: "poutEye", keywords: ["闭眼嘟嘴", "poutEye"] },
    { key: "poutSad", keywords: ["委屈嘟嘴", "poutSad"] },
    { key: "poutSlacken", keywords: ["迷茫嘟嘴", "poutSlacken"] },
    { key: "nervous", keywords: ["紧张慌张", "nervous"] },
    { key: "slacken", keywords: ["发呆", "slacken"] },
    { key: "slackenMore", keywords: ["深度发呆", "slackenMore"] },
    { key: "chrimas", keywords: ["圣诞节日风", "chrimas"] },
    { key: "chrimasEye", keywords: ["圣诞闭眼笑", "chrimasEye"] }
  ]

  for (const item of presets) {
    if (item.keywords.some(k => cleanPrompt.includes(k))) {
      return item.key
    }
  }

  const safeName = cleanPrompt.replace(/[^\w\u4e00-\u9fa5]+/g, "_").slice(0, 20)
  return safeName || "custom_expression"
}

function buildSopPrompt(appId, config) {
  const prompt = (config.prompt || "").trim()
  const exprKey = getExpressionKey(prompt)
  const baseOutDir = (config.outputDir || "./output").trim()

  const imagesDir = path.join(baseOutDir, "images")
  const finalDir = path.join(baseOutDir, "final")
  const tempVideoDir = path.join(baseOutDir, "temp_videos")

  let modeDesc = ""
  let modeGuide = ""

  if (config.mode === "0a") {
    modeDesc = "模式⓪a（静态半身表情图片）"
    const expImg = path.join(imagesDir, `${exprKey}.png`)
    const imagePrompt = `修改角色的面部表情为：${prompt}。保持背景（绿幕）、身体位置、服饰、发型、镜头构图完全不变。只改变面部五官、眉毛、嘴巴。`
    
    modeGuide = `【模式⓪a 执行 SOP 步骤】
1. 调用 avatarMakeImage 工具基于半身像生成静态表情图片：
   - appId: "${appId}"
   - prompt: "${imagePrompt}"
   - baseImagePath: "${config.halfBodyBase || ""}"
   - outputPath: "${expImg}"
2. ⏸️【人机交互确认】生成完成后，将生成的图片发送/展示给用户，并主动询问：“生成图片已完成，请检查效果，是否满意或需要调整？”`
  } else if (config.mode === "0b") {
    modeDesc = "模式⓪b（静态全身动作图片）"
    const poseImg = path.join(imagesDir, `${exprKey}_pose.png`)
    const imagePrompt = `为角色设计一个配合"${prompt}"的全身动态姿态。保持绿幕背景和角色服饰不变。`

    modeGuide = `【模式⓪b 执行 SOP 步骤】
1. 调用 avatarMakeImage 工具基于全身像生成静态动作姿态图片：
   - appId: "${appId}"
   - prompt: "${imagePrompt}"
   - baseImagePath: "${config.fullBodyBase || ""}"
   - outputPath: "${poseImg}"
2. ⏸️【人机交互确认】生成完成后，将生成的动作图片发送/展示给用户，主动询问是否满意。`
  } else if (config.mode === "1") {
    modeDesc = "模式①（表情特写到回位视频）"
    const expImg = path.join(imagesDir, `${exprKey}.png`)
    const tempVideo1 = path.join(tempVideoDir, `${exprKey}_zoom_in.webm`)
    const finalVideo = path.join(finalDir, `${exprKey}_final.webm`)
    
    const expImagePrompt = `修改角色的面部表情为：${prompt}。保持背景（绿幕）、身体位置、服饰、发型、镜头构图完全不变。只改变面部五官、眉毛、嘴巴。`
    const video1Prompt = `镜头从角色全身缓慢推进到半身特写，表情逐渐变为${prompt}。过渡流畅丝滑，保持绿幕背景。`
    const video2Prompt = `镜头从角色半身特写缓慢拉远到全身，表情从${prompt}逐渐恢复自然。过渡流畅丝滑，保持绿幕背景。`

    modeGuide = `【模式① 执行 SOP 步骤】
⚠️ 【关键交互规则】：生成图片后必须暂停询问用户，确认满意后再继续后续视频生成！
1. 第一步（生图）：调用 avatarMakeImage 工具基于半身像生成静态表情图。
   - appId: "${appId}"
   - prompt: "${expImagePrompt}"
   - baseImagePath: "${config.halfBodyBase || ""}"
   - outputPath: "${expImg}"
2. ⏸️【暂停询问】：第一步图片生成完成后，**立即暂停操作**，将生成的表情图片效果反馈给用户，并提问：“Step 1 表情静态图已生成（路径: ${expImg}），请确认效果是否满意？满意请回复【继续】，我将为您生成推进拉远视频！”
3. 第三步（确认后再继续）：收到用户【确认/OK/继续】的答复后，依次调用 avatarMakeVideo 生成推进视频与拉远拼接视频：
   - 推进视频 outputPath: "${tempVideo1}" (firstFrame="${config.fullBodyBase || ""}", lastFrame="${expImg}")
   - 拉远拼接视频 outputPath: "${finalVideo}" (firstFrame="${expImg}", lastFrame="${config.fullBodyBase || ""}", concatWith="${tempVideo1}")`
  } else if (config.mode === "2a") {
    modeDesc = "模式②a（全身微动动作视频 - 首尾相同）"
    const finalVideo = path.join(finalDir, `${exprKey}_final.webm`)
    const videoPrompt = `角色在绿幕前做"${prompt}"的全身动作微动过渡。画面平滑丝滑，保持绿幕背景。`

    modeGuide = `【模式②a 执行 SOP 步骤】
1. 调用 avatarMakeVideo 工具直接基于全身像生成首尾相同的微动视频：
   - appId: "${appId}"
   - firstFramePath: "${config.fullBodyBase || ""}"
   - lastFramePath: "${config.fullBodyBase || ""}"
   - prompt: "${videoPrompt}"
   - concatWith: null
   - outputPath: "${finalVideo}"
2. ⏸️【人机交互确认】视频生成完成后，将生成的 WebM 视频反馈给用户检查。`
  } else if (config.mode === "2b") {
    modeDesc = "模式②b（全身过渡动作视频 - 首尾不同）"
    const targetPoseImg = path.join(imagesDir, `${exprKey}_action_pose.png`)
    const finalVideo = path.join(finalDir, `${exprKey}_final.webm`)
    const posePrompt = `为角色设计一个配合"${prompt}"的全身动态姿态。保持绿幕背景和角色服饰不变。`
    const videoPrompt = `角色在绿幕前做"${prompt}"的全身动作过渡。画面平滑丝滑，保持绿幕背景。`

    modeGuide = `【模式②b 执行 SOP 步骤】
⚠️ 【关键交互规则】：生成姿态尾帧图片后必须暂停询问用户，确认满意后再继续后续视频生成！
1. 第一步（生图）：调用 avatarMakeImage 工具生成新动作的静态全身尾帧图。
   - appId: "${appId}"
   - prompt: "${posePrompt}"
   - baseImagePath: "${config.fullBodyBase || ""}"
   - outputPath: "${targetPoseImg}"
2. ⏸️【暂停询问】：第一步姿态尾帧图生成完成后，**立即暂停操作**，将姿态图反馈给用户，并提问：“Step 1 全身动作尾帧图已生成（路径: ${targetPoseImg}），请确认姿态是否满意？满意请回复【继续】，我将为您生成动作过渡视频！”
3. 第三步（确认后再继续）：收到用户【确认/OK/继续】答复后，调用 avatarMakeVideo 补间生成动作过渡视频：
   - firstFramePath: "${config.fullBodyBase || ""}"
   - lastFramePath: "${targetPoseImg}"
   - prompt: "${videoPrompt}"
   - outputPath: "${finalVideo}"`
  }

  const sysMsg = `[appid:${appId}] 请根据以下配置与 SOP 严格执行角色包制作任务：
- 目标 App 实例 ID: ${appId}
- 模式：${modeDesc}
- 提示词：${prompt || "无"}
- 表情标识键: ${exprKey}
- 输出基础目录：${baseOutDir}

${modeGuide}

⚠️ 注意：若涉及图片生成阶段（如模式①与模式②b），生成完图片后务必暂停并询问用户确认，收到用户肯定答复后再继续执行后面的视频生成步骤！`

  return { sysMsg, modeDesc, modeGuide, exprKey }
}

export default {
  async init(app, appManager) {
    app.data.cancelTask = false
    console.log(`[avatarMaker Backend] App ${app.id} initialized.`)
  },

  async destroy(app, appManager) {
    app.data.cancelTask = true
    console.log(`[avatarMaker Backend] App ${app.id} destroyed.`)
  },

  async dispatch({ app, action, args, appManager, io }) {
    switch (action) {
      case "commitTask": {
        app.data.cancelTask = false
        const targetListId = comData.data.get().targetChatListId || 0
        
        const config = args.config || {}
        const { sysMsg } = buildSopPrompt(app.id, config)

        socketOnChat({
          inputText: sysMsg,
          name: "系统",
          group: "user",
          sendMode: "agent",
          call: null,
          chatListId: targetListId
        })

        return { ok: true, msg: "任务已提交给主控 AI" }
      }

      case "cancelTask": {
        app.data.cancelTask = true
        return { ok: true, msg: "停止指令已发送" }
      }

      case "queryConfig": {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        const safeOnly = args?.safeOnly !== false

        return new Promise((resolve) => {
          const timeoutTimer = setTimeout(() => {
            if (pendingConfigRequests.has(requestId)) {
              pendingConfigRequests.delete(requestId)
              resolve({ ok: false, msg: "等待前端响应超时，请确认 App 窗口处于打开状态" })
            }
          }, 10000)

          pendingConfigRequests.set(requestId, (responseConfig) => {
            clearTimeout(timeoutTimer)
            const { sysMsg, modeDesc, modeGuide, exprKey } = buildSopPrompt(app.id, responseConfig)
            const enrichedData = {
              ...responseConfig,
              sopGuide: sysMsg,
              modeDesc,
              modeGuide,
              exprKey
            }
            resolve({ ok: true, msg: "从前端获取配置成功", data: enrichedData })
          })

          io.emit("app:dispatch", {
            appId: app.id,
            action: "requestConfig",
            args: { safeOnly, requestId }
          })
        })
      }

      case "replyConfig": {
        const { requestId, config } = args || {}
        if (requestId && pendingConfigRequests.has(requestId)) {
          const resolver = pendingConfigRequests.get(requestId)
          pendingConfigRequests.delete(requestId)
          resolver(config)
          return { ok: true, msg: "配置回传成功" }
        }
        return { ok: false, msg: "无效的请求 ID" }
      }

      case "readFile": {
        const { filePath } = args || {}
        if (!filePath) return { ok: false, msg: "缺少路径" }
        const cleanPath = filePath.replace(/^file:\/\//, "")
        if (!fs.existsSync(cleanPath)) return { ok: false, msg: "文件不存在" }
        const content = fs.readFileSync(cleanPath, "utf8")
        return { ok: true, msg: "读取成功", data: content }
      }

      case "saveToFile": {
        const { filePath, content } = args || {}
        if (!filePath || content === undefined) return { ok: false, msg: "缺少路径或内容" }
        const cleanPath = filePath.replace(/^file:\/\//, "")
        const dir = path.dirname(cleanPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(cleanPath, content, "utf8")
        return { ok: true, msg: "保存成功" }
      }

      default:
        return { ok: false, msg: "未知操作" }
    }
  }
}
