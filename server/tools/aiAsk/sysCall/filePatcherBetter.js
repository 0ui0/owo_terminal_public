import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import comData from "../../../comData/comData.js"
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

function computeLineDiffStats(orig, prop) {
  const origLines = orig ? orig.split(/\r?\n/) : []
  const propLines = prop ? prop.split(/\r?\n/) : []
  if (origLines.length === 0) return { addLines: propLines.length, delLines: 0 }
  if (propLines.length === 0) return { addLines: 0, delLines: origLines.length }

  const origSet = new Set(origLines)
  const propSet = new Set(propLines)
  let add = 0, del = 0
  for (let l of propLines) {
    if (!origSet.has(l)) add++
  }
  for (let l of origLines) {
    if (!propSet.has(l)) del++
  }
  if (add === 0 && del === 0 && orig !== prop) {
    add = 1
    del = 1
  }
  return { addLines: add, delLines: del }
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

function extractCommentInfo(rawComment) {
  if (!rawComment) return { diff: null, notes: null, comment: null }
  let diff = null
  let notes = null
  let remaining = rawComment

  const diffMatch = remaining.match(/批准修改的 Diff 变动详情如下：\s*```diff\s*([\s\S]*?)```/)
  if (diffMatch) {
    diff = diffMatch[1].trim()
    remaining = remaining.replace(diffMatch[0], "").trim()
  }

  const notesMatch = remaining.match(/具体行批注反馈如下：\s*([\s\S]*?)(?=(?:$|\n\n))/)
  if (notesMatch) {
    notes = notesMatch[1].trim()
    remaining = remaining.replace(notesMatch[0], "").trim()
  }

  return {
    diff: diff || null,
    notes: notes || null,
    comment: remaining || null
  }
}

// ==========================================
// filePatcherBetter 工具主体定义
// ==========================================

export default {
  name: "文件增删改工具增强版",
  id: "filePatcherBetter",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return { ok: false, msg: error.details[0].message }
    }

    const { patch, reason } = value
    const mainDir = workDirTool.getMainWorkDir(metaData.listId)

    // 1. 解析 Codex Patch 文本流
    const actions = parsePatch(patch)
    if (!actions || actions.length === 0) {
      return { ok: false, msg: "未能从输入中解析出任何有效的 Patch 指令。请确保格式符合 Codex Patch 规范（*** Begin Patch ... *** End Patch）。" }
    }

    // 2. 内存预备与路径解析 / 越界检查
    const preparedChanges = []
    for (const act of actions) {
      if (!act.path) {
        return { ok: false, msg: "补丁中存在未指定文件路径的操作。" }
      }

      const isAbs = pathLib.isAbsolute(act.path)
      if (!isAbs && !mainDir) {
        return { ok: false, msg: `当前会话未设置工作目录，补丁中的相对路径 "${act.path}" 无法解析。请先配置工作目录，或者在补丁中使用绝对路径。` }
      }

      const resolvedPath = isAbs ? act.path : pathLib.resolve(mainDir, act.path)
      const workDirs = workDirTool.getWorkDirs(metaData.listId)
      const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
      if (mainDir && !isInProject) {
        return { ok: false, msg: `文件路径 "${resolvedPath}" 超出了允许的工作目录范围。` }
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
        let readTimestamp = 0
        try {
          const stat = await fs.stat(resolvedPath)
          readTimestamp = stat.mtimeMs
          const cached = fileState.get(resolvedPath)
          if (cached && stat.mtimeMs > cached.timestamp) {
            return { ok: false, msg: `⚠️ 安全拦截：文件 ${act.path} 自上次读取以来已被外部修改过。\n为防止覆盖最新改动，请先使用 fileOpener 重新读取文件！` }
          }
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (err) {
          return { ok: false, msg: `读取文件失败 ${act.path}: ${err.message}` }
        }

        try {
          const proposedContent = applyHunksToContent(originalContent, act.hunks)
          preparedChanges.push({
            type: ActionType.UPDATE,
            path: resolvedPath,
            relativePath: act.path,
            originalContent,
            proposedContent,
            readTimestamp
          })
        } catch (err) {
          return { ok: false, msg: `应用补丁失败 [${act.path}]: ${err.message}` }
        }
      }
    }

    // 1. 为每个变更计算行变动统计并赋予唯一标识
    for (let idx = 0; idx < preparedChanges.length; idx++) {
      const change = preparedChanges[idx]
      const stats = computeLineDiffStats(change.originalContent, change.proposedContent)
      change.addLines = stats.addLines
      change.delLines = stats.delLines
      change.fileId = `file_${idx}_${uuidV4().slice(0, 8)}`
      change.status = "pending"
    }

    // 2. 仅在确定用户设置了白名单且普通 waitConfirm 会被跳过时，前置触发不会走白名单的高危删除拦截
    if (comData.data.get()?.chatLists?.find(l => l.id === metaData.listId)?.skipConfirmTools?.includes(this.id)) {
      for (const delChange of preparedChanges.filter(c => c.type === ActionType.DELETE)) {
        const { ok, comment } = await waitConfirm({
          type: "tip",
          title: `⚠️ 高危操作拦截：删除文件确认: ${pathLib.basename(delChange.path)}`,
          content: `${reason}\n\n检测到当前已开启免确认，但即将【永久删除】文件：${delChange.relativePath}。\n删除为高危操作，请再次核验并批准。`,
          listId: metaData.listId,
          ext: { identifier: "danger:fileDelete" }
        })
        if (!ok) {
          delChange.status = "rejected"
          delChange.rejectReason = comment || "用户拒绝删除文件"
        }
      }
    }

    const pendingReviewChanges = preparedChanges.filter(c => c.status !== "rejected")
    const confirmId = uuidV4()

    let userConfirm = { ok: true, comment: "" }
    if (pendingReviewChanges.length > 0) {
      userConfirm = await waitConfirm({
        id: confirmId,
        type: "tip",
        title: `核对代码变更 (${preparedChanges.length} 个文件)`,
        content: reason,
        listId: metaData.listId,
        ext: {
          identifier: "app:editor",
          toolId: this.id,
          reason: reason,
          confirmId: confirmId,
          files: preparedChanges.map(c => ({
            fileId: c.fileId,
            path: c.path,
            relativePath: c.relativePath,
            type: c.type,
            addLines: c.addLines,
            delLines: c.delLines,
            originalContent: c.originalContent,
            proposedContent: c.proposedContent,
            status: c.status || "pending",
            diff: null,
            notes: null,
            comment: ""
          }))
        }
      })
    }

    // 3. 聚合决议并逐个落盘
    const fileResults = []
    const reviewedFiles = userConfirm.ext?.files || []

    for (let idx = 0; idx < preparedChanges.length; idx++) {
      const change = preparedChanges[idx]
      const reviewed = reviewedFiles.find(f => f.fileId === change.fileId || f.path === change.path)
      
      // 如果全局被拒绝，或者该文件被标记为 rejected / pending
      if (!(userConfirm.ok && reviewed?.status === "approved")) {
        fileResults.push({
          path: change.relativePath,
          status: "rejected",
          reason: change.rejectReason || "用户拒绝操作",
          ...(reviewed?.comment && { comment: reviewed.comment }),
          ...(reviewed?.notes && { notes: reviewed.notes }),
          ...(reviewed?.diff && { diff: reviewed.diff })
        })
        continue
      }

      // 用户批准当前文件：物理落盘并执行乐观锁校验
      try {
        if (change.type === ActionType.DELETE) {
          await fs.unlink(change.path)
          fileState.set(change.path, { timestamp: 0, content: "", startLine: 0, endLine: 0 })
          fileResults.push({
            path: change.relativePath,
            status: "applied",
            action: "deleted"
          })
        } else {
          if (change.type === ActionType.UPDATE) {
            try {
              const currentStat = await fs.stat(change.path)
              if (currentStat.mtimeMs > change.readTimestamp) {
                fileResults.push({
                  path: change.relativePath,
                  status: "failed",
                  error: `⚠️ 写入中断：在等待审批期间，该文件已被其它并发请求覆盖或被外部程序修改。为防止代码被抹除，本次写入已被强制拒绝！请要求 AI 重新读取最新代码后再重试。`
                })
                continue
              }
            } catch (err) {
              // 忽略 stat 错误
            }
          }

          await fs.mkdir(pathLib.dirname(change.path), { recursive: true })
          await fs.writeFile(change.path, change.proposedContent, "utf-8")
          const newStat = await fs.stat(change.path).catch(() => ({ mtimeMs: Date.now() }))
          fileState.set(change.path, {
            timestamp: newStat.mtimeMs || Date.now(),
            content: change.proposedContent,
            startLine: 0,
            endLine: 0
          })

          fileResults.push({
            path: change.relativePath,
            status: "applied",
            action: change.type,
            ...(reviewed?.diff && { diff: reviewed.diff }),
            ...(reviewed?.notes && { notes: reviewed.notes }),
            ...(reviewed?.comment && { comment: reviewed.comment })
          })
        }
      } catch (err) {
        fileResults.push({
          path: change.relativePath,
          status: "failed",
          error: `写入失败: ${err.message}`
        })
      }
    }

    const allDiffs = fileResults.map(f => f.diff).filter(Boolean).join("\n\n")
    const anyFailed = fileResults.some(f => f.status === "failed")
    const anyRejected = fileResults.some(f => f.status === "rejected")

    let msg = "补丁执行完成"
    if (anyFailed) msg = "部分文件操作失败"
    else if (anyRejected) msg = "部分文件被用户拒绝"

    return {
      ok: !anyFailed && !anyRejected,
      msg,
      diff: allDiffs || null,
      globalComment: userConfirm.comment || null,
      files: fileResults
    }
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
      git diff版本文件补丁工具，提供增、删、改功能
      可批处理多文件
      内存三级自适应容错（精准匹配 + 宽松缩进匹配）
      单文件自动拉起 Monaco Diff 审查，多文件列表批量审核
    `
  }
}
