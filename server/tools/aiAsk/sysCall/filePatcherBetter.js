import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
import comData from "../../../comData/comData.js"
import { v4 as uuidV4 } from "uuid"
import workDirTool from "../../workDirTool.js"
import { trs } from "../../i18n.js"
import fileState from "../../fileState.js"

import {
  processPatch
} from "../../fileTools/parser.js"

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

    // 1. 使用 VS Code 官方解析引擎解析并应用 Codex Patch
    let commit
    const fileCache = new Map()
    try {
      const openFn = async (p) => {
        const isAbs = pathLib.isAbsolute(p)
        const resolvedPath = isAbs ? p : (mainDir ? pathLib.resolve(mainDir, p) : p)

        let content = ""
        let readTimestamp = 0
        try {
          const stat = await fs.stat(resolvedPath)
          readTimestamp = stat.mtimeMs
          content = await fs.readFile(resolvedPath, "utf-8")
        } catch (e) {
          // 忽略文件不存在或读取错误
        }

        fileCache.set(p, { resolvedPath, originalContent: content, readTimestamp })
        return { getText: () => content, path: p }
      }

      commit = await processPatch(patch, openFn)
    } catch (err) {
      return { ok: false, msg: `Patch 解析失败: ${err.message}` }
    }

    if (!commit || Object.keys(commit.changes).length === 0) {
      return { ok: false, msg: "未能从输入中解析出任何有效的 Patch 指令。请确保格式符合 Codex Patch 规范（*** Begin Patch ... *** End Patch）。" }
    }

    // 2. 内存预备与路径解析 / 越界检查
    const preparedChanges = []
    const prepareFailedResults = []
    const workDirs = workDirTool.getWorkDirs(metaData.listId)
    const changesEntries = Object.entries(commit.changes)

    // 前置批量项目外越界检查
    const outOfProjectSet = new Set()
    for (const [relativePath, change] of changesEntries) {
      const isAbsP = pathLib.isAbsolute(relativePath)
      const resolvedP = isAbsP ? relativePath : (mainDir ? pathLib.resolve(mainDir, relativePath) : null)
      if (resolvedP && mainDir) {
        const inProj = workDirs.some(dir => resolvedP === dir.path || resolvedP.startsWith(dir.path + pathLib.sep))
        if (!inProj) {
          outOfProjectSet.add(resolvedP)
        }
      }
    }

    let outOfProjectConfirm = { ok: true, comment: "" }
    if (outOfProjectSet.size > 0) {
      const outList = Array.from(outOfProjectSet)
      const isSingle = outList.length === 1
      outOfProjectConfirm = await waitConfirm({
        type: "tip",
        title: isSingle ? "是否允许在工作目录外执行 filePatcherBetter 工具？" : `⚠️ 是否允许访问工作目录外的 ${outList.length} 个文件？`,
        content: isSingle ? `路径：${outList[0]}` : `检测到本次操作涉及以下 ${outList.length} 个工作目录外文件：\\n${outList.map(p => `• ${p}`).join("\\n")}`,
        listId: metaData.listId,
        ext: { identifier: `tool:${this.id}`, toolId: this.id }
      })
    }

    // 将官方 commit.changes 转换为本系统的审批流对象
    for (const [relativePath, change] of changesEntries) {
      if (!relativePath) {
        prepareFailedResults.push({
          path: "unknown",
          status: "failed",
          error: "补丁中存在未指定文件路径的操作。"
        })
        continue
      }

      const isAbs = pathLib.isAbsolute(relativePath)
      if (!isAbs && !mainDir) {
        prepareFailedResults.push({
          path: relativePath,
          status: "failed",
          error: `当前会话未设置工作目录，补丁中的相对路径 "${relativePath}" 无法解析。请先配置工作目录，或者在补丁中使用绝对路径。`
        })
        continue
      }

      const resolvedPath = isAbs ? relativePath : pathLib.resolve(mainDir, relativePath)
      const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
      if (mainDir && !isInProject && !outOfProjectConfirm.ok) {
        prepareFailedResults.push({
          path: relativePath,
          status: "rejected",
          reason: outOfProjectConfirm.comment ? `用户拒绝访问项目外文件：${resolvedPath}。\\n用户拒绝理由/备注：${outOfProjectConfirm.comment}` : `用户拒绝访问项目外文件：${resolvedPath}。`,
          ...(outOfProjectConfirm.comment && { comment: outOfProjectConfirm.comment })
        })
        continue
      }

      // 安全校验与实体转换
      if (change.type === "add") {
        let fileExists = false
        try {
          await fs.stat(resolvedPath)
          fileExists = true
        } catch (e) { }

        if (fileExists) {
          prepareFailedResults.push({
            path: relativePath,
            status: "failed",
            error: `⚠️ 安全拦截：文件 ${relativePath} 已存在。新增文件指令（*** Add File ***）禁止覆盖已有文件。`
          })
          continue
        }

        preparedChanges.push({
          type: "add",
          path: resolvedPath,
          relativePath: relativePath,
          originalContent: "",
          proposedContent: change.newContent || ""
        })
      } else if (change.type === "delete") {
        let originalContent = ""
        try {
          originalContent = await fs.readFile(resolvedPath, "utf-8")
        } catch (e) { }
        preparedChanges.push({
          type: "delete",
          path: resolvedPath,
          relativePath: relativePath,
          originalContent,
          proposedContent: ""
        })
      } else if (change.type === "update") {
        const cached = fileCache.get(relativePath) || {}
        const readTimestamp = cached.readTimestamp || 0
        const originalContent = cached.originalContent || ""

        const stateCache = fileState.get(resolvedPath)
        if (stateCache && readTimestamp > 0 && readTimestamp > stateCache.timestamp) {
          // 文件在上一次被大模型认知后，外部被修改
          prepareFailedResults.push({
            path: relativePath,
            status: "failed",
            error: `⚠️ 安全拦截：文件 ${relativePath} 自上次读取以来已被外部修改过。\\n为防止覆盖最新改动，请先使用 fileOpener 重新读取文件！`
          })
          continue
        }

        preparedChanges.push({
          type: "update",
          path: resolvedPath,
          relativePath: relativePath,
          originalContent,
          proposedContent: change.newContent || "",
          readTimestamp
        })
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
      for (const delChange of preparedChanges.filter(c => c.type === "delete")) {
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
        if (change.type === "delete") {
          await fs.unlink(change.path)
          fileState.set(change.path, { timestamp: 0, content: "", startLine: 0, endLine: 0 })
          fileResults.push({
            path: change.relativePath,
            status: "applied",
            action: "deleted"
          })
        } else {
          if (change.type === "update") {
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
      globalComment: userConfirm.comment || null,
      files: allFinalFiles
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
