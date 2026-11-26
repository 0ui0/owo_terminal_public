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

// 统计 target 在 text 中出现的次数（不重叠计数）
function countOccurrences(text, target) {
  if (!target) return 0
  let count = 0
  let idx = 0
  while (true) {
    idx = text.indexOf(target, idx)
    if (idx === -1) break
    count++
    idx += target.length
  }
  return count
}

// 计算文本行起始字符偏移表：offsets[k-1] = 第 k 行(1-based)首字符下标
function computeLineStartOffsets(text) {
  const offsets = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1)
  }
  return offsets
}

function getLineNumFromOffsets(offsets, charIdx) {
  let low = 0
  let high = offsets.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (offsets[mid] <= charIdx) {
      if (mid === offsets.length - 1 || offsets[mid + 1] > charIdx) {
        return mid + 1
      }
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return 1
}

// 当 target 匹配失败时，进行行级深度诊断，定位首个断点行与空格差异
function diagnoseTargetMismatch(windowText, target, startLineNum = 1) {
  const targetLines = target.split("\n")
  const fileLines = windowText.split("\n")

  const firstNonEmptyTargetIdx = targetLines.findIndex(l => l.trim().length > 0)
  if (firstNonEmptyTargetIdx === -1) return ""

  const anchorTrimmed = targetLines[firstNonEmptyTargetIdx].trim()
  let maxMatchedLines = 0
  let mismatchDetail = null

  for (let fIdx = 0; fIdx < fileLines.length; fIdx++) {
    if (fileLines[fIdx].trim() === anchorTrimmed) {
      let matchedCount = 0
      let currentMismatch = null
      const checkLimit = Math.min(targetLines.length - firstNonEmptyTargetIdx, fileLines.length - fIdx)

      for (let k = 0; k < checkLimit; k++) {
        const tLine = targetLines[firstNonEmptyTargetIdx + k]
        const fLine = fileLines[fIdx + k]
        if (tLine === fLine) {
          matchedCount++
        } else {
          const isTrimSame = fLine.trim() === tLine.trim()
          const isWhitespaceOnlyDiff = fLine.replace(/\s+/g, "") === tLine.replace(/\s+/g, "")
          currentMismatch = {
            lineNum: startLineNum + fIdx + k,
            fileLine: fLine,
            targetLine: tLine,
            hasWhitespaceDiffOnly: isTrimSame || isWhitespaceOnlyDiff
          }
          break
        }
      }

      if (matchedCount > maxMatchedLines || !mismatchDetail) {
        maxMatchedLines = matchedCount
        mismatchDetail = currentMismatch
      }
    }
  }

  if (mismatchDetail) {
    const whitespaceHint = mismatchDetail.hasWhitespaceDiffOnly
      ? "\n  【提示】: 忽略空白后字符完全一致，但存在缩进、行尾或内部空格数量差异！"
      : ""
    return `\n【精准断点诊断】：\n前面已连续匹配 ${maxMatchedLines} 行。从文件第 ${mismatchDetail.lineNum} 行开始出现差异：\n  - 文件原文: [${mismatchDetail.fileLine}] (长度: ${mismatchDetail.fileLine.length})\n  - 你的输入: [${mismatchDetail.targetLine}] (长度: ${mismatchDetail.targetLine.length})${whitespaceHint}`
  }

  return ""
}

function applyEditsToContent(originalContent, edits) {
  const eol = originalContent.includes("\r\n") ? "\r\n" : "\n"
  let content = originalContent.replace(/\r\n/g, "\n")

  const lineOffsets = computeLineStartOffsets(content)
  const totalLines = lineOffsets.length

  const replacements = []

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]
    const target = (edit.target || "").replace(/\r\n/g, "\n")
    const replace = (edit.replace !== undefined && edit.replace !== null ? String(edit.replace) : "").replace(/\r\n/g, "\n")

    if (!target) continue // 如果没有 target 则跳过

    // 默认搜索范围为整个文件
    let searchFrom = 0
    let searchTo = content.length
    let rangeStart = null
    let rangeEnd = null

    // 【行范围限定】startLine/endLine 为 1-based、含两端。提供后，
    // target 必须完整落在 [startLine, endLine] 行区间内（含行尾换行）才参与匹配。
    if (edit.startLine != null || edit.endLine != null) {
      const startLine = edit.startLine != null ? Math.max(1, Math.floor(edit.startLine)) : 1
      const endLine = edit.endLine != null ? Math.max(startLine, Math.floor(edit.endLine)) : null

      rangeStart = startLine
      rangeEnd = endLine
      searchFrom = lineOffsets[Math.min(startLine - 1, totalLines - 1)] ?? 0
      if (endLine != null) {
        const endIdx = Math.min(endLine, totalLines)
        searchTo = endIdx < totalLines ? (lineOffsets[endIdx] ?? content.length) : content.length
      }
    }

    const windowText = content.slice(searchFrom, searchTo)
    const windowCount = countOccurrences(windowText, target)
    const globalCount = countOccurrences(content, target)

    if (windowCount === 0) {
      const startLineNum = rangeStart != null ? rangeStart : 1
      const diagInfo = diagnoseTargetMismatch(windowText, target, startLineNum)

      if (globalCount === 0) {
        throw new Error(`第 ${i + 1} 个 edit 块未能在文件中找到对应的目标原文(target)。本次修改要求完全一字不差的精准匹配，包括首尾空格！请核对后重试。${diagInfo}\n目标片段前缀：\n${target.substring(0, 50)}...`)
      }
      const rangeDesc = rangeStart != null
        ? `第 ${rangeStart}~${rangeEnd ?? "末尾"} 行`
        : "整个文件"
      throw new Error(`第 ${i + 1} 个 edit 块的目标原文在文件其他位置共出现 ${globalCount} 次，但在限定的行范围(${rangeDesc})内未找到。请检查 startLine/endLine 是否准确，或提供更长的 target 使其完整落在该范围内。${diagInfo}\n目标片段前缀：\n${target.substring(0, 50)}...`)
    }

    if (windowCount > 1) {
      const rangeDesc = rangeStart != null
        ? `（限定行范围：第 ${rangeStart}~${rangeEnd ?? "末尾"} 行）`
        : ""
      throw new Error(`第 ${i + 1} 个 edit 块的目标原文${rangeDesc}内出现了 ${windowCount} 次。由于要求精确且唯一匹配，请提供更长的 target 上下文，或缩小 startLine/endLine 范围以确保唯一性！`)
    }

    const absIdx = searchFrom + windowText.indexOf(target)
    edit.origStartLine = getLineNumFromOffsets(lineOffsets, absIdx)
    edit.origEndLine = getLineNumFromOffsets(lineOffsets, Math.max(absIdx, absIdx + target.length - 1))
    replacements.push({
      originalIndex: i,
      startIdx: absIdx,
      endIdx: absIdx + target.length,
      replace: replace
    })
  }

  // 检查是否存在范围重叠（避免管理员的多个 edit 修改了同一块区域导致冲突）
  replacements.sort((a, b) => b.startIdx - a.startIdx)
  for (let j = 0; j < replacements.length - 1; j++) {
    if (replacements[j].startIdx < replacements[j+1].endIdx) {
      throw new Error(`edit 块发生冲突：第 ${replacements[j].originalIndex + 1} 个 edit 与第 ${replacements[j+1].originalIndex + 1} 个 edit 的修改范围存在重叠！`)
    }
  }

  // 倒序应用替换，这样后面的替换就不会影响前面替换的下标！
  for (const r of replacements) {
    content = content.slice(0, r.startIdx) + r.replace + content.slice(r.endIdx)
  }

  // 精准回算每个 edit 在修改后新文件中的真实行号
  const modLineOffsets = computeLineStartOffsets(content)
  const ascReplacements = [...replacements].sort((a, b) => a.startIdx - b.startIdx)
  let delta = 0
  for (const r of ascReplacements) {
    const newStartIdx = r.startIdx + delta
    edits[r.originalIndex].modifiedStartLine = getLineNumFromOffsets(modLineOffsets, newStartIdx)
    edits[r.originalIndex].modifiedEndLine = getLineNumFromOffsets(modLineOffsets, Math.max(newStartIdx, newStartIdx + r.replace.length - 1))
    delta += (r.replace.length - (r.endIdx - r.startIdx))
  }

  return eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content
}

export default {
  name: "文件增删改工具",
  id: "filePatcher",
  mode: {
    read: false,
    write: true
  },

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return { ok: false, msg: error.details[0].message }
    }

    const { operations } = value
    const mainDir = workDirTool.getMainWorkDir(metaData.listId)

    if (!operations || operations.length === 0) {
      return { ok: false, msg: "未提供任何 operations 操作。" }
    }

    const preparedChanges = []
    const prepareFailedResults = []
    const reasons = []

    const workDirs = workDirTool.getWorkDirs(metaData.listId)

    // 💡 架构设计准则（工作目录外与默认审批的场景分流）：
    // 1. 若当前会话未配置主工作目录（mainDir 为空），系统不存在明确的“项目内外边界”，
    //    因此不触发前置工作目录外询问弹窗，直接交由下游默认的 Monaco Diff 审批卡片统一把关；
    // 2. 与 fileOpener（读工具）的区别：读文件涉及隐私窃取风险且无后续 Diff 审核流，故无工作区时仍需前置防护；
    // 3. 而写文件（filePatcher）在未配置工作目录时，已有严密的代码审查卡片作为坚实防线，
    //    若此时强行弹窗两次（先问目录再审卡片），不仅语义割裂而且极大损耗人机交互效率；
    // 4. 只有当管理员显式配置了工作目录（mainDir 存在）时，才严格区分项目内外，对项目外文件执行“前置目录授权 + 后续 Diff 审查”的双重防御。
    const outOfProjectSet = new Set()
    for (const op of operations) {
      const validKey = Object.keys(op || {}).find(k => ["add", "delete", "update"].includes(k) && op[k])
      if (validKey && op[validKey]?.path) {
        const rawP = op[validKey].path
        const isAbsP = pathLib.isAbsolute(rawP)
        const resolvedP = isAbsP ? rawP : (mainDir ? pathLib.resolve(mainDir, rawP) : null)
        if (resolvedP && mainDir) {
          const inProj = workDirs.some(dir => resolvedP === dir.path || resolvedP.startsWith(dir.path + pathLib.sep))
          if (!inProj) {
            outOfProjectSet.add(resolvedP)
          }
        }
      }
    }

    let outOfProjectConfirm = { ok: true, comment: "" }
    if (outOfProjectSet.size > 0) {
      const outList = Array.from(outOfProjectSet)
      const isSingle = outList.length === 1
      outOfProjectConfirm = await waitConfirm({
        type: "tip",
        title: isSingle ? "是否允许在工作目录外执行 filePatcher 工具？" : `⚠️ 是否允许访问工作目录外的 ${outList.length} 个文件？`,
        content: isSingle ? `路径：${outList[0]}` : `检测到本次操作涉及以下 ${outList.length} 个工作目录外文件：\n${outList.map(p => `• ${p}`).join("\n")}`,
        listId: metaData.listId,
        ext: {
          identifier: `tool:${this.id}`,
          toolId: this.id
        }
      })
    }

    // 解析并验证每个 Operation（非短路容错流水线）
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]
      const validKeys = Object.keys(op || {}).filter(k => ["add", "delete", "update"].includes(k) && op[k])

      if (validKeys.length === 0) {
        preparedChanges.push({
          type: ActionType.UPDATE,
          path: `operation_${i + 1}`,
          relativePath: `operation_${i + 1}`,
          reason: "格式错误",
          originalContent: "",
          proposedContent: "",
          status: "failed",
          error: `第 ${i + 1} 个 operation 格式错误：必须指定 add、delete 或 update 之一。`,
          edits: []
        })
        continue
      }

      if (validKeys.length > 1) {
        preparedChanges.push({
          type: ActionType.UPDATE,
          path: `operation_${i + 1}`,
          relativePath: `operation_${i + 1}`,
          reason: "格式错误",
          originalContent: "",
          proposedContent: "",
          status: "failed",
          error: `第 ${i + 1} 个 operation 格式错误：每个 operation 只能指定一种操作，当前同时传入了: ${validKeys.join(", ")}。请拆分为多个 operation。`,
          edits: []
        })
        continue
      }

      const opType = validKeys[0]
      const opData = op[opType]
      const { path: rawPath, reason: opReason } = opData

      if (opReason) {
        reasons.push(opReason)
      }

      const isAbs = pathLib.isAbsolute(rawPath)
      if (!isAbs && !mainDir) {
        preparedChanges.push({
          type: opType,
          path: rawPath,
          relativePath: rawPath,
          reason: opReason,
          originalContent: "",
          proposedContent: "",
          status: "failed",
          error: `当前会话未设置工作目录，补丁中的相对路径 "${rawPath}" 无法解析。请先配置工作目录，或者使用绝对路径。`,
          edits: opData.edits
        })
        continue
      }

      const resolvedPath = isAbs ? rawPath : pathLib.resolve(mainDir, rawPath)

      const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
      if (mainDir && !isInProject) {
        if (!outOfProjectConfirm.ok) {
          preparedChanges.push({
            type: opType,
            path: resolvedPath,
            relativePath: rawPath,
            reason: opReason,
            originalContent: "",
            proposedContent: "",
            status: "rejected",
            rejectReason: outOfProjectConfirm.comment ? `管理员拒绝访问项目外文件：${resolvedPath}。\n管理员拒绝理由/备注：【注意管理员留言】${outOfProjectConfirm.comment}` : `管理员拒绝访问项目外文件：${resolvedPath}。`,
            ...(outOfProjectConfirm.comment && { comment: `【注意管理员留言】${outOfProjectConfirm.comment}` }),
            edits: opData.edits
          })
          continue
        }
      }

      if (opType === "add") {
        let fileExists = false
        let originalContent = ""
        let readTimestamp = 0
        try {
          const stat = await fs.stat(resolvedPath)
          fileExists = true
          readTimestamp = stat.mtimeMs
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (e) {
          // 文件不存在，属于纯新增
        }

        if (fileExists && !opData.cover) {
          preparedChanges.push({
            type: ActionType.ADD,
            path: resolvedPath,
            relativePath: rawPath,
            reason: opReason,
            originalContent: originalContent,
            proposedContent: opData.content,
            status: "failed",
            error: `⚠️ 安全拦截：文件 ${rawPath} 已存在。若确需全量覆盖已存在的文件，请将 add 中的 cover 参数显式设为 true；若只需局部修改，请使用 update 操作。`,
            edits: []
          })
          continue
        }

        preparedChanges.push({
          type: ActionType.ADD,
          path: resolvedPath,
          relativePath: rawPath,
          reason: opReason,
          originalContent: fileExists ? originalContent : "",
          proposedContent: opData.content || "",
          readTimestamp: fileExists ? readTimestamp : 0,
          isCover: fileExists,
          status: "pending",
          edits: []
        })
      } else if (opType === "delete") {
        let originalContent = ""
        try {
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (e) { }
        preparedChanges.push({
          type: ActionType.DELETE,
          path: resolvedPath,
          relativePath: rawPath,
          reason: opReason,
          originalContent,
          proposedContent: "",
          status: "pending",
          edits: []
        })
      } else if (opType === "update") {
        if (!opData.edits || opData.edits.length === 0) {
          preparedChanges.push({
            type: ActionType.UPDATE,
            path: resolvedPath,
            relativePath: rawPath,
            reason: opReason,
            originalContent: "",
            proposedContent: "",
            status: "failed",
            error: `在更新 ${rawPath} 时，未提供任何 edits。`,
            edits: []
          })
          continue
        }

        let originalContent = ""
        let readTimestamp = 0
        try {
          const stat = await fs.stat(resolvedPath)
          readTimestamp = stat.mtimeMs
          const cached = fileState.get(resolvedPath)
          if (cached && stat.mtimeMs > cached.timestamp) {
            preparedChanges.push({
              type: ActionType.UPDATE,
              path: resolvedPath,
              relativePath: rawPath,
              reason: opReason,
              originalContent: "",
              proposedContent: "",
              status: "failed",
              error: `⚠️ 安全拦截：文件 ${rawPath} 自上次读取以来已被外部修改过。\n为防止覆盖最新改动，请先使用 fileOpener 重新读取文件！`,
              edits: opData.edits
            })
            continue
          }
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (err) {
          preparedChanges.push({
            type: ActionType.UPDATE,
            path: resolvedPath,
            relativePath: rawPath,
            reason: opReason,
            originalContent: "",
            proposedContent: "",
            status: "failed",
            error: `读取文件失败 ${rawPath}: ${err.message}`,
            edits: opData.edits
          })
          continue
        }

        try {
          const proposedContent = applyEditsToContent(originalContent, opData.edits)
          preparedChanges.push({
            type: ActionType.UPDATE,
            path: resolvedPath,
            relativePath: rawPath,
            reason: opReason,
            originalContent,
            proposedContent,
            readTimestamp,
            status: "pending",
            edits: opData.edits
          })
        } catch (err) {
          preparedChanges.push({
            type: ActionType.UPDATE,
            path: resolvedPath,
            relativePath: rawPath,
            reason: opReason,
            originalContent: "",
            proposedContent: "",
            status: "failed",
            error: `应用补丁失败 [${rawPath}]: ${err.message}`,
            edits: opData.edits
          })
          continue
        }
      }
    }

    // 组装编号+缩进树状整体理由
    const overallReasonLines = []
    preparedChanges.forEach((change, idx) => {
      const fileName = pathLib.basename(change.relativePath || change.path)
      const opTitle = change.reason || (change.type === ActionType.ADD ? "新增文件" : (change.type === ActionType.DELETE ? "删除文件" : "修改文件"))
      const invalidSuffix = change.status === "failed" ? ` (已作废: ${change.error})` : ""
      overallReasonLines.push(`${idx + 1}. [${fileName}] ${opTitle}${invalidSuffix}`)
      if (change.edits && change.edits.length > 0) {
        change.edits.forEach((edit, eIdx) => {
          overallReasonLines.push(`   ${idx + 1}.${eIdx + 1} ${edit.reason}`)
        })
      }
    })
    const overallReason = overallReasonLines.join("\n")

    // 1. 为每个变更计算行变动统计并赋予唯一标识
    for (let idx = 0; idx < preparedChanges.length; idx++) {
      const change = preparedChanges[idx]
      const stats = computeLineDiffStats(change.originalContent, change.proposedContent)
      change.addLines = stats.addLines
      change.delLines = stats.delLines
      change.fileId = `file_${idx}_${uuidV4().slice(0, 8)}`
      if (!change.status) {
        change.status = "pending"
      }
    }

    // 💡 权限与沙箱免确认分流判定：
    // 读取删除免确认档位：0=关闭(默认,全系统删除均需确认且一票否决白名单), 1=工作目录, 2=全系统
    const currentList = comData.getChatList(metaData.listId)
    const deleteScope = Number(currentList?.confirmDeleteScope ?? 0)
    const isSkipConfirmTool = Boolean(currentList?.skipConfirmTools?.includes(this.id))
    const autoConfirmWorkspace = Boolean(currentList?.autoConfirmWorkspacePatch)

    const allInWorkspace = Boolean(mainDir) && preparedChanges.every(c => {
      if (c.status === "failed") return true
      const resolvedPath = pathLib.isAbsolute(c.path) ? c.path : pathLib.resolve(mainDir, c.path)
      return workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
    })

    const hasDelete = preparedChanges.some(c => c.type === ActionType.DELETE && c.status !== "failed")
    const hasEdit = preparedChanges.some(c => c.type !== ActionType.DELETE && c.status !== "failed")

    // 2. 高危删除专属拦截（0档拥有一票否决权，无论是否配了白名单均强制弹窗；1档工作区外强制弹窗）：
    const shouldBlockDelete = hasDelete && (
      deleteScope === 0 ||
      (deleteScope === 1 && !allInWorkspace)
    )

    if (shouldBlockDelete) {
      for (const delChange of preparedChanges.filter(c => c.type === ActionType.DELETE && c.status !== "failed")) {
        const { ok, comment } = await waitConfirm({
          type: "tip",
          title: `高危操作拦截：删除文件确认: ${pathLib.basename(delChange.path)}`,
          content: `${delChange.reason || overallReason}\n\n检测到即将【永久删除】文件：${delChange.relativePath}。\n删除为高危操作，请再次核验并批准。`,
          listId: metaData.listId,
          ext: { identifier: "danger:fileDelete" }
        })
        if (!ok) {
          delChange.status = "rejected"
          delChange.rejectReason = comment || "管理员拒绝删除文件"
          if (comment) {
            delChange.comment = `【注意管理员留言】${comment}`
          }
        }
      }
    }

    // 3. 综合沙箱免审条件判定：
    const isDeleteAllowedAuto = !hasDelete || deleteScope === 2 || (deleteScope === 1 && allInWorkspace)
    const isEditAllowedAuto = !hasEdit || isSkipConfirmTool || (autoConfirmWorkspace && allInWorkspace)
    const shouldAutoApproveInWorkspace = isDeleteAllowedAuto && isEditAllowedAuto && (!isSkipConfirmTool || deleteScope === 0)

    const hasPendingReview = preparedChanges.some(c => c.status === "pending")
    const confirmId = uuidV4()

    let userConfirm = { ok: false, comment: "" }
    if (shouldAutoApproveInWorkspace && hasPendingReview) {
      preparedChanges.forEach(c => {
        if (c.status === "pending") {
          c.status = "approved"
        }
      })
      userConfirm = {
        ok: true,
        comment: "",
        ext: {
          files: preparedChanges.map(c => ({
            fileId: c.fileId,
            path: c.path,
            status: c.status
          }))
        }
      }
    } else if (hasPendingReview) {
      userConfirm = await waitConfirm({
        id: confirmId,
        type: "tip",
        title: `核对代码变更 (${preparedChanges.length} 个文件)`,
        content: overallReason,
        listId: metaData.listId,
        ext: {
          identifier: "app:editor",
          toolId: this.id,
          reason: overallReason,
          confirmId: confirmId,
          files: preparedChanges.map(c => ({
            fileId: c.fileId,
            path: c.path,
            relativePath: c.relativePath,
            type: c.type,
            reason: c.reason,
            error: c.error,
            edits: c.edits,
            addLines: c.addLines,
            delLines: c.delLines,
            originalContent: c.originalContent,
            proposedContent: c.proposedContent,
            status: c.status,
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

      // 如果条目已作废失败，或者全局被拒绝，或者该文件被标记为 rejected / pending
      if (change.status === "failed" || !(userConfirm.ok && reviewed?.status === "approved")) {
        const isFailed = change.status === "failed"
        fileResults.push({
          path: change.relativePath,
          status: isFailed ? "failed" : "rejected",
          ...(isFailed ? { error: change.error } : {}),
          reason: isFailed ? change.error : (change.rejectReason || "管理员拒绝操作"),
          ...((reviewed?.comment || change.comment) && { comment: reviewed?.comment ? `【注意管理员留言】${reviewed.comment}` : change.comment }),
          ...(reviewed?.notes && { notes: reviewed.notes })
          // 💡 拒绝场景（无论单文件拒绝还是总框拒绝）一律不回传 diff，避免误导 AI 以为变更已生效
        })
        continue
      }

      // 管理员批准当前文件：物理落盘并执行乐观锁校验
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
          if (change.type === ActionType.UPDATE || change.isCover) {
            try {
              const currentStat = await fs.stat(change.path)
              if (change.readTimestamp && currentStat.mtimeMs > change.readTimestamp) {
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
            ...(reviewed?.comment && { comment: `【注意管理员留言】${reviewed.comment}` })
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

    const allFinalFiles = [...fileResults, ...prepareFailedResults]
    const allDiffs = allFinalFiles.map(f => f.diff).filter(Boolean).join("\n\n")
    const anyFailed = allFinalFiles.some(f => f.status === "failed")
    const anyRejected = allFinalFiles.some(f => f.status === "rejected")

    let msg = "补丁执行完成"
    if (anyFailed && anyRejected) msg = "部分文件操作失败，部分文件被管理员拒绝"
    else if (anyFailed) msg = "部分文件操作失败"
    else if (anyRejected) msg = "部分文件被管理员拒绝"

    return {
      ok: !anyFailed && !anyRejected,
      msg,
      diff: allDiffs || "未开启，请手动检查",
      globalComment: (() => {
        const comments = [
          outOfProjectConfirm.comment,
          userConfirm.comment
        ].filter(Boolean)

        if (comments.length > 0) {
          return `【注意管理员留言】${comments.join("\n")}`
        }
        return null
      })(),
      files: allFinalFiles
    }
  },

  joi() {
    return Joi.object({
      operations: Joi.array().items(
        Joi.object({
          add: Joi.object({
            reason: Joi.string().required().description("新增理由"),
            path: Joi.string().required().description("文件绝对路径或相对路径"),
            content: Joi.string().required().allow("").description("新建文件的完整内容"),
            cover: Joi.boolean().default(false).description("若文件存在是否覆盖"),
          }).description("新建文件"),

          delete: Joi.object({
            reason: Joi.string().required().description("删除理由"),
            path: Joi.string().required().description("文件绝对路径或相对路径")
          }).description("删除文件"),

          update: Joi.object({
            reason: Joi.string().required().description("总编辑理由"),
            path: Joi.string().required().description("文件绝对路径或相对路径"),
            edits: Joi.array().items(
              Joi.object({
                reason:Joi.string().required().description("分补丁编辑理由"),
                target: Joi.string().required().description("要替换的局部原代码(带适量上下文，保留首尾空格)"),
                replace: Joi.string().required().allow("").description("替换后的新代码片段"),
                startLine: Joi.number().description("起始查找行(可选)。行号从1开始数，第1行就是文件第一行。给定时 target 只在从这一行开始的范围内查找替换"),
                endLine: Joi.number().description("结束查找行(可选)。行号从1开始数。配合 startLine 限定范围（含起始行与结束行这两行本身）；不填则一直查到文件末尾")
              })
            ).required().min(1).description("局部替换块数组")
          }).description("修改文件，支持同时修改同一文件多处")
        }).description("add,delete,update三选一进行操作，是互斥的")
      ).required().min(1).description("文件操作数组")
    })
  },

  getDoc() {
    return `
      JSON版本文件补丁工具，提供增(add)、删(delete)、改(update)功能。
      基于局部字符串匹配(Search & Replace)的多文件编辑工具。
      【注意】所有操作的reason字段必填

      【批量操作（重点）】
      - operations 是【数组】：一次调用可提交多个 operation，批量处理多个文件
        （例如同时改 3 个不同文件 = 3 个 operation，各自带自己的 path 与内容）。
      - 建议分批：文件较多时，每次以 5~10 个文件为一组提交，
        用分批提交的方式提升处理效率（每批独立走审批与落盘，互不阻塞，便于及时审查与回滚）。
      - 同一文件的多处修改：必须合并进【同一个 update 的 edits 数组】（多个替换块），
        引擎会按顺序逐一匹配替换。切勿把同一文件拆成多个 update operation 提交，
        否则后写的会覆盖先写的结果（或被乐观锁拦截，报“文件已被修改”）。
      update 时，只需在 target 填入修改点周围少量的原代码片段，引擎将精确定位并替换。
      当 target 在文件中出现多次时，可给该 edit 传 startLine/endLine 把搜索范围
      限定在指定行区间内以消歧（行号从1开始数，第1行就是文件第一行；startLine 与
      endLine 各自代表的起始行、结束行本身都包含在范围内）。target 须完整落在该行范围内才会被匹配。

      【容错行为】
      - 部分 operation 检测失败（如路径不存在/越界被拒/文件已存在/target 不匹配等）
        不会整体打回：失败项会以 failed/rejected 状态及原因进入返回的 files 列表，
        其余成功的 operation 会照常进入管理员审查（Monaco Diff 确认），批准后落盘。
        最终 ok=false 仅表示存在失败/被拒项，请依据 files 逐条查看处理。
    `
  }
}
