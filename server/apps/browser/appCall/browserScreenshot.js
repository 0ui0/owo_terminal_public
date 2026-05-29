import Joi from "joi"
import appManager from "../../../apps/appManager.js"
import options from "../../../config/options.js"

export default {
  name: "浏览器截图",
  id: "browserScreenshot",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let isVisionSupported = true;
    if (metaData && metaData.aiAskInstance && metaData.aiAskInstance.openAi) {
      const ai = metaData.aiAskInstance;
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
          });
          ai.isVisionSupported = true;

          // 扣除探针产生的 Token 消耗，保证 preTokens 余额审计无断层
          const totalTokens = testRes.usage?.total_tokens || 0;
          if (totalTokens > 0) {
            try {
              const aiList = await options.get("ai_aiList");
              const modelIndex = aiList.findIndex(m => m.name === ai.aiConfig.name);
              if (modelIndex !== -1) {
                aiList[modelIndex].preTokens = Number(aiList[modelIndex].preTokens) - totalTokens;
                await options.set("ai_aiList", aiList);
              }
            } catch (tokenErr) {
              console.error("[browserScreenshot] 扣除探针 token 失败:", tokenErr);
            }
          }
        } catch (err) {
          ai.isVisionSupported = false;
          console.warn(`[browserScreenshot] 检测到模型 [${ai.aiConfig.model}] 不支持多模态图片。`);
        }
      }
      isVisionSupported = ai.isVisionSupported;
    }

    if (!isVisionSupported) {
      const modelName = metaData?.aiAskInstance?.aiConfig?.model || "当前模型";
      return `错误：当前模型 [${modelName}] 不支持图片等多模态输入接口，无法使用浏览器截图工具。请勿再次调用此工具进行截图。若需获取网页内容，请改用其它非截图类的工具。`;
    }

    let { appId } = value

    // 如果未提供 appId，则自动寻找当前运行中的第一个浏览器实例
    if (!appId) {
      const browsers = appManager.getSummary().filter(a => a.type === "browser")
      if (browsers.length > 0) {
        appId = browsers[0].id
      } else {
        return "错误：当前没有运行中的浏览器实例。请先调用 browserLaunch 启动浏览器。"
      }
    }

    const targetApp = appManager.get(appId)
    if (!targetApp) {
      return "错误：未找到目标应用实例，或应用尚未运行。"
    }
    if (targetApp.type !== "browser") {
      return `错误：目标不是浏览器应用 (当前类型为 ${targetApp.type})。`
    }

    // 记录截图前的窗口最小化状态
    const wasMinimized = targetApp.data?.window?.minimized === true;

    // 强制唤醒目标浏览器实例，将其置于前台，避免由于桌面系统处于挂起/隐藏状态时截出黑屏或无法抓取
    await appManager.launch("browser", { appId })

    // 等待 600ms，确保前端 DOM 更新、窗口完成层次调整以及 Chromium 的渲染流水线解冻并吐出新帧
    await new Promise(r => setTimeout(r, 600))

    let res = null;
    try {
      res = await appManager.dispatch(appId, "screenshot")
    } finally {
      // 截图动作执行完毕或失败后，如果之前是最小化状态，则还原最小化
      if (wasMinimized && appManager.io) {
        appManager.io.emit("app:minimize", { appId })
      }
    }

    if (res && res.ok) {
      const attachId = res.data.id;

      // 向当前会话队列显式插入附带图片的辅助消息
      if (metaData && metaData.aiAskInstance) {
        const tipAsk = metaData.aiAskInstance.addAsk("系统", "user", `[浏览器快照(ID:${appId})] [attachid:${attachId}]`, {
          isSystem: 1,
          group: "tip",
          toolCallGroupId: metaData.toolCallGroupId,
          toolCallStage: "process",
          attachments: [{
            id: attachId,
            url: res.data.url,
            type: 'image'
          }]
        });

        // 必须通过 onResponse 实时同步给前端，否则聊天列表看不见插入的消息
        if (metaData.onResponse) {
          await metaData.onResponse(tipAsk);
        }
      }

      return `截图已发送，请结合快照分析。`;
    }

    return `截图失败：${String(res?.msg || "响应为空")}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("浏览器实例 ID。若留空则自动选择当前活跃的浏览器。")
    })
  },

  getDoc() {
    return `截取当前浏览器的屏幕快照，并自动保存为聊天附件。AI 可以利用此工具“看”到用户当前浏览的网页内容。调用过程中浏览器会被唤到前台`
  }
}
