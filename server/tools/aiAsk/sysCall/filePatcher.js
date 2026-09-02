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
  const eol = originalContent.includes("\r\n") ? "\r\n" : "\n"
  let content = originalContent.replace(/\r\n/g, "\n")

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]
    const target = (edit.target || "").replace(/\r\n/g, "\n")
    const replace = (edit.replace !== undefined && edit.replace !== null ? String(edit.replace) : "").replace(/\r\n/g, "\n")

    if (!target) continue // 如果没有 target 则跳过

    const matchCount = content.split(target).length - 1

    if (matchCount === 0) {
      throw new Error(`第 ${i + 1} 个 edit 块未能在文件中找到对应的目标原文(target)。本次修改要求完全一字不差的精准匹配，包括首尾空格！请核对后重试。\n目标片段前缀：\n${target.substring(0, 50)}...`)
    }

    if (matchCount > 1) {
      throw new Error(`第 ${i + 1} 个 edit 块的目标原文在文件中出现了 ${matchCount} 次。由于要求精确且唯一匹配，请提供更长的 target 上下文以确保唯一性！`)
    }

    content = content.replace(target, replace)
  }

  return eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content
}

export default {
  name: "文件增删改工具",
  id: "filePatcher",

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

    // 1. 前置批量项目外越界检查（合并为单次弹窗询问）
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
        prepareFailedResults.push({
          path: `operation_${i + 1}`,
          status: "failed",
          error: `第 ${i + 1} 个 operation 格式错误：必须指定 add、delete 或 update 之一。`
        })
        continue
      }

      if (validKeys.length > 1) {
        prepareFailedResults.push({
          path: `operation_${i + 1}`,
          status: "failed",
          error: `第 ${i + 1} 个 operation 格式错误：每个 operation 只能指定一种操作，当前同时传入了: ${validKeys.join(", ")}。请拆分为多个 operation。`
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
        prepareFailedResults.push({
          path: rawPath,
          status: "failed",
          error: `当前会话未设置工作目录，补丁中的相对路径 "${rawPath}" 无法解析。请先配置工作目录，或者使用绝对路径。`
        })
        continue
      }

      const resolvedPath = isAbs ? rawPath : pathLib.resolve(mainDir, rawPath)

      const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
      if (mainDir && !isInProject) {
        if (!outOfProjectConfirm.ok) {
          prepareFailedResults.push({
            path: rawPath,
            status: "rejected",
            reason: outOfProjectConfirm.comment ? `用户拒绝访问项目外文件：${resolvedPath}。\n用户拒绝理由/备注：【注意用户留言】${outOfProjectConfirm.comment}` : `用户拒绝访问项目外文件：${resolvedPath}。`,
            ...(outOfProjectConfirm.comment && { comment: `【注意用户留言】${outOfProjectConfirm.comment}` })
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
          prepareFailedResults.push({
            path: rawPath,
            status: "failed",
            error: `⚠️ 安全拦截：文件 ${rawPath} 已存在。若确需全量覆盖已存在的文件，请将 add 中的 cover 参数显式设为 true；若只需局部修改，请使用 update 操作。`
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
          isCover: fileExists
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
          proposedContent: ""
        })
      } else if (opType === "update") {
        if (!opData.edits || opData.edits.length === 0) {
          prepareFailedResults.push({
            path: rawPath,
            status: "failed",
            error: `在更新 ${rawPath} 时，未提供任何 edits。`
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
            prepareFailedResults.push({
              path: rawPath,
              status: "failed",
              error: `⚠️ 安全拦截：文件 ${rawPath} 自上次读取以来已被外部修改过。\n为防止覆盖最新改动，请先使用 fileOpener 重新读取文件！`
            })
            continue
          }
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (err) {
          prepareFailedResults.push({
            path: rawPath,
            status: "failed",
            error: `读取文件失败 ${rawPath}: ${err.message}`
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
            readTimestamp
          })
        } catch (err) {
          prepareFailedResults.push({
            path: rawPath,
            status: "failed",
            error: `应用补丁失败 [${rawPath}]: ${err.message}`
          })
          continue
        }
      }
    }

    const overallReason = Array.from(new Set(reasons.filter(Boolean))).join("\n") || "代码补丁变更"

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
          content: `${delChange.reason || overallReason}\n\n检测到当前已开启免确认，但即将【永久删除】文件：${delChange.relativePath}。\n删除为高危操作，请再次核验并批准。`,
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
          ...(reviewed?.comment && { comment: `【注意用户留言】${reviewed.comment}` }),
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
            ...(reviewed?.comment && { comment: `【注意用户留言】${reviewed.comment}` })
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
    if (anyFailed && anyRejected) msg = "部分文件操作失败，部分文件被用户拒绝"
    else if (anyFailed) msg = "部分文件操作失败"
    else if (anyRejected) msg = "部分文件被用户拒绝"

    return {
      ok: !anyFailed && !anyRejected,
      msg,
      diff: allDiffs || "未开启，请手动检查",
      globalComment: userConfirm.comment ? `【注意用户留言】${userConfirm.comment}` : null,
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
            reason: Joi.string().required().description("编辑理由"),
            path: Joi.string().required().description("文件绝对路径或相对路径"),
            edits: Joi.array().items(
              Joi.object({
                target: Joi.string().required().description("要替换的局部原代码(带适量上下文，保留首尾空格)"),
                replace: Joi.string().required().allow("").description("替换后的新代码片段"),
                startLine: Joi.number().description("起始查找行(可选)，在所选范围替换"),
                endLine: Joi.number().description("结束查找行(可选)，在所选范围替换")
              })
            ).required().min(1).description("局部替换块数组")
          }).description("修改文件，支持同时修改同一文件多处")
        }).description("add,delete,update三选一进行操作，是互斥的")
      ).required().min(1).description("文件操作数组")
    })
  },

  getDoc() {
    return `
      JSON版本文件补丁工具,提供增、删、改功能
      基于局部字符串匹配(Search & Replace)的多文件编辑工具。
      支持并发处理多文件的增(add)、删(delete)、改(update)。
      修改同一个文件时，在 update 的 edits 数组中同时提供多个替换块。
      update 时，只需在 target 填入修改点周围少量的原代码片段，引擎将精确定位并替换。
      仅在 target 出现多次时使用 startLine/endLine 限定搜索范围。
    `
  }
}
