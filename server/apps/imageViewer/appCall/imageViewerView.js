import Joi from "joi"
import fs from "fs-extra"
import pathLib from "path"
import axios from "axios"
import { Jimp } from "jimp"
import options from "../../../config/options.js"
import { imageToAscii } from "../../../tools/imageToAscii.js"
import tempPath from "../../../tools/tempPath.js"
import ioServer from "../../../ioServer/ioServer.js"

export default {
  name: "查看图片内容",
  id: "imageViewerView",
  mode: {
    read: true,
    write: false
  },

  async fn(argObj, metaData) {
    try {
      const { value, error } = this.joi().validate(argObj)
      if (error) {
        return "错误：" + error.details[0].message
      }

      const targetSourceStr = value.currentImagePath.trim()
      if (!targetSourceStr) {
        return "错误：currentImagePath 不能为空。"
      }

      const isVisionSupported = await (async () => {
        if (!metaData?.aiAskInstance?.openAi) return true
        const aiAskInstance = metaData.aiAskInstance
        if (aiAskInstance.isVisionSupported !== undefined) {
          return aiAskInstance.isVisionSupported
        }
        try {
          const testRes = await aiAskInstance.openAi.chat.completions.create({
            model: aiAskInstance.aiConfig.model,
            max_tokens: 16,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "t" },
                  {
                    type: "image_url",
                    image_url: {
                      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAEElEQVR4nGNgGAWjYBTAAAADEAABPywr7AAAAABJRU5ErkJggg=="
                    }
                  }
                ]
              }
            ]
          })
          aiAskInstance.isVisionSupported = true

          const totalTokensNum = testRes.usage?.total_tokens || 0
          if (totalTokensNum > 0) {
            try {
              const aiListArr = await options.get("ai_aiList")
              const modelIndexNum = aiListArr.findIndex(m => m.id === aiAskInstance.modelId)
              if (modelIndexNum !== -1) {
                aiListArr[modelIndexNum].preTokens = Number(aiListArr[modelIndexNum].preTokens) - totalTokensNum
                await options.set("ai_aiList", aiListArr)
              }
            } catch (tokenErr) {
              console.error("[imageViewerView] 扣除探针 token 失败:", tokenErr)
            }
          }
          return true
        } catch (probeErr) {
          aiAskInstance.isVisionSupported = false
          console.warn(`[imageViewerView] 检测到模型 [${aiAskInstance.aiConfig.model}] 不支持多模态图片:`, probeErr?.message || probeErr)
          return false
        }
      })()

      const mimeExtMap = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
        "image/bmp": ".bmp"
      }

      const imagePayloadObj = await (async () => {
        if (/^https?:\/\//i.test(targetSourceStr)) {
          const resp = await axios.get(targetSourceStr, {
            responseType: "arraybuffer",
            timeout: 15000
          })
          const contentTypeStr = String(resp.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase()
          const cleanUrlPathStr = targetSourceStr.split("?")[0].split("#")[0]
          const rawBaseStr = pathLib.basename(cleanUrlPathStr)
          const urlExtStr = pathLib.extname(rawBaseStr).toLowerCase()
          const isValidImageExt = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(urlExtStr)
          const extStr = mimeExtMap[contentTypeStr] || (isValidImageExt ? urlExtStr : "")
          if (!extStr) {
            throw new Error(`无法识别远程图片格式 (Content-Type: ${contentTypeStr || "未知"})`)
          }
          return {
            buffer: Buffer.from(resp.data),
            fileNameStr: isValidImageExt ? rawBaseStr : `image${extStr}`
          }
        }

        if (/^data:image\/([a-zA-Z0-9+.-]+);base64,/i.test(targetSourceStr)) {
          const matchArr = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/i.exec(targetSourceStr)
          const extStr = mimeExtMap[matchArr[1].toLowerCase()]
          if (!extStr) {
            throw new Error(`不支持的 Base64 图片格式 (${matchArr[1]})`)
          }
          return {
            buffer: Buffer.from(matchArr[2], "base64"),
            fileNameStr: `image${extStr}`
          }
        }

        const cleanLocalPathStr = (() => {
          if (!/^file:\/\//i.test(targetSourceStr)) return targetSourceStr
          const decodedStr = decodeURIComponent(targetSourceStr.replace(/^file:\/\//i, ""))
          return /^\/[a-zA-Z]:/.test(decodedStr) ? decodedStr.slice(1) : decodedStr
        })()

        if (!fs.existsSync(cleanLocalPathStr)) {
          throw new Error(`本地图片文件不存在 (${cleanLocalPathStr})`)
        }
        const statObj = await fs.stat(cleanLocalPathStr)
        if (!statObj.isFile()) {
          throw new Error(`指定路径不是有效的图片文件 (${cleanLocalPathStr})`)
        }
        return {
          buffer: await fs.readFile(cleanLocalPathStr),
          fileNameStr: pathLib.basename(cleanLocalPathStr)
        }
      })()

      const extLowerStr = pathLib.extname(imagePayloadObj.fileNameStr).toLowerCase()
      if (extLowerStr === ".svg") {
        return "错误：多模态模型不支持直接识别 SVG 矢量图，请改用 fileOpener 读取 SVG 源码查看。"
      }

      if (extLowerStr !== ".webp") {
        try {
          const jimpImg = await Jimp.read(imagePayloadObj.buffer)
          if (jimpImg.width <= 10 || jimpImg.height <= 10) {
            return `错误：图片尺寸过小 (${jimpImg.width}x${jimpImg.height})，宽高均需大于 10 像素，请提供有效尺寸的图片。`
          }
        } catch (dimErr) {
          return `错误：图片文件损坏或格式无效 (${dimErr.message})。`
        }
      }

      const portNum = ioServer.server?.info?.port
      if (!portNum) {
        return "错误：无法获取当前后端服务端口，无法上传附件图片。"
      }

      const formData = new FormData()
      formData.append("file", new Blob([imagePayloadObj.buffer]), imagePayloadObj.fileNameStr)
      const uploadRes = await axios.post(`http://localhost:${portNum}/api/attachments/set`, formData, {
        timeout: 30000
      })
      if (!uploadRes.data?.id) {
        return "错误：附件接口上传失败，未返回有效附件 ID。"
      }

      const attachIdStr = uploadRes.data.id
      const attachUrlStr = uploadRes.data.url

      if (!isVisionSupported) {
        const asciiArtStr = await imageToAscii(pathLib.join(tempPath.get("attachment"), attachIdStr), 80)
        return `【已读取图片内容】。由于您当前使用的模型不支持多模态视觉输入，系统已自动将其转化为 ASCII 字符画格式供您参考大致的结构和排版轮廓：\n\n\`\`\`text\n${asciiArtStr}\n\`\`\`\n\n（提示：字符画已丢失所有颜色及高清细节）`
      }

      if (metaData?.aiAskInstance) {
        const tipAsk = metaData.aiAskInstance.addAsk("系统", "user", `[读取图片] [attachid:${attachIdStr}]`, {
          isSystem: 1,
          group: "tip",
          toolCallGroupId: metaData.toolCallGroupId,
          toolCallStage: "process",
          attachments: [{
            id: attachIdStr,
            url: attachUrlStr,
            type: "image"
          }]
        })

        if (metaData.onResponse) {
          await metaData.onResponse(tipAsk)
        }
      }

      const sourceLabelStr = targetSourceStr.startsWith("data:") ? "base64图片" : targetSourceStr
      return `图片已发送（来源：${sourceLabelStr}），请结合图片内容分析。`
    } catch (err) {
      console.error("[imageViewerView Error]", err)
      return `查看图片失败：${err.message}`
    }
  },

  joi() {
    return Joi.object({
      currentImagePath: Joi.string().required().description("必填 待查看图片的本地绝对路径、远程地址(http/https)或 base64(data:image/...)")
    })
  },

  getDoc() {
    return `
      查看指定路径的图片
      如果当前模型不支持图片识别会自动转为 ASCII 字符画
      如果要查看 [attachid:xxxx] 或 [attach:xxxx] 标签的附件图片，请使用api地址访问
      http://localhost:系统端口号/attachment/xxx （后半部分是附件相对地址 /attachment/xxx）
      服务端口号需要通过获取系统状态工具查询。由于每次启动软件端口号都会改变，聊天历史里的端口号可能是错的，所以如果读不到图要重新查一次
      传参范例（currentImagePath）：
      - macOS/Linux 本地路径：/Users/xxx/a.png
      - Windows 磁盘路径：C:\\Users\\xxx\\a.png
      - 附件 API 地址：http://localhost:9501/attachment/file_xxx.jpg
      - 远程图片网址：https://example.com/a.png
      - Base64 图片：data:image/png;base64,iVBORw0KGgo...
    `.trim()
  }
}
