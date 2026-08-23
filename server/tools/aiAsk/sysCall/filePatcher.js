import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import comData from "../../../comData/comData.js"
import { v4 as uuidV4 } from "uuid"
import { trs } from "../../i18n.js"
import workDirTool from "../../workDirTool.js"
import fileState from "../../fileState.js"
import stringUtils from "../../stringUtils.js"

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

function applyEditsToContent(originalContent, edits) {
  let content = originalContent
  let isCRLF = content.includes("\r\n")

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]

    let actualTarget = stringUtils.normalizeQuotes(edit.target)
    let finalTarget = edit.target
    if (content.includes(actualTarget) && !content.includes(edit.target)) {
      finalTarget = actualTarget
    }

    if (!content.includes(finalTarget)) {
      throw new Error(`第 ${i + 1} 个 edit 块未能在文件中找到对应的目标原文(target)。如果你使用了错误的行号请去掉它，或者请提供更长的上下文以确保匹配。\n目标内容片段：\n${edit.target.substring(0, 100)}...`)
    }

    const matchCount = content.split(finalTarget).length - 1
    if (matchCount > 1 && (!edit.startLine || !edit.endLine)) {
      throw new Error(`第 ${i + 1} 个 edit 块的目标原文在文件中出现了 ${matchCount} 次。请提供更长的上下文以确保唯一匹配，或者提供 startLine/endLine 缩小查找范围。`)
    }

    const finalReplace = stringUtils.preserveQuoteStyle(edit.target, finalTarget, edit.replace)

    if (matchCount > 1 && edit.startLine && edit.endLine) {
      let currentLines = content.split(/\r?\n/)
      let startIdx = Math.max(0, edit.startLine - 1)
      let endIdx = Math.min(currentLines.length, edit.endLine)

      let before = currentLines.slice(0, startIdx).join(isCRLF ? "\r\n" : "\n")
      let targetRegion = currentLines.slice(startIdx, endIdx).join(isCRLF ? "\r\n" : "\n")
      let after = currentLines.slice(endIdx).join(isCRLF ? "\r\n" : "\n")

      if (before !== "") before += (isCRLF ? "\r\n" : "\n")
      if (after !== "") after = (isCRLF ? "\r\n" : "\n") + after

      if (!targetRegion.includes(finalTarget)) {
        throw new Error(`第 ${i + 1} 个 edit 块的目标原文未能在给定的行号范围 (${edit.startLine}-${edit.endLine}) 内找到。`)
      }

      targetRegion = targetRegion.replace(finalTarget, finalReplace)
      content = before + targetRegion + after
    } else {
      content = content.replace(finalTarget, finalReplace)
    }
  }

  return content
}

export default {
  name: "文件增删改工具",
  id: "filePatcher",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return { ok: false, msg: error.details[0].message }
    }

    const { operations, reason } = value
    const mainDir = workDirTool.getMainWorkDir(metaData.listId)

    if (!operations || operations.length === 0) {
      return { ok: false, msg: "未提供任何 operations 操作。" }
    }

    const preparedChanges = []

    // 解析并验证每个 Operation
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]
      const isAbs = pathLib.isAbsolute(op.path)

      if (!isAbs && !mainDir) {
        return {
          ok: false,
          msg: `当前会话未设置工作目录，补丁中的相对路径 "${op.path}" 无法解析。请先配置工作目录，或者使用绝对路径。`
        }
      }

      const resolvedPath = isAbs ? op.path : pathLib.resolve(mainDir, op.path)

      const workDirs = workDirTool.getWorkDirs(metaData.listId)
      const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
      if (mainDir && !isInProject) {
        const userConfirm = await waitConfirm({
          type: "tip",
          content: `路径：${resolvedPath}`,
          title: "是否允许在工作目录外执行 filePatcher 工具？",
          listId: metaData.listId,
          ext: {
            identifier: `tool:${this.id}`,
            toolId: this.id
          }
        })
        if (!userConfirm.ok) {
          return { ok: false, msg: `用户拒绝访问项目外文件：${resolvedPath}。` }
        }
      }

      if (op.type === ActionType.ADD) {
        preparedChanges.push({
          type: ActionType.ADD,
          path: resolvedPath,
          relativePath: op.path,
          originalContent: "",
          proposedContent: op.content || ""
        })
      } else if (op.type === ActionType.DELETE) {
        let originalContent = ""
        try {
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (e) { }
        preparedChanges.push({
          type: ActionType.DELETE,
          path: resolvedPath,
          relativePath: op.path,
          originalContent,
          proposedContent: ""
        })
      } else if (op.type === ActionType.UPDATE) {
        if (!op.edits || op.edits.length === 0) {
          return { ok: false, msg: `在更新 ${op.path} 时，未提供任何 edits。` }
        }

        let originalContent = ""
        let readTimestamp = 0
        try {
          const stat = await fs.stat(resolvedPath)
          readTimestamp = stat.mtimeMs
          const cached = fileState.get(resolvedPath)
          if (cached && stat.mtimeMs > cached.timestamp) {
            return {
              ok: false,
              msg: `⚠️ 安全拦截：文件 ${op.path} 自上次读取以来已被外部修改过。\n为防止覆盖最新改动，请先使用 fileOpener 重新读取文件！`
            }
          }
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (err) {
          return { ok: false, msg: `读取文件失败 ${op.path}: ${err.message}` }
        }

        try {
          const proposedContent = applyEditsToContent(originalContent, op.edits)
          preparedChanges.push({
            type: ActionType.UPDATE,
            path: resolvedPath,
            relativePath: op.path,
            originalContent,
            proposedContent,
            readTimestamp
          })
        } catch (err) {
          return { ok: false, msg: `应用补丁失败 [${op.path}]: ${err.message}` }
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
          ...(reviewed?.notes && { notes: reviewed.notes })
          // 💡 拒绝场景（无论单文件拒绝还是总框拒绝）一律不回传 diff，避免误导 AI 以为变更已生效
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
      reason: Joi.string().required().description("编辑理由"),
      operations: Joi.array().items(
        Joi.object({
          type: Joi.string().valid("update", "add", "delete").required().description("操作类型"),
          path: Joi.string().required().description("文件绝对路径或相对路径"),
          content: Joi.string().description("新建文件的完整内容(仅add操作使用)"),
          edits: Joi.array().items(
            Joi.object({
              target: Joi.string().required().description("要替换的局部原代码(带适量上下文，保留首尾空格)"),
              replace: Joi.string().required().allow("").description("替换后的新代码片段"),
              startLine: Joi.number().description("起始查找行(可选)，在所选范围替换"),
              endLine: Joi.number().description("结束查找行(可选)，在所选范围替换")
            })
          ).description("替换操作块数组(仅update)")
        })
      ).required().description("文件操作数组")
    })
  },

  getDoc() {
    return `
      JSON版本文件补丁工具,提供增、删、改功能
      基于局部字符串匹配(Search & Replace)的多文件编辑工具。
      支持并发处理多文件的增(add)、删(delete)、改(update)。
      update 时，只需在 target 填入修改点周围少量的原代码片段，引擎将精确定位并替换。
      仅在 target 出现多次时使用 startLine/endLine 限定搜索范围。
    `
  }
}
