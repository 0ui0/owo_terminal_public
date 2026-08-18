import Joi from "joi"
import fs from "fs/promises"
import { v4 as uuidV4 } from "uuid"
import waitConfirm from "../../../tools/waitConfirm.js"
import appManager from "../../appManager.js"
import { trs } from "../../../tools/i18n.js"
import fileState from "../../../tools/fileState.js"

export default {
  name: "编辑文本",
  id: "editorPatcher",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { appId, action, content, target, replace, reason } = value

    // 1. 获取当前内容
    const appRes = await appManager.dispatch(appId, "getContent")
    if (!appRes || !appRes.ok) return `无法获取编辑器内容: ${appRes?.msg || "未知错误"}`

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
      title: trs("editorPatcher/核对内容变更标题", { cn: "核对内容变更", en: "Check Content Change" }),
      content: `${reason}\n\n` + trs("editorPatcher/核对内容变更正文", { cn: "请核对 AI 提议的修改并在编辑器中批准/拒绝", en: "Please check the AI proposed changes and approve/reject in the editor" }),
      listId: argObj.listId || 0
    })

    await appManager.dispatch(appId, "showDiff", {
      filePath,
      originalContent: currentContent,
      proposedContent,
      confirmId
    })

    const userConfirm = await confirmPromise
    if (!userConfirm.ok) return `用户拒绝了修改。备注：${userConfirm.comment || "无"}`

    // 【关键重构】由工具负责最终落盘
    let commentSuffix = userConfirm.comment ? `。用户备注：${userConfirm.comment}` : ""
    if (filePath) {
      await fs.writeFile(filePath, proposedContent, "utf-8")

      // 真正落盘成功后，闭环同步更新 fileState 状态缓存与最新 mtime
      const newStat = await fs.stat(filePath).catch(() => ({ mtimeMs: Date.now() }))
      fileState.set(filePath, {
        timestamp: newStat.mtimeMs || Date.now(),
        content: proposedContent,
        startLine: 0,
        endLine: 0
      })

      // 同时更新编辑器内存状态与 mtime，防止用户后续保存误报外部修改
      await appManager.dispatch(appId, "acceptDiff", { proposedContent })

      return `修改已成功应用并保存到 ${filePath}${commentSuffix}。`
    }

    await appManager.dispatch(appId, "acceptDiff", { proposedContent })
    return `修改已成功应用（由于当前编辑器未关联文件路径，仅同步到内存）${commentSuffix}。`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("编辑器实例 ID"),
      reason: Joi.string().required().description("编辑理由，格式为：我将编辑___来为了___（写理由）"),
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
