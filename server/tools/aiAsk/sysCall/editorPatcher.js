import Joi from "joi"
import { v4 as uuidV4 } from "uuid"
import waitConfirm from "../../waitConfirm.js"
import appManager from "../../../apps/appManager.js"

export default {
  name: "编辑文本",
  id: "editorPatcher",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, action, content, target, replace } = value

    // 1. 获取当前内容
    const appRes = await appManager.dispatch(appId, "getContent")
    if (!appRes || appRes.error) return `无法获取编辑器内容: ${appRes?.error || "未知错误"}`

    const currentContent = appRes.data.content
    const filePath = appRes.data.filePath
    let proposedContent = ""

    // 2. 计算提议内容
    if (action === "write") {
      proposedContent = content
    } else if (action === "patch") {
      if (!currentContent.includes(target)) {
        return `错误：未找到目标文本。请确保 target 与当前内容完全一致。`
      }
      proposedContent = currentContent.replace(target, replace)
    }

    // 3. 触发 Diff 确认
    const confirmId = uuidV4()
    const confirmPromise = waitConfirm({
      id: confirmId,
      type: "tip",
      title: "核对内容变更",
      content: "请核对 AI 提议的修改并在编辑器中批准/拒绝",
      listId: argObj.listId || 0
    })

    await appManager.dispatch(appId, "showDiff", {
      filePath,
      originalContent: currentContent,
      proposedContent,
      confirmId
    })

    const userConfirm = await confirmPromise
    if (!userConfirm) return "用户拒绝了修改"

    // 【关键重构】由工具负责最终落盘
    const fs = await import("fs/promises")
    if (filePath) {
      await fs.writeFile(filePath, proposedContent, "utf-8")
      return `修改已成功应用并保存到 ${filePath}。`
    }

    return `修改已成功应用（由于当前编辑器未关联文件路径，仅同步到内存）。`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("编辑器实例 ID"),
      action: Joi.string().valid("write", "patch").required().description("操作类型: write(全量) 或 patch(增量)"),
      content: Joi.string().when("action", { is: "write", then: Joi.required() }).description("全量写入的内容"),
      target: Joi.string().when("action", { is: "patch", then: Joi.required() }).description("要被替换的片段"),
      replace: Joi.string().when("action", { is: "patch", then: Joi.required() }).description("替换后的内容")
    })
  },

  getDoc() {
    return `对编辑器内容进行修改。支持全文覆盖或局部 Patch，修改后会弹出确认框供用户核对。`
  }
}
