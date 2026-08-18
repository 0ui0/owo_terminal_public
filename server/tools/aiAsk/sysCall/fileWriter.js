import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import appManager from "../../../apps/appManager.js"
import { v4 as uuidV4 } from "uuid"
import workDirTool from "../../workDirTool.js"

export default {
  name: "写入文件",
  id: "fileWriter",
  async fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { filePath, content, overwrite, reason } = value

    // 1. Resolve Path
    const mainDir = workDirTool.getMainWorkDir(metaData.listId)
    if (!mainDir && (!filePath || !pathLib.isAbsolute(filePath))) {
      return "错误：当前会话未设置工作目录。请先要求用户配置工作目录，或者在使用工具时提供绝对路径。"
    }
    const resolvedPath = filePath ? (pathLib.isAbsolute(filePath) ? filePath : pathLib.resolve(mainDir, filePath)) : mainDir

    // 2. Check existence & Staleness Check
    const fileState = (await import("../../fileState.js")).default
    let exists = false
    let originalContent = ""
    try {
      const stat = await fs.stat(resolvedPath)
      exists = true
      originalContent = await fs.readFile(resolvedPath, 'utf8')

      // 安全检查：如果文件已存在且覆盖写入，需检查外部修改
      const cached = fileState.get(resolvedPath)
      if (cached && stat.mtimeMs > cached.timestamp) {
        return `⚠️ 安全拦截：文件自上次读取以来已被外部修改过。
当前文件修改时间：${new Date(stat.mtimeMs).toLocaleString()}
上次读取时间：${new Date(cached.timestamp).toLocaleString()}
为防止覆盖他人或自己的最新改动，请先使用 fileOpener 重新读取文件！`
      }
    } catch (e) {
      // File does not exist
    }

    if (exists && !overwrite) {
      return `错误：文件 ${pathLib.basename(resolvedPath)} 已存在。如需覆盖请设置 overwrite: true。`
    }

    // 3. Launch Dedicated Editor Window
    // 为 AI 写入任务创建一个唯一 ID，确保不干扰用户已打开的窗口
    const appId = `editor_writer_${uuidV4().slice(0, 8)}`
    const confirmId = uuidV4()

    const launchRes = await appManager.launch("editor", {
      appId: appId,
      data: {
        filePath: resolvedPath,
        originalContent: exists ? originalContent : "",
        proposedContent: content,
        isDiff: true,
        confirmId: confirmId,
        reason: reason
      }
    })
    if (!launchRes.ok) return `启动编辑器失败: ${launchRes.msg}`

    // 4. Wait for Approval
    const title = exists ? `覆盖确认: ${pathLib.basename(resolvedPath)}` : `新建文件确认: ${pathLib.basename(resolvedPath)}`
    const userConfirm = await waitConfirm({
      id: confirmId,
      type: "tip",
      title: title,
      content: `${reason}\n\n${exists ? "检测到文件已存在，请在编辑器中核对差异并批准覆盖。" : "即将创建新文件，请在编辑器中核对预览内容并批准。"}`,
      listId: metaData.listId
    })

    // 无论批准还是拒绝，只要是通过本工具启动的窗口，都应关闭
    await appManager.close(appId)

    if (!userConfirm.ok) return `用户拒绝了对 ${pathLib.basename(resolvedPath)} 的写入。原因：${userConfirm.comment || "未提供"}`

    // 5. Final Write (The tool handles the IO)
    try {
      await fs.mkdir(pathLib.dirname(resolvedPath), { recursive: true })
      await fs.writeFile(resolvedPath, content, "utf-8")

      // 真正落盘成功后，闭环同步更新 fileState 状态缓存与最新 mtime
      const newStat = await fs.stat(resolvedPath).catch(() => ({ mtimeMs: Date.now() }))
      fileState.set(resolvedPath, {
        timestamp: newStat.mtimeMs || Date.now(),
        content: content,
        startLine: 0,
        endLine: 0
      })

      let finalMsg = `成功写入文件: ${resolvedPath}。`
      if (userConfirm.comment) {
        if (userConfirm.comment.includes("批准修改的 Diff") || userConfirm.comment.includes("具体行批注")) {
          finalMsg += `\n\n${userConfirm.comment}`
        } else {
          finalMsg += `用户备注：${userConfirm.comment}`
        }
      }
      return finalMsg
    } catch (e) {
      return `写入失败: ${e.message}`
    }
  },

  joi() {
    return Joi.object({
      filePath: Joi.string().required().description("文件路径（支持相对当前工作目录的路径）"),
      reason: Joi.string().required().description("编辑理由，格式为：我将编辑___来为了___（写理由）"),
      content: Joi.string().required().description("要写入的完整文件内容"),
      overwrite: Joi.boolean().default(false).description("如果文件存在，是否允许覆盖")
    })
  },

  getDoc() {
    return `
      创建新文件或覆盖现有文件。
      - 如果作为新文件创建，会请求用户确认。
      - 如果覆盖现有文件，会自动启动编辑器展示 Diff 并请求用户批准。
      是全量写入的首选工具。
    `
  }
}
