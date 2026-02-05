import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import appManager from "../../../apps/appManager.js"
import { v4 as uuidV4 } from "uuid"

export default {
  name: "修改文件内容",
  id: "filePatcher",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { path, target, replace, allowMultiple } = value
    const resolvedPath = pathLib.resolve(path)

    try {
      const content = await fs.readFile(resolvedPath, 'utf8')

      // 检查 target 是否存在
      if (!content.includes(target)) {
        return `错误：在文件中未找到目标字符串 target。请先使用 fileOpener 确认文件内容。`
      }

      // 检查唯一性
      const matchCount = content.split(target).length - 1
      if (matchCount > 1 && !allowMultiple) {
        return `错误：目标字符串 target 在文件中出现了 ${matchCount} 次。请提供更长的上下文以确保唯一匹配，或将 allowMultiple 设为 true。`
      }

      // 执行替换逻辑（在内存中）
      let newContent
      if (allowMultiple) {
        newContent = content.replaceAll(target, replace)
      } else {
        newContent = content.replace(target, replace)
      }

      // 3. Launch Dedicated Editor Window
      const appId = `editor_patcher_${uuidV4().slice(0, 8)}`
      const confirmId = uuidV4()

      const launchRes = await appManager.launch("editor", {
        appId: appId,
        data: {
          filePath: resolvedPath,
          originalContent: content,
          proposedContent: newContent,
          isDiff: true,
          confirmId: confirmId
        }
      })
      if (!launchRes.ok) return `启动编辑器失败: ${launchRes.msg}`

      // 4. Wait for approval
      const userConfirm = await waitConfirm({
        id: confirmId,
        type: "tip",
        title: `核对代码变更: ${pathLib.basename(path)}`,
        content: "请在编辑器中核对代码并批准/拒绝修改",
        listId: argObj.listId || 0
      })

      // 无论批准还是拒绝，只要是通过本工具启动的窗口，都应关闭
      await appManager.close(appId)

      if (!userConfirm) {
        return `用户主动拒绝了对 ${path} 的修改`
      }

      // 5. Final Write (The tool handles the IO)
      await fs.writeFile(resolvedPath, newContent, "utf-8")
      return `修改成功。已应用并保存到 ${path}。`

    } catch (err) {
      return `修改文件失败：${err.message}`
    }
  },
  joi() {
    return Joi.object({
      path: Joi.string().required().description("文件绝对路径"),
      target: Joi.string().required().description("【精准匹配】需要被替换的源代码片段，必须与文件中完全一致（包括空格和缩进）。"),
      replace: Joi.string().required().description("替换后的新代码片段"),
      allowMultiple: Joi.boolean().default(false).description("是否允许替换所有匹配项。默认为false，只替换第一个匹配项且若有多个匹配会报错。")
    })
  },
  getDoc() {
    return `
      通过字符串替换的方式修改文件。
      适用于小范围修改。必须提供文件中的原文片段(target)和修改后的新片段(replace)。
      注意：target 必须足够独特以确保唯一匹配，或者显式设置 allowMultiple: true。
    `
  }
}
