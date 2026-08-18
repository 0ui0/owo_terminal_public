import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import appManager from "../../../apps/appManager.js"
import { v4 as uuidV4 } from "uuid"
import workDirTool from "../../workDirTool.js"
import { trs } from "../../i18n.js"
import fileState from "../../fileState.js"

// ==========================================
// VS Code Codex Patch 状态机与解析引擎
// ==========================================

const ActionType = {
  ADD: "add",
  DELETE: "delete",
  UPDATE: "update"
}

/**
 * 解析 Codex Patch 纯文本流
 * @param {string} patchText 
 */
function parsePatch(patchText) {
  const lines = patchText.split(/\r?\n/)
  let i = 0

  // 1. 定位 *** Begin Patch (若无则从头开始)
  while (i < lines.length && !lines[i].trim().startsWith("*** Begin Patch")) {
    i++
  }
  if (i < lines.length && lines[i].trim().startsWith("*** Begin Patch")) {
    i++
  }

  const actions = []
  let currentAction = null

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith("*** End Patch")) {
      break
    }

    if (trimmed.startsWith("*** Update File:")) {
      const filePath = trimmed.replace("*** Update File:", "").trim()
      currentAction = { type: ActionType.UPDATE, path: filePath, hunks: [] }
      actions.push(currentAction)
      i++
      continue
    }

    if (trimmed.startsWith("*** Add File:")) {
      const filePath = trimmed.replace("*** Add File:", "").trim()
      currentAction = { type: ActionType.ADD, path: filePath, contentLines: [] }
      actions.push(currentAction)
      i++
      continue
    }

    if (trimmed.startsWith("*** Delete File:")) {
      const filePath = trimmed.replace("*** Delete File:", "").trim()
      currentAction = { type: ActionType.DELETE, path: filePath }
      actions.push(currentAction)
      i++
      continue
    }

    if (!currentAction) {
      i++
      continue
    }

    if (currentAction.type === ActionType.ADD) {
      // 提取新增文件的行 (+ 开头或普通行)
      if (line.startsWith("+")) {
        currentAction.contentLines.push(line.slice(1))
      } else {
        currentAction.contentLines.push(line)
      }
      i++
      continue
    }

    if (currentAction.type === ActionType.UPDATE) {
      if (trimmed.startsWith("@@")) {
        const hunk = { delLines: [], insLines: [], contextLines: [] }
        currentAction.hunks.push(hunk)
        i++
        while (i < lines.length) {
          const hLine = lines[i]
          const hTrimmed = hLine.trim()
          if (hTrimmed.startsWith("@@") || hTrimmed.startsWith("***")) {
            break
          }
          if (hLine.startsWith("-")) {
            hunk.delLines.push(hLine.slice(1))
          } else if (hLine.startsWith("+")) {
            hunk.insLines.push(hLine.slice(1))
          } else {
            // 上下文行 (空格开头或普通行)
            const ctx = hLine.startsWith(" ") ? hLine.slice(1) : hLine
            hunk.delLines.push(ctx)
            hunk.insLines.push(ctx)
          }
          i++
        }
        continue
      }
    }

    i++
  }

  return actions
}

/**
 * 宽松缩进与模糊自适应 Hunk 应用算法
 * @param {string} originalContent 
 * @param {Array} hunks 
 */
function applyHunksToContent(originalContent, hunks) {
  const eol = originalContent.includes("\r\n") ? "\r\n" : "\n"
  let docLines = originalContent.split(eol)

  for (let hIdx = 0; hIdx < hunks.length; hIdx++) {
    const hunk = hunks[hIdx]
    const delLines = hunk.delLines
    const insLines = hunk.insLines

    if (delLines.length === 0 && insLines.length === 0) continue

    // 策略 1: 逐行精确匹配
    let matchIdx = -1
    for (let i = 0; i <= docLines.length - delLines.length; i++) {
      let matched = true
      for (let j = 0; j < delLines.length; j++) {
        if (docLines[i + j] !== delLines[j]) {
          matched = false
          break
        }
      }
      if (matched) {
        matchIdx = i
        break
      }
    }

    // 策略 2: 宽松空白与缩进匹配 (Whitespace Flexible)
    if (matchIdx === -1) {
      const trimmedDoc = docLines.map(l => l.trim())
      const trimmedDel = delLines.map(l => l.trim())

      for (let i = 0; i <= trimmedDoc.length - trimmedDel.length; i++) {
        let matched = true
        for (let j = 0; j < trimmedDel.length; j++) {
          if (trimmedDoc[i + j] !== trimmedDel[j]) {
            matched = false
            break
          }
        }
        if (matched) {
          matchIdx = i
          break
        }
      }
    }

    if (matchIdx === -1) {
      throw new Error(`第 ${hIdx + 1} 个 @@ Hunk 匹配失败。未能找到对应的原代码片段：\n${delLines.join("\n")}`)
    }

    // 执行内存替换
    const before = docLines.slice(0, matchIdx)
    const after = docLines.slice(matchIdx + delLines.length)
    docLines = [...before, ...insLines, ...after]
  }

  return docLines.join(eol)
}

// ==========================================
// filePatcherBetter 工具主体定义
// ==========================================

export default {
  name: "文件补丁工具增强版",
  id: "filePatcherBetter",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { patch, reason } = value
    const mainDir = workDirTool.getMainWorkDir(metaData.listId)

    // 1. 解析 Codex Patch 文本流
    const actions = parsePatch(patch)
    if (!actions || actions.length === 0) {
      return "错误：未能从输入中解析出任何有效的 Patch 指令。请确保格式符合 Codex Patch 规范（*** Begin Patch ... *** End Patch）。"
    }

    // 2. 内存预备与路径解析 / 越界检查
    const preparedChanges = []
    for (const act of actions) {
      if (!act.path) {
        return "错误：补丁中存在未指定文件路径的操作。"
      }

      const isAbs = pathLib.isAbsolute(act.path)
      if (!isAbs && !mainDir) {
        return `错误：当前会话未设置工作目录，补丁中的相对路径 "${act.path}" 无法解析。请先配置工作目录，或者在补丁中使用绝对路径。`
      }

      const resolvedPath = isAbs ? act.path : pathLib.resolve(mainDir, act.path)
      if (mainDir && !workDirTool.isInProject(resolvedPath, metaData.listId)) {
        return `错误：文件路径 "${resolvedPath}" 超出了允许的工作目录范围。`
      }

      if (act.type === ActionType.ADD) {
        preparedChanges.push({
          type: ActionType.ADD,
          path: resolvedPath,
          relativePath: act.path,
          originalContent: "",
          proposedContent: act.contentLines.join("\n")
        })
      } else if (act.type === ActionType.DELETE) {
        let originalContent = ""
        try {
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (e) { }
        preparedChanges.push({
          type: ActionType.DELETE,
          path: resolvedPath,
          relativePath: act.path,
          originalContent,
          proposedContent: ""
        })
      } else if (act.type === ActionType.UPDATE) {
        let originalContent = ""
        try {
          const stat = await fs.stat(resolvedPath)
          const cached = fileState.get(resolvedPath)
          if (cached && stat.mtimeMs > cached.timestamp) {
            return `⚠️ 安全拦截：文件 ${act.path} 自上次读取以来已被外部修改过。\n为防止覆盖最新改动，请先使用 fileOpener 重新读取文件！`
          }
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (err) {
          return `读取文件失败 ${act.path}: ${err.message}`
        }

        try {
          const proposedContent = applyHunksToContent(originalContent, act.hunks)
          preparedChanges.push({
            type: ActionType.UPDATE,
            path: resolvedPath,
            relativePath: act.path,
            originalContent,
            proposedContent
          })
        } catch (err) {
          return `应用补丁失败 [${act.path}]: ${err.message}`
        }
      }
    }

    // 3. 逐个文件依次弹出独立 Diff 窗口供用户逐项严谨审查与独立落盘 (100% 保持代码审查习惯)
    const results = []

    for (let idx = 0; idx < preparedChanges.length; idx++) {
      const change = preparedChanges[idx]
      const fileProgress = preparedChanges.length > 1 ? ` [${idx + 1}/${preparedChanges.length}]` : ""
      const appId = `editor_patcher_${uuidV4().slice(0, 8)}`
      const confirmId = uuidV4()

      let title = ""
      let promptText = ""
      let appId = null

      if (change.type === ActionType.DELETE) {
        // 删除文件：无需 Diff 对比，直接采用普通标准弹窗询问
        title = `删除文件确认${fileProgress}: ${pathLib.basename(change.path)}`
        promptText = `${reason}\n\n即将删除文件: ${change.relativePath}，请确认是否允许删除。`
      } else {
        // 新增或修改文件：启动独立 Monaco Diff 编辑器窗口供肉眼核对代码
        appId = `editor_patcher_${uuidV4().slice(0, 8)}`
        if (change.type === ActionType.ADD) {
          title = `新建文件确认${fileProgress}: ${pathLib.basename(change.path)}`
          promptText = `${reason}\n\n即将新建文件: ${change.relativePath}，请在编辑器中核对预览内容并批准。`
        } else {
          title = `核对代码变更${fileProgress}: ${pathLib.basename(change.path)}`
          promptText = `${reason}\n\n` + trs("工具/提示/请在编辑器中核核对代码", {
            cn: "请在编辑器中核对代码并批准/拒绝修改",
            en: "Please review the code in the editor and approve/reject changes"
          })
        }

        const launchRes = await appManager.launch("editor", {
          appId: appId,
          data: {
            filePath: change.path,
            originalContent: change.originalContent,
            proposedContent: change.proposedContent,
            isDiff: true,
            confirmId: confirmId,
            reason: reason
          }
        })
        if (!launchRes.ok) {
          results.push(`启动编辑器失败 [${change.relativePath}]: ${launchRes.msg}`)
          continue
        }
      }

      // 等待用户对当前文件独立核对与决策
      const userConfirm = await waitConfirm({
        id: confirmId,
        type: "tip",
        title: title,
        content: promptText,
        listId: metaData.listId
      })

      // 如果启动了临时 Diff 窗口，无论批准与否均关闭
      if (appId) {
        await appManager.close(appId)
      }

      if (!userConfirm.ok) {
        results.push(`• [拒绝] ${change.relativePath}: 用户拒绝了该文件的操作 (原因: ${userConfirm.comment || "未提供"})`)
        continue
      }

      // 用户批准当前文件：物理落盘并闭环刷新该文件状态锁
      try {
        if (change.type === ActionType.DELETE) {
          await fs.unlink(change.path)
          fileState.set(change.path, { timestamp: 0, content: "", startLine: 0, endLine: 0 })
          results.push(`• [已删除] ${change.relativePath}`)
        } else {
          await fs.mkdir(pathLib.dirname(change.path), { recursive: true })
          await fs.writeFile(change.path, change.proposedContent, "utf-8")
          const newStat = await fs.stat(change.path).catch(() => ({ mtimeMs: Date.now() }))
          fileState.set(change.path, {
            timestamp: newStat.mtimeMs || Date.now(),
            content: change.proposedContent,
            startLine: 0,
            endLine: 0
          })

          let fileMsg = `• [已应用] ${change.relativePath}`
          if (userConfirm.comment) {
            if (userConfirm.comment.includes("批准修改的 Diff") || userConfirm.comment.includes("具体行批注")) {
              fileMsg += `\n\n${userConfirm.comment}`
            } else {
              fileMsg += ` (用户备注: ${userConfirm.comment})`
            }
          }
          results.push(fileMsg)
        }
      } catch (err) {
        results.push(`• [写入失败] ${change.relativePath}: ${err.message}`)
      }
    }

    return `补丁执行完成：\n\n${results.join("\n\n")}`
  },

  joi() {
    return Joi.object({
      reason: Joi.string().required().description("编辑理由，格式为：我将编辑___来为了___（写理由）"),
      patch: Joi.string().required().description(`遵循 Codex/Git Diff 规范的纯文本补丁流。
格式示例：
*** Begin Patch
*** Update File: src/config.js
@@ -10,3 +10,3 @@
 const old = 1;
-const port = 8080;
+const port = 3000;

*** Add File: src/helper.js
+export const add = (a, b) => a + b;

*** Delete File: src/obsolete.js
*** End Patch`)
    })
  },

  getDoc() {
    return `
      原汁原味的 VS Code Codex Patch 补丁引擎 (filePatcherBetter)。
      接收标准的 Git Diff 纯文本补丁流，单次调用即可同时处理多个文件的更新、新增与删除：
      1. 纯文本流协议，极致节省 Token；
      2. 内存三级自适应容错（精准匹配 + 宽松缩进匹配）；
      3. 单文件自动拉起 Monaco Diff 审查，多文件列表批量审核；
      4. 严格落盘控制与 fileState 状态锁原子同步。
    `
  }
}
