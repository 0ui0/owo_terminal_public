import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "浏览器截图",
  id: "browserScreenshot",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
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

    const res = await appManager.dispatch(appId, "screenshot")

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

    return `截图失败：${String(res?.error || res?.msg || "响应为空")}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("浏览器实例 ID。若留空则自动选择当前活跃的浏览器。")
    })
  },

  getDoc() {
    return `截取当前浏览器的屏幕快照，并自动保存为聊天附件。AI 可以利用此工具“看”到用户当前浏览的网页内容。`
  }
}
