import Joi from "joi"
import appManager from "../../../apps/appManager.js"
import options from "../../../config/options.js"

export default {
  name: "获取画布截图",
  id: "svgEditorScreenshot",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let isVisionSupported = true
    if (metaData && metaData.aiAskInstance && metaData.aiAskInstance.openAi) {
      const ai = metaData.aiAskInstance
      if (ai.isVisionSupported === undefined) {
        try {
          const testRes = await ai.openAi.chat.completions.create({
            model: ai.aiConfig.model,
            max_tokens: 1,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "t" },
                  {
                    type: "image_url",
                    image_url: {
                      url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                    }
                  }
                ]
              }
            ]
          })
          ai.isVisionSupported = true

          const totalTokens = testRes.usage?.total_tokens || 0
          if (totalTokens > 0) {
            try {
              const aiList = await options.get("ai_aiList")
              const modelIndex = aiList.findIndex(m => m.name === ai.aiConfig.name)
              if (modelIndex !== -1) {
                aiList[modelIndex].preTokens = Number(aiList[modelIndex].preTokens) - totalTokens
                await options.set("ai_aiList", aiList)
              }
            } catch (tokenErr) {
              console.error("[svgEditorScreenshot] 扣除探针 token 失败:", tokenErr)
            }
          }
        } catch (err) {
          ai.isVisionSupported = false
          console.warn(`[svgEditorScreenshot] 检测到模型 [${ai.aiConfig.model}] 不支持多模态图片。`)
        }
      }
      isVisionSupported = ai.isVisionSupported
    }

    if (!isVisionSupported) {
      const modelName = metaData?.aiAskInstance?.aiConfig?.model || "当前模型"
      return `错误：当前模型 [${modelName}] 不支持图片等多模态输入接口，无法使用 svgEditor 截图工具。请勿再次调用此工具进行截图。若需获取画板内容，请改用 svgEditorGetElements 等非截图类工具。`
    }

    let { appId, useGrid } = value

    if (!appId) {
      const activeApps = appManager.getSummary().filter(a => a.type === "svgEditor")
      if (activeApps.length > 0) {
        appId = activeApps[0].id
      } else {
        throw new Error("当前没有运行中的 svgEditor 实例。")
      }
    }

    const targetApp = appManager.get(appId)
    if (!targetApp) throw new Error("目标 svgEditor 实例不存在。")

    await appManager.launch("svgEditor", { appId })

    await new Promise(r => setTimeout(r, 300))

    const res = await appManager.dispatch(appId, "screenshot", { useGrid })

    if (res && res.ok) {
      const attachId = res.data.id

      if (metaData && metaData.aiAskInstance) {
        const tipAsk = metaData.aiAskInstance.addAsk("系统", "user", `[画板快照(ID:${appId})] [attachid:${attachId}]`, {
          isSystem: 1,
          group: "tip",
          toolCallGroupId: metaData.toolCallGroupId,
          toolCallStage: "process",
          attachments: [{
            id: attachId,
            url: res.data.url,
            type: 'image'
          }]
        })

        if (metaData.onResponse) {
          await metaData.onResponse(tipAsk)
        }
      }
      return "截图已发送，请结合画布快照分析。"
    }
    throw new Error(res?.msg || "截图处理失败")
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      useGrid: Joi.boolean().default(true).description("是否在导出的截图上叠加像素网格与 X/Y 数字坐标刻度。这能帮助 AI 精准识别当前画面上所有线条的坐标几何位置。")
    })
  },

  getDoc() {
    return "截取当前 svgEditor 画板的屏幕快照，并自动保存为聊天附件。调用时，可选择叠加 50px 网格与刻度红轴供多模态 AI 读图。"
  }
}
