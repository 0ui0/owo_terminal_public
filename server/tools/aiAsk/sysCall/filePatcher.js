import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import appManager from "../../../apps/appManager.js"
import { v4 as uuidV4 } from "uuid"
import { trs } from "../../i18n.js"

export default {
  name: "修改文件内容",
  id: "filePatcher",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { path, target, replace, allowMultiple, startLine, endLine } = value
    const resolvedPath = pathLib.resolve(path)

    try {
      const content = await fs.readFile(resolvedPath, 'utf8')
      let newContent

      if (startLine && endLine) {
        let isCRLF = content.includes('\r\n')
        const lines = content.split(/\r?\n/)
        if (startLine < 1 || startLine > lines.length || endLine < startLine || endLine > lines.length) {
          return `错误：行号范围不合法。文件共 ${lines.length} 行，请求替换 ${startLine} - ${endLine}。`
        }

        const before = lines.slice(0, startLine - 1)
        const after = lines.slice(endLine)

        let normalizedReplace = replace
        if (normalizedReplace.endsWith('\r\n')) {
          normalizedReplace = normalizedReplace.slice(0, -2)
        } else if (normalizedReplace.endsWith('\n')) {
          normalizedReplace = normalizedReplace.slice(0, -1)
        }

        let joinArray = [...before]
        if (normalizedReplace !== "") {
          joinArray.push(normalizedReplace)
        }
        joinArray.push(...after)

        const delimiter = isCRLF ? '\r\n' : '\n'
        newContent = joinArray.join(delimiter)
      } else {
        // 检查 target 是否存在
        if (!content.includes(target)) {
          return `错误：未找到目标字符串${target}。请先使用 fileOpener 确认文件内容。若修改范围大，强烈建议改用 startLine 和 endLine。`
        }

        // 检查唯一性
        const matchCount = content.split(target).length - 1
        if (matchCount > 1 && !allowMultiple) {
          return `错误：目标字符串${target}在文件中出现了 ${matchCount} 次。请提供更长的上下文以确保唯一匹配，或将 allowMultiple 设为 true。`
        }

        // 执行替换逻辑（在内存中）
        if (allowMultiple) {
          newContent = content.replaceAll(target, replace)
        } else {
          newContent = content.replace(target, replace)
        }
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
        content: trs("工具/提示/请在编辑器中核核对代码", { cn: "请在编辑器中核对代码并批准/拒绝修改", en: "Please review the code in the editor and approve/reject changes" }),
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
      target: Joi.string().description("【精准匹配】需要被替换的源代码片段。如果不提供 startLine/endLine，则必须提供此参数。"),
      startLine: Joi.number().description("需要替换的起始行号(包含)。如果要进行大段代码编辑或遭遇文件物理截断，强烈建议使用基于行号范围的替换机制而非target文本匹配。"),
      endLine: Joi.number().description("需要替换的结束行号(包含)。如果提供，将配合 startLine 替换整段行。"),
      replace: Joi.string().required().allow('').description("替换后的新代码片段。如果使用行号范围替换，此内容将直接覆盖指定范围的行（传空字符串则代表删除整段行）。"),
      allowMultiple: Joi.boolean().default(false).description("是否允许替换所有匹配项。默认为false，只替换第一个匹配项且若有多个匹配会报错。仅针对target模式。")
    }).or('target', 'startLine').with('startLine', 'endLine')
  },
  getDoc() {
    return `
      修改文件内容。支持两种模式：
      1. 行号范围替换（推荐大段修改或文件被物理截断时使用）：传入 startLine 和 endLine，配合 replace 覆盖整段内容（此模式不进行内容强校验，容错率最高）。
      2. 字符串精确替换（适用于单行或极小片段）：传入 target 和 replace。必须确保 target 在文件中精确且唯一。
    `
  }
}
