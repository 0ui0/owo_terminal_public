import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import appManager from "../../../apps/appManager.js"
import { v4 as uuidV4 } from "uuid"

export default {
  name: "写入文件",
  id: "fileWriter",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { filePath, content, overwrite } = value

    // 1. Resolve Path
    const comData = (await import("../../../comData/comData.js")).default
    const cwd = comData.data.get()?.customCwd || process.cwd()
    const resolvedPath = pathLib.resolve(cwd, filePath)

    // 2. Check existence
    let exists = false
    let originalContent = ""
    try {
      await fs.access(resolvedPath)
      exists = true
      originalContent = await fs.readFile(resolvedPath, 'utf8')
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
        confirmId: confirmId
      }
    })
    if (!launchRes.ok) return `启动编辑器失败: ${launchRes.msg}`

    // 4. Wait for Approval
    const title = exists ? `覆盖确认: ${pathLib.basename(resolvedPath)}` : `新建文件确认: ${pathLib.basename(resolvedPath)}`
    const userConfirm = await waitConfirm({
      id: confirmId,
      type: "tip",
      title: title,
      content: exists ? "检测到文件已存在，请在编辑器中核对差异并批准覆盖。" : "即将创建新文件，请在编辑器中核对预览内容并批准。",
      listId: argObj.listId || 0
    })

    // 无论批准还是拒绝，只要是通过本工具启动的窗口，都应关闭
    await appManager.close(appId)

    if (!userConfirm) return `用户拒绝了对 ${pathLib.basename(resolvedPath)} 的写入。`

    // 5. Final Write (The tool handles the IO)
    try {
      await fs.mkdir(pathLib.dirname(resolvedPath), { recursive: true })
      await fs.writeFile(resolvedPath, content, "utf-8")
      return `成功写入文件: ${resolvedPath}`
    } catch (e) {
      return `写入失败: ${e.message}`
    }
  },

  joi() {
    return Joi.object({
      filePath: Joi.string().required().description("文件路径（支持相对当前工作目录的路径）"),
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
