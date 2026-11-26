import data from "./chatData.js"
import comData from "../../comData/comData.js"
import settingData from "../setting/settingData.js"
import format from "../common/format.js"
import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import Notice from "../common/notice.js"
import Box from "../common/box.js"
import ChatSlashMenu from "./ChatSlashMenu.js"

const DRAFT_STORAGE_KEY = "owo_chat_editor_drafts_v1"
const MAX_UNDO_STEPS = 200
const UNDO_GROUP_DELAY_MS = 500
const MAX_SAVED_DRAFTS = 50

// 模块级多会话状态表：按 listId 独立维护全文 Undo/Redo 栈、光标与滚动位置
const sessionEditorMap = new Map()
let editorInstanceSeq = 0

const escapeHtml = (str) => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

const readAllStoredDrafts = () => {
  try {
    const rawStr = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!rawStr) return {}
    const parsedObj = JSON.parse(rawStr)
    return parsedObj && typeof parsedObj === "object" ? parsedObj : {}
  } catch (err) {
    console.error("[ChatInputEditor] 读取本地草稿失败:", err)
    return {}
  }
}

const writeStoredDraft = (listId, textStr, startNum, endNum, scrollTopNum) => {
  try {
    const allDrafts = readAllStoredDrafts()
    const keyStr = String(listId)
    if (!textStr) {
      delete allDrafts[keyStr]
    } else {
      allDrafts[keyStr] = {
        text: textStr,
        start: startNum,
        end: endNum,
        scrollTop: scrollTopNum,
        updatedAt: Date.now()
      }
      const keyArr = Object.keys(allDrafts)
      if (keyArr.length > MAX_SAVED_DRAFTS) {
        keyArr
          .sort((a, b) => (allDrafts[a]?.updatedAt || 0) - (allDrafts[b]?.updatedAt || 0))
          .slice(0, keyArr.length - MAX_SAVED_DRAFTS)
          .forEach((oldKey) => {
            delete allDrafts[oldKey]
          })
      }
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(allDrafts))
  } catch (err) {
    console.error("[ChatInputEditor] 保存本地草稿失败:", err)
  }
}

// 业界标准全文 Undo/Redo 栈结构（参考 CodeMirror 6 / ProseMirror history 模型）：
// 每条记录保存变更前后的全文与选区，按操作类型、连续光标与时间窗口合并，跨行/换行/粘贴/选区跳转自动分段
const createHistoryState = (baseText, startNum, endNum, scrollTopNum) => {
  return {
    undoStack: [], // [{ beforeText, beforeStart, beforeEnd, afterText, afterStart, afterEnd, opType, ts }]
    redoStack: [],
    cursorStart: startNum,
    cursorEnd: endNum,
    scrollTop: scrollTopNum
  }
}

const getSessionEditorState = (listId, initialTextStr = "") => {
  const keyStr = String(listId)
  if (!sessionEditorMap.has(keyStr)) {
    const storedMap = readAllStoredDrafts()
    const savedObj = storedMap[keyStr]
    const baseText = initialTextStr || (savedObj && typeof savedObj.text === "string" ? savedObj.text : "")
    const safeStart = savedObj && typeof savedObj.start === "number"
      ? Math.max(0, Math.min(savedObj.start, baseText.length))
      : baseText.length
    const safeEnd = savedObj && typeof savedObj.end === "number"
      ? Math.max(safeStart, Math.min(savedObj.end, baseText.length))
      : safeStart
    const scrollTopNum = savedObj && typeof savedObj.scrollTop === "number" ? savedObj.scrollTop : 0
    sessionEditorMap.set(keyStr, createHistoryState(baseText, safeStart, safeEnd, scrollTopNum))
  }
  return sessionEditorMap.get(keyStr)
}

// 计算全文字符偏移量所在的 (lineIndex, colOffset)
const offsetToLineCol = (textStr, offsetNum) => {
  const safeOffset = Math.max(0, Math.min(offsetNum, textStr.length))
  const lines = textStr.split("\n")
  let acc = 0
  for (let i = 0; i < lines.length; i++) {
    const endOfLine = acc + lines[i].length
    if (safeOffset <= endOfLine) {
      return { line: i, col: safeOffset - acc }
    }
    acc = endOfLine + 1
  }
  const lastIdx = Math.max(0, lines.length - 1)
  return { line: lastIdx, col: lines[lastIdx].length }
}

const lineColToOffset = (textStr, lineIdx, colNum) => {
  const lines = textStr.split("\n")
  const safeLine = Math.max(0, Math.min(lineIdx, lines.length - 1))
  let acc = 0
  for (let i = 0; i < safeLine; i++) {
    acc += lines[i].length + 1
  }
  return acc + Math.max(0, Math.min(colNum, lines[safeLine].length))
}

// =========================================================================
// GFM 表格解析与序列化工具（支持列对齐、转义竖线与格内换行 <br>）
// =========================================================================
const splitTableRow = (lineStr) => {
  let trimmed = lineStr.trim()
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1)
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) trimmed = trimmed.slice(0, -1)
  const cells = []
  let cur = ""
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && i + 1 < trimmed.length && trimmed[i + 1] === "|") {
      cur += "|"
      i++
    } else if (trimmed[i] === "|") {
      cells.push(cur.trim().replace(/<br\s*\/?>/gi, "\n"))
      cur = ""
    } else {
      cur += trimmed[i]
    }
  }
  cells.push(cur.trim().replace(/<br\s*\/?>/gi, "\n"))
  return cells
}

const isTableSeparatorLine = (lineStr) => {
  const trimmed = lineStr.trim()
  if (!trimmed || !trimmed.includes("-")) return false
  if (!trimmed.includes("|")) return false
  const cells = splitTableRow(trimmed)
  if (cells.length === 0) return false
  return cells.every((c) => /^:?-{2,}:?$/.test(c.trim()))
}

const parseTableAlignments = (sepLineStr) => {
  return splitTableRow(sepLineStr).map((cell) => {
    const t = cell.trim()
    const leftColon = t.startsWith(":")
    const rightColon = t.endsWith(":")
    if (leftColon && rightColon) return "center"
    if (rightColon) return "right"
    return "left"
  })
}

const parseMarkdownTable = (tableLines) => {
  const rawHeaders = splitTableRow(tableLines[0] || "")
  const rawAligns = parseTableAlignments(tableLines[1] || "")
  const rawRows = tableLines.slice(2).map((line) => splitTableRow(line))
  const colCount = Math.max(
    1,
    rawHeaders.length,
    rawAligns.length,
    ...rawRows.map((r) => r.length)
  )
  const headers = []
  const alignments = []
  for (let c = 0; c < colCount; c++) {
    headers.push(rawHeaders[c] !== undefined ? rawHeaders[c] : "")
    alignments.push(rawAligns[c] || "left")
  }
  const rows = rawRows.map((r) => {
    const norm = []
    for (let c = 0; c < colCount; c++) {
      norm.push(r[c] !== undefined ? r[c] : "")
    }
    return norm
  })
  return { headers, alignments, rows }
}

const escapeTableCell = (textStr) => {
  return String(textStr || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>")
    .trim()
}

const serializeMarkdownTable = (tableData) => {
  const colCount = Math.max(1, tableData.headers.length)
  const headerLine = `| ${tableData.headers.slice(0, colCount).map(escapeTableCell).join(" | ")} |`
  const sepCells = []
  for (let c = 0; c < colCount; c++) {
    const align = tableData.alignments[c] || "left"
    if (align === "center") sepCells.push(":---:")
    else if (align === "right") sepCells.push("---:")
    else sepCells.push("---")
  }
  const sepLine = `| ${sepCells.join(" | ")} |`
  const bodyLines = tableData.rows.map((row) => {
    const cells = []
    for (let c = 0; c < colCount; c++) {
      cells.push(escapeTableCell(row[c] || ""))
    }
    return `| ${cells.join(" | ")} |`
  })
  return [headerLine, sepLine, ...bodyLines].join("\n")
}

// 从 contenteditable 单元格 DOM 还原多行纯文本（兼容 Chrome/Safari/Electron）
const extractCellText = (cellDom) => {
  if (!cellDom) return ""
  const parts = []
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push((node.textContent || "").replace(/\u200b/g, ""))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName
    if (tag === "BR") {
      parts.push("\n")
      return
    }
    if ((tag === "DIV" || tag === "P") && parts.length > 0 && !parts[parts.length - 1].endsWith("\n")) {
      parts.push("\n")
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i])
    }
  }
  walk(cellDom)
  let str = parts.join("").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  // 去掉浏览器在空 contenteditable 末尾自动补的单个占位 <br>
  if (str.endsWith("\n") && cellDom.lastChild && cellDom.lastChild.nodeName === "BR") {
    str = str.slice(0, -1)
  }
  return str
}

// 计算每行的多行上下文状态：围栏代码块 + CommonMark 懒续行引用块 + 数学公式块
const computeLineContexts = (lines, activeLineIndex = -1) => {
  const ctxArr = lines.map(() => ({
    inFence: false,
    fenceBlockId: 0,
    fencePos: "",
    isFenceMarker: false,
    inQuote: false,
    quotePos: "",
    inMath: false,
    mathPos: "",
    isMathMarker: false
  }))
  let fenceChar = ""
  let fenceLen = 0
  let fenceIdSeq = 0
  let currentFenceId = 0
  let inQuoteBlock = false
  let inMathBlock = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed)
    if (fenceMatch && !inMathBlock) {
      const ch = fenceMatch[1][0]
      const len = fenceMatch[1].length
      if (!fenceChar) {
        fenceChar = ch
        fenceLen = len
        currentFenceId = ++fenceIdSeq
        ctxArr[i].inFence = true
        ctxArr[i].fenceBlockId = currentFenceId
        ctxArr[i].isFenceMarker = true
      } else if (fenceChar === ch && len >= fenceLen && trimmed === fenceMatch[1]) {
        ctxArr[i].inFence = true
        ctxArr[i].fenceBlockId = currentFenceId
        ctxArr[i].isFenceMarker = true
        fenceChar = ""
        fenceLen = 0
        currentFenceId = 0
      } else {
        ctxArr[i].inFence = true
        ctxArr[i].fenceBlockId = currentFenceId
      }
      inQuoteBlock = false
      continue
    }
    if (fenceChar) {
      ctxArr[i].inFence = true
      ctxArr[i].fenceBlockId = currentFenceId
      inQuoteBlock = false
      continue
    }

    // 数学公式块（$$ ... $$）上下文标注（用于展开编辑源码时的等宽与淡化 $$ 样式）
    if (trimmed === "$$") {
      ctxArr[i].inMath = true
      ctxArr[i].isMathMarker = true
      inMathBlock = !inMathBlock
      inQuoteBlock = false
      continue
    }
    if (!inMathBlock && /^\$\$.+\$\$$/.test(trimmed)) {
      ctxArr[i].inMath = true
      ctxArr[i].mathPos = "single"
      inQuoteBlock = false
      continue
    }
    if (inMathBlock) {
      ctxArr[i].inMath = true
      inQuoteBlock = false
      continue
    }

    // CommonMark 引用块规则：> 启动引用；连续非空行懒续行留在框内；
    // 刚按 1 次回车产生的当前活动空行（紧跟在引用行后）保持在框内待输入；再按第 2 次回车产生第二个空行时跳出框外
    if (trimmed === "") {
      if (inQuoteBlock && i === activeLineIndex) {
        ctxArr[i].inQuote = true
      }
      inQuoteBlock = false
    } else if (/^>/.test(trimmed)) {
      inQuoteBlock = true
      ctxArr[i].inQuote = true
    } else if (inQuoteBlock && !/^(#{1,6}\s|[-*_]{3,}$)/.test(trimmed)) {
      ctxArr[i].inQuote = true
    } else {
      inQuoteBlock = false
    }
  }

  // 标注连续引用行 / 围栏代码块 / 数学公式块的首/中/尾位置，使多行无缝融合成同一个整体卡片
  for (let i = 0; i < ctxArr.length; i++) {
    if (ctxArr[i].inQuote) {
      const prevQ = i > 0 && ctxArr[i - 1].inQuote
      const nextQ = i < ctxArr.length - 1 && ctxArr[i + 1].inQuote
      if (!prevQ && !nextQ) ctxArr[i].quotePos = "single"
      else if (!prevQ && nextQ) ctxArr[i].quotePos = "first"
      else if (prevQ && nextQ) ctxArr[i].quotePos = "middle"
      else ctxArr[i].quotePos = "last"
    }
    if (ctxArr[i].inFence) {
      const prevF = i > 0 && ctxArr[i - 1].fenceBlockId === ctxArr[i].fenceBlockId
      const nextF = i < ctxArr.length - 1 && ctxArr[i + 1].fenceBlockId === ctxArr[i].fenceBlockId
      if (!prevF && !nextF) ctxArr[i].fencePos = "single"
      else if (!prevF && nextF) ctxArr[i].fencePos = "first"
      else if (prevF && nextF) ctxArr[i].fencePos = "middle"
      else ctxArr[i].fencePos = "last"
    }
    if (ctxArr[i].inMath && !ctxArr[i].mathPos) {
      const prevM = i > 0 && ctxArr[i - 1].inMath
      const nextM = i < ctxArr.length - 1 && ctxArr[i + 1].inMath
      if (!prevM && !nextM) ctxArr[i].mathPos = "single"
      else if (!prevM && nextM) ctxArr[i].mathPos = "first"
      else if (prevM && nextM) ctxArr[i].mathPos = "middle"
      else ctxArr[i].mathPos = "last"
    }
  }
  return ctxArr
}

// 将全文行列表切分为渲染块：普通行（含引用块/代码块）、可视化表格组件、源码表格工具栏、收起的数学公式预览块
const buildDocumentBlocks = (lines, ctxArr, activeLineIndex, rawTableStarts) => {
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const ctx = ctxArr[i]

    // 1. 围栏代码块始终按连续行 div 渲染（方案一：统一浅灰圆角卡片，光标与输入法零干扰）
    if (ctx.inFence) {
      blocks.push({ type: "line", startLine: i, endLine: i, ctx })
      i++
      continue
    }

    // 2. 多行/单行数学公式块（$$ ... $$）：光标在块外时折叠预览，点击或移入光标展开为可编辑源码行
    const trimmed = lines[i].trim()
    if (trimmed === "$$") {
      let endIdx = -1
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "$$") {
          endIdx = j
          break
        }
      }
      if (endIdx > i) {
        const isEditingMath = activeLineIndex >= i && activeLineIndex <= endIdx
        if (isEditingMath) {
          for (let k = i; k <= endIdx; k++) {
            blocks.push({ type: "line", startLine: k, endLine: k, ctx: ctxArr[k] })
          }
        } else {
          blocks.push({
            type: "math_preview",
            startLine: i,
            endLine: endIdx,
            raw: lines.slice(i, endIdx + 1).join("\n")
          })
        }
        i = endIdx + 1
        continue
      }
    } else if (/^\$\$.+\$\$$/.test(trimmed)) {
      if (activeLineIndex === i) {
        blocks.push({ type: "line", startLine: i, endLine: i, ctx })
      } else {
        blocks.push({
          type: "math_preview",
          startLine: i,
          endLine: i,
          raw: lines[i]
        })
      }
      i++
      continue
    }

    // 3. GFM 表格：一旦识别成表格即保持可视化交互表格，除非手动点击“源码”按钮
    if (
      i + 1 < lines.length &&
      lines[i].includes("|") &&
      !ctx.inQuote &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      let endIdx = i + 1
      while (endIdx + 1 < lines.length) {
        const nextLine = lines[endIdx + 1]
        const nextTrim = nextLine.trim()
        if (!nextTrim || !nextLine.includes("|") || /^(#{1,6}\s|>|`{3,}|~{3,})/.test(nextTrim)) {
          break
        }
        endIdx++
      }
      if (rawTableStarts && rawTableStarts.has(i)) {
        blocks.push({
          type: "table_raw_bar",
          startLine: i,
          endLine: endIdx
        })
        for (let k = i; k <= endIdx; k++) {
          blocks.push({ type: "line", startLine: k, endLine: k, ctx: ctxArr[k] })
        }
      } else {
        const tableSlice = lines.slice(i, endIdx + 1)
        blocks.push({
          type: "table",
          startLine: i,
          endLine: endIdx,
          raw: tableSlice.join("\n"),
          tableData: parseMarkdownTable(tableSlice)
        })
      }
      i = endIdx + 1
      continue
    }

    blocks.push({ type: "line", startLine: i, endLine: i, ctx })
    i++
  }
  return blocks
}

// 将统一引用框 / 代码块 / 数学源码块外壳样式直接应用到行 div（多行无缝拼接成一个整体卡片）
const applyLineBoxStyle = (div, ctx, isActive) => {
  div.style.minHeight = `${getSize(5)}rem`
  div.style.lineHeight = `${getSize(5)}rem`
  div.style.wordBreak = "break-word"
  div.style.whiteSpace = (isActive || ctx.inFence || ctx.inMath) ? "pre-wrap" : "normal"

  if (ctx.inQuote) {
    const r1 = `${getSize(1)}rem`
    const r8 = `${getSize(8)}rem`
    const radiusMap = {
      single: `${r1} ${r8} ${r8} ${r1}`,
      first: `${r1} ${r8} 0 0`,
      middle: "0",
      last: `0 0 ${r8} ${r1}`
    }
    div.style.fontFamily = ""
    div.style.fontSize = ""
    div.style.borderTop = "none"
    div.style.borderRight = "none"
    div.style.borderBottom = "none"
    div.style.borderLeft = `${getSize(1)}rem solid ${getColor("blue_1").back}`
    div.style.background = getColor("brown_1").back
    div.style.color = getColor("brown_1").front
    div.style.paddingLeft = `${getSize(2)}rem`
    div.style.paddingRight = `${getSize(2)}rem`
    div.style.paddingTop = (ctx.quotePos === "single" || ctx.quotePos === "first") ? `${getSize(1)}rem` : `${getSize(1 / 2)}rem`
    div.style.paddingBottom = (ctx.quotePos === "single" || ctx.quotePos === "last") ? `${getSize(1)}rem` : `${getSize(1 / 2)}rem`
    div.style.marginTop = (ctx.quotePos === "single" || ctx.quotePos === "first") ? `${getSize(2)}rem` : "0"
    div.style.marginBottom = (ctx.quotePos === "single" || ctx.quotePos === "last") ? `${getSize(2)}rem` : "0"
    div.style.borderRadius = radiusMap[ctx.quotePos] || "0"
  } else if (ctx.inFence) {
    const r2 = `${getSize(2)}rem`
    const radiusMap = {
      single: r2,
      first: `${r2} ${r2} 0 0`,
      middle: "0",
      last: `0 0 ${r2} ${r2}`
    }
    div.style.fontFamily = ""
    div.style.fontSize = ""
    div.style.background = getColor("blue_3").back
    div.style.color = getColor("blue_3").front
    div.style.borderLeft = "none"
    div.style.borderRight = "none"
    div.style.borderTop = "none"
    div.style.borderBottom = "none"
    div.style.paddingLeft = `${getSize(2)}rem`
    div.style.paddingRight = `${getSize(2)}rem`
    div.style.paddingTop = (ctx.fencePos === "single" || ctx.fencePos === "first") ? `${getSize(1)}rem` : `${getSize(1 / 2)}rem`
    div.style.paddingBottom = (ctx.fencePos === "single" || ctx.fencePos === "last") ? `${getSize(1)}rem` : `${getSize(1 / 2)}rem`
    div.style.marginTop = (ctx.fencePos === "single" || ctx.fencePos === "first") ? `${getSize(2)}rem` : "0"
    div.style.marginBottom = (ctx.fencePos === "single" || ctx.fencePos === "last") ? `${getSize(2)}rem` : "0"
    div.style.borderRadius = radiusMap[ctx.fencePos] || "0"
  } else if (ctx.inMath) {
    const r2 = `${getSize(2)}rem`
    const radiusMap = {
      single: r2,
      first: `${r2} ${r2} 0 0`,
      middle: "0",
      last: `0 0 ${r2} ${r2}`
    }
    div.style.fontFamily = ""
    div.style.fontSize = ""
    div.style.background = getColor("brown_1").back
    div.style.color = getColor("brown_1").front
    div.style.borderLeft = `${getSize(1)}rem solid ${getColor("pink_2").back}`
    div.style.borderRight = "none"
    div.style.borderTop = "none"
    div.style.borderBottom = "none"
    div.style.paddingLeft = `${getSize(2)}rem`
    div.style.paddingRight = `${getSize(2)}rem`
    div.style.paddingTop = (ctx.mathPos === "single" || ctx.mathPos === "first") ? `${getSize(1)}rem` : `${getSize(1 / 2)}rem`
    div.style.paddingBottom = (ctx.mathPos === "single" || ctx.mathPos === "last") ? `${getSize(1)}rem` : `${getSize(1 / 2)}rem`
    div.style.marginTop = (ctx.mathPos === "single" || ctx.mathPos === "first") ? `${getSize(2)}rem` : "0"
    div.style.marginBottom = (ctx.mathPos === "single" || ctx.mathPos === "last") ? `${getSize(2)}rem` : "0"
    div.style.borderRadius = radiusMap[ctx.mathPos] || "0"
  } else {
    div.style.fontFamily = ""
    div.style.fontSize = ""
    div.style.borderLeft = "none"
    div.style.borderRight = "none"
    div.style.borderTop = "none"
    div.style.borderBottom = "none"
    div.style.background = isActive ? `color-mix(in srgb, ${getColor("gray_1").front} 5%, transparent)` : "transparent"
    div.style.color = ""
    div.style.paddingLeft = "0"
    div.style.paddingRight = "0"
    div.style.paddingTop = "0"
    div.style.paddingBottom = "0"
    div.style.marginTop = "0"
    div.style.marginBottom = "0"
    div.style.borderRadius = isActive ? `${getSize(1)}rem` : "0"
  }
  div.style.boxShadow = (isActive && (ctx.inQuote || ctx.inFence || ctx.inMath))
    ? `inset 0 0 0 9999px color-mix(in srgb, ${getColor("gray_1").front} 4%, transparent)`
    : "none"
}

// 围栏代码块标记行着色（弱化 ``` 标记，严格 1:1 保留字符长度）
const buildFenceLineHtml = (lineText, ctx) => {
  if (!lineText) return "<br>"
  if (ctx.isFenceMarker) {
    const mFence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(lineText)
    if (mFence) {
      return `${escapeHtml(mFence[1])}<span style="opacity:0.42;">${escapeHtml(mFence[2])}</span><span style="opacity:0.7;">${escapeHtml(mFence[3])}</span>`
    }
  }
  return escapeHtml(lineText)
}

// 活动行行内实时 Markdown 高亮（1:1 严格保留每一个原始字符，确保光标偏移 0 误差）
const SYSTEM_TAG_REGEX = /\[(filePath|attachid|appid|refAppid|codeQuote|elementId|msg|compress|skill):([^\]]+)\]/gi

const escapeAttr = (str) => String(str || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")

// 解析单行中的全部系统标签及其精确列起止位置
const findSystemTagsInLine = (lineStr) => {
  const list = []
  const re = new RegExp(SYSTEM_TAG_REGEX.source, "gi")
  let mObj
  let idx = 0
  while ((mObj = re.exec(lineStr)) !== null) {
    list.push({
      idx: idx++,
      raw: mObj[0],
      type: mObj[1].toLowerCase(),
      value: mObj[2],
      start: mObj.index,
      end: mObj.index + mObj[0].length
    })
  }
  return list
}

// 构建编辑器内原子双色小标签（默认不可编辑，退格整块删除；右侧附轻量编辑小按钮可展开编辑源码）
const buildAtomicTagPillHtml = (rawTag, tagType, tagVal, tagIdx) => {
  const metaMap = {
    attachid: { icon: "Paperclip", label: trs("标签/名称/附件", { cn: "附件", en: "File" }), color: "green_1" },
    filepath: { icon: "FileText", label: trs("标签/名称/文件", { cn: "文件", en: "Path" }), color: "blue_2" },
    appid: { icon: "Browser", label: trs("标签/名称/应用", { cn: "应用", en: "App" }), color: "pink_1" },
    refappid: { icon: "Browser", label: trs("标签/名称/应用", { cn: "应用", en: "App" }), color: "pink_1" },
    codequote: { icon: "FileCode", label: trs("标签/名称/代码", { cn: "代码", en: "Code" }), color: "yellow_1" },
    elementid: { icon: "GridNine", label: trs("标签/名称/元素", { cn: "元素", en: "Elem" }), color: "blue_1" },
    compress: { icon: "Inbox", label: trs("标签/名称/压缩", { cn: "压缩", en: "Compress" }), color: "purple_1" },
    skill: { icon: "MagicWand", label: trs("标签/名称/技能", { cn: "技能", en: "Skill" }), color: "main" },
    msg: { icon: "Message", label: trs("标签/名称/引用", { cn: "引用", en: "Quote" }), color: "pink_2" }
  }
  const meta = metaMap[tagType] || { icon: "Paperclip", label: tagType, color: "pink_1" }
  let displayVal = tagVal
  let titleStr = tagVal
  if (tagType === "filepath") {
    displayVal = tagVal.split(/[/\\]/).pop() || tagVal
  } else if (tagType === "codequote") {
    const cIdx = tagVal.indexOf(":")
    const p = cIdx >= 0 ? tagVal.slice(0, cIdx) : tagVal
    const r = cIdx >= 0 ? tagVal.slice(cIdx + 1) : ""
    const f = p.split(/[/\\]/).pop() || p
    displayVal = r ? `${f} (${r})` : f
    titleStr = `${p}${r ? " @ " + r : ""}`
  } else if (tagType === "elementid") {
    displayVal = tagVal.length > 10 ? (tagVal.includes("-") ? tagVal.split("-")[0] : tagVal.slice(0, 8) + "…") : tagVal
  } else if (tagType === "msg") {
    const parts = tagVal.split(":")
    const shortId = (parts[0] || "").slice(0, 7)
    let comment = ""
    if (parts.length > 2 && parts[2]) {
      try { comment = decodeURIComponent(parts[2]) } catch (e) { comment = "" }
    }
    displayVal = comment ? `${shortId} · ${comment}` : shortId
    titleStr = comment || tagVal
  }

  const keyColor = getColor(meta.color)
  const valColor = getColor("gray_3")
  const hasIcons = typeof window !== "undefined" && window.iconPark && typeof window.iconPark.getIcon === "function"
  const iconHtml = hasIcons
    ? `<span style="display:inline-flex;align-items:center;flex-shrink:0;">${window.iconPark.getIcon(meta.icon, { fill: keyColor.front, size: `${getSize(4)}rem` })}</span>`
    : ""
  const editIconHtml = hasIcons
    ? window.iconPark.getIcon("Edit", { fill: valColor.front, size: `${getSize(3)}rem` })
    : "✎"
  const editTitle = trs("标签/操作/编辑源码", { cn: "编辑标签内容", en: "Edit tag source" })
  const textRule = `font-size:${getSize(3)}rem !important;line-height:${getSize(4)}rem !important;`
  const leftPart = `<span style="display:inline-flex;align-items:center;gap:${getSize(1)}rem;padding:${getSize(1 / 2)}rem ${getSize(2)}rem;background:${keyColor.back};color:${keyColor.front};white-space:nowrap;flex-shrink:0;${textRule}">${iconHtml}<span style="${textRule}">${escapeAttr(meta.label)}</span></span>`
  const valPart = `<span style="display:inline-block;max-width:${getSize(46)}rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${textRule}">${escapeAttr(displayVal)}</span>`
  const editBtn = `<span data-tag-edit="1" data-tag-idx="${tagIdx}" title="${escapeAttr(editTitle)}" style="display:inline-flex;align-items:center;justify-content:center;padding:${getSize(1 / 2)}rem;margin-left:${getSize(1)}rem;border-radius:${getSize(8)}rem;cursor:pointer;opacity:0.65;flex-shrink:0;">${editIconHtml}</span>`
  const rightPart = `<span style="display:inline-flex;align-items:center;padding:${getSize(1 / 2)}rem ${getSize(1)}rem ${getSize(1 / 2)}rem ${getSize(2)}rem;background:${valColor.back};color:${valColor.front};white-space:nowrap;${textRule}">${valPart}${editBtn}</span>`
  const wrapStyle = `display:inline-flex;align-items:stretch;overflow:hidden;vertical-align:middle;border-radius:${getSize(8)}rem;margin:0 ${getSize(1 / 2)}rem;user-select:none;max-width:100%;border:none;`
  return `<span contenteditable="false" data-tag-raw="${escapeAttr(rawTag)}" data-tag-idx="${tagIdx}" title="${escapeAttr(titleStr)}" style="${wrapStyle}">${leftPart}${rightPart}</span>`
}

const buildActiveLineHtml = (lineText, ctx, editingTagIdx = -1) => {
  if (!lineText) return "<br>"
  if (ctx.inFence) {
    return buildFenceLineHtml(lineText, ctx)
  }
  if (ctx.inMath) {
    if (ctx.isMathMarker) {
      return `<span style="opacity:0.45;">${escapeHtml(lineText)}</span>`
    }
    return escapeHtml(lineText)
  }

  // 标题行：实时呈现对应档位字号，弱化 # 标记但完整保留字符
  const headingMatch = /^(#{1,6})(\s+)(.*)$/.exec(lineText)
  if (headingMatch) {
    const level = headingMatch[1].length
    const sizeMap = { 1: getSize(7), 2: getSize(6), 3: getSize(5), 4: getSize(4), 5: getSize(4), 6: getSize(4) }
    const fontSizeRem = sizeMap[level] || getSize(4)
    return `<span style="font-size:${fontSizeRem}rem;line-height:${fontSizeRem + getSize(1)}rem;"><span style="opacity:0.45;">${escapeHtml(headingMatch[1] + headingMatch[2])}</span>${formatInlineEditable(headingMatch[3], editingTagIdx)}</span>`
  }

  // 引用首行：外框已由行 div 统一渲染，这里仅弱化 > 前缀并保留 1:1 字符
  const quoteMatch = /^(\s*>\s?)(.*)$/.exec(lineText)
  if (quoteMatch) {
    return `<span style="opacity:0.45;">${escapeHtml(quoteMatch[1])}</span>${formatInlineEditable(quoteMatch[2], editingTagIdx)}`
  }

  return formatInlineEditable(lineText, editingTagIdx)
}

// 行内语法实时着色：普通 Markdown 1:1 保留字符；系统标签默认渲染为不可编辑原子胶囊（仅点击编辑按钮的那一个展开源码）
const formatInlineEditable = (textStr, editingTagIdx = -1) => {
  const tagColorMap = {
    attachid: "green_1",
    filepath: "blue_2",
    appid: "pink_1",
    refappid: "pink_1",
    codequote: "yellow_1",
    elementid: "blue_1",
    compress: "purple_1",
    skill: "main",
    msg: "pink_2"
  }
  const formatPlainSegment = (segStr) => {
    let html = escapeHtml(segStr)
    html = html.replace(/(`)([^`]+)(`)/g, (_, s1, body, s2) =>
      `<span style="background:${getColor("blue_3").back};color:${getColor("blue_3").front};border-radius:${getSize(1)}rem;"><span style="opacity:0.45;">${s1}</span>${body}<span style="opacity:0.45;">${s2}</span></span>`
    )
    html = html.replace(/(\*\*)([^*]+)(\*\*)/g, (_, s1, body, s2) =>
      `<span><span style="opacity:0.45;">${s1}</span><b>${body}</b><span style="opacity:0.45;">${s2}</span></span>`
    )
    html = html.replace(/(~~)([^~]+)(~~)/g, (_, s1, body, s2) =>
      `<span><span style="opacity:0.45;">${s1}</span><s>${body}</s><span style="opacity:0.45;">${s2}</span></span>`
    )
    return html
  }

  const re = new RegExp(SYSTEM_TAG_REGEX.source, "gi")
  let out = ""
  let lastIdx = 0
  let tagIdx = 0
  let mObj
  while ((mObj = re.exec(textStr)) !== null) {
    if (mObj.index > lastIdx) {
      out += formatPlainSegment(textStr.slice(lastIdx, mObj.index))
    }
    const rawTag = mObj[0]
    const tagTypeRaw = mObj[1]
    const tagType = tagTypeRaw.toLowerCase()
    const tagVal = mObj[2]
    if (tagIdx === editingTagIdx) {
      const keyColor = getColor(tagColorMap[tagType] || "pink_1")
      const valColor = getColor("gray_3")
      out += `<span style="border-radius:${getSize(2)}rem;overflow:hidden;"><span style="background:${keyColor.back};color:${keyColor.front};border-radius:${getSize(2)}rem 0 0 ${getSize(2)}rem;"><span style="opacity:0.45;">[</span>${escapeHtml(tagTypeRaw)}<span style="opacity:0.45;">:</span></span><span style="background:${valColor.back};color:${valColor.front};border-radius:0 ${getSize(2)}rem ${getSize(2)}rem 0;">${escapeHtml(tagVal)}<span style="opacity:0.45;">]</span></span></span>`
    } else {
      out += buildAtomicTagPillHtml(rawTag, tagType, tagVal, tagIdx)
    }
    lastIdx = re.lastIndex
    tagIdx++
  }
  if (lastIdx < textStr.length) {
    out += formatPlainSegment(textStr.slice(lastIdx))
  }
  return out
}

// 从活动行 DOM 精确还原纯文本源码（原子小标签还原为 data-tag-raw，绝不混入展示文案）
const extractActiveLineText = (lineDom) => {
  if (!lineDom) return ""
  let out = ""
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent || "").replace(/\u200b/g, "").replace(/\r?\n/g, "")
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (node.dataset && node.dataset.tagRaw !== undefined) {
      out += node.dataset.tagRaw
      return
    }
    if (node.tagName === "BR") return
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i])
    }
  }
  walk(lineDom)
  return out
}

// 非活动行使用系统 format.js 实时渲染所见即所得效果
// 引用块内的行去掉行首 > 后交由 format 渲染行内语法，由外层连续行 div 拼成一个统一的引用框
const buildRenderedLineHtml = (lineText, ctx) => {
  if (!lineText) return "<br>"
  if (ctx.inFence) {
    return buildFenceLineHtml(lineText, ctx)
  }
  if (ctx.inMath) {
    if (ctx.isMathMarker) {
      return `<span style="opacity:0.45;">${escapeHtml(lineText)}</span>`
    }
    return escapeHtml(lineText)
  }
  try {
    const sourceForFormat = ctx.inQuote ? lineText.replace(/^\s*>\s?/, "") : lineText
    if (!sourceForFormat) return "<br>"
    const rendered = (format(sourceForFormat, "markdown", { noCache: true }) || "").trim()
    const compactHtml = rendered
      .replace(/>\s*\n\s*</g, "><")
      .replace(/<p>/gi, "<p style=\"margin:0;padding:0;\">")
    return compactHtml || "<br>"
  } catch (err) {
    console.error("[ChatInputEditor] 行渲染失败:", err)
    return escapeHtml(lineText)
  }
}

// 从单行 DOM 中读取选区端点在该行源码文本中的精确字符偏移（支持原子标签按源码长度计偏移）
const getOffsetWithinNode = (containerNode, targetNode, targetOffset) => {
  if (!containerNode) return 0
  if (typeof containerNode.querySelector === "function" && containerNode.querySelector("[data-tag-raw]")) {
    let acc = 0
    let found = false
    const walk = (node) => {
      if (found) return
      if (node === targetNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          acc += Math.min(targetOffset, (node.textContent || "").length)
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const limit = Math.min(targetOffset, node.childNodes.length)
          for (let i = 0; i < limit; i++) {
            walk(node.childNodes[i])
            if (found) return
          }
        }
        found = true
        return
      }
      if (node.nodeType === Node.TEXT_NODE) {
        acc += (node.textContent || "").replace(/\u200b/g, "").length
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      if (node.dataset && node.dataset.tagRaw !== undefined) {
        if (node.contains(targetNode)) {
          acc += node.dataset.tagRaw.length
          found = true
          return
        }
        acc += node.dataset.tagRaw.length
        return
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i])
        if (found) return
      }
    }
    walk(containerNode)
    return acc
  }
  try {
    const range = document.createRange()
    range.selectNodeContents(containerNode)
    range.setEnd(targetNode, targetOffset)
    return range.toString().length
  } catch (err) {
    return 0
  }
}

// 将光标精确设置到单行 DOM 的指定源码字符偏移位置（原子标签自动吸附至外侧边缘，绝不陷进不可编辑胶囊内部）
const placeCaretInLineDom = (lineDom, colNum) => {
  if (typeof lineDom.querySelector === "function" && lineDom.querySelector("[data-tag-raw]")) {
    let acc = 0
    let result = null
    const walk = (node) => {
      if (result) return
      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node.textContent || "").length
        if (acc + len >= colNum) {
          result = { node, offset: Math.max(0, colNum - acc) }
          return
        }
        acc += len
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      if (node.dataset && node.dataset.tagRaw !== undefined) {
        const rawLen = node.dataset.tagRaw.length
        const parent = node.parentNode
        const idx = parent ? Array.prototype.indexOf.call(parent.childNodes, node) : 0
        if (colNum <= acc) {
          result = { node: parent, offset: idx }
          return
        }
        if (colNum <= acc + rawLen) {
          result = { node: parent, offset: idx + 1 }
          return
        }
        acc += rawLen
        return
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i])
        if (result) return
      }
    }
    walk(lineDom)
    if (result) return result
    return { node: lineDom, offset: lineDom.childNodes.length }
  }

  const walker = document.createTreeWalker(lineDom, NodeFilter.SHOW_TEXT, null)
  let node = null
  let acc = 0
  while ((node = walker.nextNode())) {
    const len = node.textContent.length
    if (acc + len >= colNum) {
      return { node, offset: Math.max(0, colNum - acc) }
    }
    acc += len
  }
  // 业内标准：空行 <div><br></div> 的光标必须落在 <br> 之前（offset = 0），落在 <br> 之后会导致 Chromium 在首字输入时强制修正 DOM 并打断 macOS IME
  if (colNum === 0 || (lineDom.childNodes.length === 1 && lineDom.firstChild && lineDom.firstChild.nodeName === "BR")) {
    return { node: lineDom, offset: 0 }
  }
  return { node: lineDom, offset: lineDom.childNodes.length }
}

// 将光标放到单元格末尾（供 Tab / Enter / 方向键切换单元格时使用）
const focusTableCellDom = (cellDom, atEnd = true) => {
  if (!cellDom) return
  cellDom.focus()
  try {
    const range = document.createRange()
    range.selectNodeContents(cellDom)
    range.collapse(!atEnd)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  } catch (err) {
    console.error("[ChatInputEditor] 设置单元格光标失败:", err)
  }
}

// 参考 deepseek-harness ui-input-trigger/src/core/detect.ts：词边界与 URL 免疫的斜杠触发探测
const detectSlashTrigger = (textStr, cursorPos) => {
  if (!textStr || cursorPos <= 0) return null
  const maxScan = Math.max(0, cursorPos - 48)
  for (let i = cursorPos - 1; i >= maxScan; i--) {
    const ch = textStr[i]
    if (ch === "\n" || ch === "\r" || ch === " " || ch === "\t") {
      return null
    }
    if (ch === "/") {
      const prevCh = i > 0 ? textStr[i - 1] : ""
      const boundaryOk = i === 0 || /[\s(\[{（【，。；：、,!?;:]/.test(prevCh)
      if (!boundaryOk) return null
      const queryStr = textStr.slice(i + 1, cursorPos)
      if (queryStr.includes("/")) return null
      return {
        trigger: "/",
        query: queryStr,
        start: i,
        end: cursorPos
      }
    }
  }
  return null
}

// 轻量镜像定位法（供纯文本 textarea 模式下测算光标坐标）
const getTextareaCaretPos = (textareaDom, charOffset) => {
  const rect = textareaDom.getBoundingClientRect()
  const style = window.getComputedStyle(textareaDom)
  const mirrorDom = document.createElement("div")
  const copyProps = [
    "boxSizing",
    "width",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth"
  ]
  mirrorDom.style.position = "fixed"
  mirrorDom.style.visibility = "hidden"
  mirrorDom.style.pointerEvents = "none"
  mirrorDom.style.top = "-9999px"
  mirrorDom.style.left = "-9999px"
  mirrorDom.style.whiteSpace = "pre-wrap"
  mirrorDom.style.wordBreak = "break-word"
  copyProps.forEach((prop) => {
    mirrorDom.style[prop] = style[prop]
  })
  const safeOffset = Math.max(0, Math.min(charOffset, textareaDom.value.length))
  mirrorDom.textContent = textareaDom.value.slice(0, safeOffset)
  const markerSpan = document.createElement("span")
  markerSpan.textContent = textareaDom.value.slice(safeOffset, safeOffset + 1) || "\u200b"
  mirrorDom.appendChild(markerSpan)
  document.body.appendChild(mirrorDom)

  const x = rect.left + markerSpan.offsetLeft - textareaDom.scrollLeft
  const y = rect.top + markerSpan.offsetTop - textareaDom.scrollTop
  const lineH = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.5) || 24
  document.body.removeChild(mirrorDom)
  return { x, y, lineH }
}

// 获取当前活动光标的视口坐标（自动兼容 contenteditable 与 textarea）
const getActiveCaretViewportPos = (viewModeStr, liveRootDom, rawDom, charOffset) => {
  if (viewModeStr === "raw" && rawDom) {
    return getTextareaCaretPos(rawDom, charOffset)
  }
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && liveRootDom && liveRootDom.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0).cloneRange()
    range.collapse(true)
    const rectList = range.getClientRects()
    if (rectList && rectList.length > 0) {
      const r = rectList[0]
      return { x: r.left, y: r.top, lineH: r.height || 24 }
    }
    const anchorEl = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect()
      return { x: r.left, y: r.top, lineH: r.height || 24 }
    }
  }
  if (liveRootDom) {
    const r = liveRootDom.getBoundingClientRect()
    return { x: r.left + 16, y: r.top + 16, lineH: 24 }
  }
  return { x: 40, y: 120, lineH: 24 }
}

/**
 * ChatInputEditor - 业内标准单面连续 Markdown 编辑器
 * 1. 所见即所得模式：单一连续 contenteditable 文档面，无行间可编辑割裂墙，活动行 1:1 实时样式编辑，非活动行交由 format.js 渲染
 * 2. 多行结构支持：统一引用框、统一代码块卡片、持久化单元格可编辑表格 UI、点击编辑/离开预览的多行数学公式
 * 3. 纯文本模式：原生 textarea，与所见即所得共享同一份纯文本、光标位置与全文撤销栈
 * 4. 全文 Undo/Redo 栈（CodeMirror/ProseMirror 合并规范）+ localStorage 多会话草稿本
 * 5. Notice 迷你窗斜杠命令菜单（TV/CLI 菜单体验：可选中返回项、自动滚屏、仅一级菜单显示图标）
 */
export default () => {
  const instanceId = ++editorInstanceSeq
  const slashMenuSign = `chat_slash_menu_${instanceId}`

  let self = null
  let currentAttrs = {}
  let listId = 0
  let prevListId = -1
  let viewMode = "live" // "live" | "raw"
  let isExpanded = false
  let isFocused = false
  let isComposing = false
  let compositionBeforeSnapshot = null
  let isInternalDomSync = false
  let showTip = false
  let tipText = ""
  let tipTimeout = null
  let draftSaveTimer = null
  let historyIndex = -1
  let lastSyncedText = ""
  let activeLineIdx = 0
  let liveRootDom = null
  let rawTextareaDom = null
  let slashUploadInputDom = null
  let selectionChangeHandler = null
  let editingTagState = null // { line: number, tagIdx: number } 点击小标签编辑按钮后临时展开源码
  let isInteractivePressGuard = false // 长按交互元素期间阻止 focus / selectionchange 提前收起预览行

  // 表格交互状态：记录手动切回源码的表格起始行号，以及结构变更后的待聚焦单元格
  const rawTableStarts = new Set()
  let pendingTableFocus = null // { startLine, row, col }
  const activeTableCell = {
    startLine: -1,
    row: 0,
    col: 0
  }

  // 斜杠命令菜单状态（支持 `/` 触发与工具栏 `+` 按钮弹出）
  const slashState = {
    open: false,
    fromTrigger: false,
    start: 0,
    end: 0,
    query: "",
    submenuId: "",
    selectedIndex: 0,
    parentSelectedIndex: 0,
    scrollVersion: 0
  }
  let slashMenuCtrl = null

  const triggerToast = (textStr) => {
    tipText = textStr
    showTip = true
    m.redraw()
    if (tipTimeout) clearTimeout(tipTimeout)
    tipTimeout = setTimeout(() => {
      showTip = false
      m.redraw()
    }, 1800)
  }

  const getCurrentText = () => {
    return data.getSessionState(listId).inputText || ""
  }

  const isInsideAtomicWidget = (targetNode) => {
    if (!targetNode) return false
    const el = targetNode.nodeType === Node.ELEMENT_NODE ? targetNode : targetNode.parentElement
    if (!el || typeof el.closest !== "function") return false
    return Boolean(el.closest("[data-block-type='table'], [data-block-type='math_preview'], [data-block-type='table_raw_bar']"))
  }

  const scheduleDraftPersist = (targetListId) => {
    if (draftSaveTimer) clearTimeout(draftSaveTimer)
    draftSaveTimer = setTimeout(() => {
      const edState = getSessionEditorState(targetListId, data.getSessionState(targetListId).inputText || "")
      writeStoredDraft(
        targetListId,
        data.getSessionState(targetListId).inputText || "",
        edState.cursorStart,
        edState.cursorEnd,
        edState.scrollTop
      )
    }, 250)
  }

  const flushDraftPersist = (targetListId) => {
    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer)
      draftSaveTimer = null
    }
    const edState = getSessionEditorState(targetListId, data.getSessionState(targetListId).inputText || "")
    writeStoredDraft(
      targetListId,
      data.getSessionState(targetListId).inputText || "",
      edState.cursorStart,
      edState.cursorEnd,
      edState.scrollTop
    )
  }

  const updateListSession = async (targetListId, updatesObj) => {
    try {
      data.initSessionState(targetListId, updatesObj)
      await settingData.fnCall("updateListConfig", [targetListId, updatesObj])
      m.redraw()
    } catch (err) {
      console.error("[ChatInputEditor] 更新会话配置失败:", err)
      Notice.launch({
        msg: trs("输入框/提示/配置更新失败", {
          cn: "会话配置更新失败",
          en: "Failed to update session config"
        })
      })
    }
  }

  // =========================================================================
  // 单一连续 contenteditable 文档面 + 可视化表格 UI + 数学公式预览引擎
  // =========================================================================
  const createLineDiv = (lineText, lineIndex, isActive, ctx) => {
    const editIdx = (isActive && editingTagState && editingTagState.line === lineIndex) ? editingTagState.tagIdx : -1
    const div = document.createElement("div")
    div.dataset.blockType = "line"
    div.dataset.startLine = String(lineIndex)
    div.dataset.endLine = String(lineIndex)
    div.dataset.raw = lineText
    div.dataset.mode = isActive ? "active" : "rendered"
    div.dataset.ctxKey = `${ctx.inFence ? 1 : 0}_${ctx.fencePos}_${ctx.isFenceMarker ? 1 : 0}_${ctx.quotePos}_${ctx.inMath ? 1 : 0}_${ctx.mathPos}_e${editIdx}`
    applyLineBoxStyle(div, ctx, isActive)
    div.innerHTML = isActive
      ? buildActiveLineHtml(lineText, ctx, editIdx)
      : buildRenderedLineHtml(lineText, ctx)
    return div
  }

  const createTableRawBarDom = (block) => {
    const bar = document.createElement("div")
    bar.contentEditable = "false"
    bar.dataset.blockType = "table_raw_bar"
    bar.dataset.startLine = String(block.startLine)
    bar.dataset.endLine = String(block.endLine)
    bar.style.display = "flex"
    bar.style.alignItems = "center"
    bar.style.justifyContent = "space-between"
    bar.style.marginTop = `${getSize(1)}rem`
    bar.style.marginBottom = `${getSize(1)}rem`
    bar.style.userSelect = "none"

    const labelSpan = document.createElement("span")
    labelSpan.textContent = trs("输入框/表格/源码编辑中", { cn: "表格源码模式", en: "Table Source Mode" })
    labelSpan.style.setProperty("font-size", `${getSize(3)}rem`, "important")
    labelSpan.style.setProperty("line-height", `${getSize(4)}rem`, "important")
    labelSpan.style.color = getColor("gray_1").front
    labelSpan.style.opacity = "0.65"

    const backBtn = document.createElement("span")
    backBtn.textContent = trs("输入框/表格/回到表格", { cn: "← 回到表格", en: "← Back to Table" })
    backBtn.style.setProperty("font-size", `${getSize(3)}rem`, "important")
    backBtn.style.setProperty("line-height", `${getSize(4)}rem`, "important")
    backBtn.style.padding = `${getSize(1 / 2)}rem ${getSize(2)}rem`
    backBtn.style.borderRadius = `${getSize(8)}rem`
    backBtn.style.background = `color-mix(in srgb, ${getColor("main").back} 24%, transparent)`
    backBtn.style.color = getColor("gray_1").front
    backBtn.style.cursor = "pointer"
    backBtn.onpointerdown = (e) => {
      if (e.pointerType !== "touch") e.preventDefault()
    }
    backBtn.onclick = () => {
      const sLine = Number(bar.dataset.startLine || 0)
      rawTableStarts.delete(sLine)
      pendingTableFocus = { startLine: sLine, row: 0, col: 0 }
      syncLiveDom(getCurrentText(), -1, true)
    }

    bar.appendChild(labelSpan)
    bar.appendChild(backBtn)
    return bar
  }

  const createMathPreviewDom = (block) => {
    const wrap = document.createElement("div")
    wrap.contentEditable = "false"
    wrap.dataset.blockType = "math_preview"
    wrap.dataset.startLine = String(block.startLine)
    wrap.dataset.endLine = String(block.endLine)
    wrap.dataset.raw = block.raw
    wrap.title = trs("输入框/公式/点击编辑源码", { cn: "点击编辑公式源码", en: "Click to edit math source" })
    wrap.style.marginTop = `${getSize(1)}rem`
    wrap.style.marginBottom = `${getSize(1)}rem`
    wrap.style.padding = `${getSize(1)}rem ${getSize(2)}rem`
    wrap.style.borderRadius = `${getSize(2)}rem`
    wrap.style.background = "transparent"
    wrap.style.cursor = "pointer"
    wrap.style.textAlign = "center"
    wrap.style.overflowX = "auto"
    wrap.style.userSelect = "none"
    wrap.onpointerenter = () => {
      wrap.style.background = `color-mix(in srgb, ${getColor("gray_1").front} 8%, transparent)`
    }
    wrap.onpointerleave = () => {
      wrap.style.background = "transparent"
    }

    try {
      const rendered = (format(block.raw, "markdown", { noCache: true }) || "").trim()
      wrap.innerHTML = rendered || escapeHtml(block.raw)
    } catch (err) {
      console.error("[ChatInputEditor] 数学公式预览失败:", err)
      wrap.textContent = block.raw
    }

    wrap.onclick = () => {
      const sLine = Number(wrap.dataset.startLine || 0)
      const eLine = Number(wrap.dataset.endLine || sLine)
      const targetLine = eLine > sLine ? sLine + 1 : sLine
      const curText = getCurrentText()
      const targetOffset = lineColToOffset(curText, targetLine, 0)
      applySelectionToDom(curText, targetOffset, targetOffset, true)
    }
    return wrap
  }

  // 从表格跳出到指定行（若超出文档首尾则自动补一行空正文，保证随时可回到正文写作）
  const exitTableToLine = (targetLineIdx, placeAtEnd = false) => {
    const curText = getCurrentText()
    const lines = curText.split("\n")
    if (targetLineIdx < 0) {
      const nextText = "\n" + curText
      commitEdit(nextText, 0, 0, "atomic", true)
      return
    }
    if (targetLineIdx >= lines.length) {
      const nextText = curText + "\n"
      commitEdit(nextText, nextText.length, nextText.length, "atomic", true)
      return
    }
    const col = placeAtEnd ? lines[targetLineIdx].length : 0
    const offset = lineColToOffset(curText, targetLineIdx, col)
    applySelectionToDom(curText, offset, offset, true)
  }

  // 构建持久化单元格可编辑表格 UI 组件（Vditor / Notion 风格）
  const createTableBlockDom = (block) => {
    const tableData = {
      headers: [...block.tableData.headers],
      alignments: [...block.tableData.alignments],
      rows: block.tableData.rows.map((r) => [...r])
    }

    const wrap = document.createElement("div")
    wrap.contentEditable = "false"
    wrap.dataset.blockType = "table"
    wrap.dataset.startLine = String(block.startLine)
    wrap.dataset.endLine = String(block.endLine)
    wrap.dataset.raw = block.raw
    wrap.style.marginTop = `${getSize(2)}rem`
    wrap.style.marginBottom = `${getSize(2)}rem`
    wrap.style.padding = "0"
    wrap.style.border = "none"
    wrap.style.background = "transparent"
    wrap.style.userSelect = "none"
    wrap.style.position = "relative"

    const getBounds = () => ({
      sLine: Number(wrap.dataset.startLine || 0),
      eLine: Number(wrap.dataset.endLine || 0)
    })

    const getActiveRC = () => {
      const { sLine } = getBounds()
      const totalRows = 1 + tableData.rows.length
      const colCount = Math.max(1, tableData.headers.length)
      const row = activeTableCell.startLine === sLine
        ? Math.max(0, Math.min(activeTableCell.row, totalRows - 1))
        : 0
      const col = activeTableCell.startLine === sLine
        ? Math.max(0, Math.min(activeTableCell.col, colCount - 1))
        : 0
      return { row, col }
    }

    // 结构性表格变更（增删行列、对齐、删表）：提交全文并重建表格 DOM，同时恢复目标单元格焦点
    const commitStructuralMutation = (nextTableData, focusRow, focusCol) => {
      const { sLine, eLine } = getBounds()
      const curText = getCurrentText()
      const lines = curText.split("\n")
      const newMd = serializeMarkdownTable(nextTableData)
      const newLines = newMd.split("\n")
      lines.splice(sLine, eLine - sLine + 1, ...newLines)
      const nextText = lines.join("\n")
      const tableOffset = lineColToOffset(nextText, sLine, 0)
      pendingTableFocus = {
        startLine: sLine,
        row: focusRow,
        col: focusCol
      }
      commitEdit(nextText, tableOffset, tableOffset, "atomic", false)
    }

    // 单元格纯内容编辑：原地更新数据与全文 Undo 栈，绝不重建表格 DOM，确保焦点与中文 IME 零中断
    const syncCellToModel = (cellDom, isCompositionEnd = false) => {
      const rIdx = Number(cellDom.dataset.row || 0)
      const cIdx = Number(cellDom.dataset.col || 0)
      const cellVal = extractCellText(cellDom)
      if (rIdx === 0) {
        tableData.headers[cIdx] = cellVal
      } else if (tableData.rows[rIdx - 1]) {
        tableData.rows[rIdx - 1][cIdx] = cellVal
      }
      const { sLine, eLine } = getBounds()
      const curText = getCurrentText()
      const lines = curText.split("\n")
      const newMd = serializeMarkdownTable(tableData)
      lines.splice(sLine, eLine - sLine + 1, ...newMd.split("\n"))
      const nextText = lines.join("\n")

      wrap.dataset.raw = newMd
      const tableOffset = lineColToOffset(nextText, sLine, 0)
      const edState = getSessionEditorState(listId, curText)

      if (!isCompositionEnd && isComposing) {
        captureCompositionBefore()
        lastSyncedText = nextText
        data.getSessionState(listId).inputText = nextText
        edState.cursorStart = tableOffset
        edState.cursorEnd = tableOffset
        return
      }

      const beforeSnap = isCompositionEnd && compositionBeforeSnapshot
        ? compositionBeforeSnapshot
        : {
            text: curText,
            start: edState.cursorStart,
            end: edState.cursorEnd
          }
      if (isCompositionEnd) {
        compositionBeforeSnapshot = null
      }

      const opType = isCompositionEnd
        ? "atomic"
        : (nextText.length < beforeSnap.text.length ? "delete" : "insert")

      pushUndoEntry(edState, beforeSnap.text, beforeSnap.start, beforeSnap.end, nextText, tableOffset, tableOffset, opType)
      edState.cursorStart = tableOffset
      edState.cursorEnd = tableOffset
      lastSyncedText = nextText
      data.getSessionState(listId).inputText = nextText
      scheduleDraftPersist(listId)
      m.redraw()
    }

    const alignLabelMap = {
      left: trs("输入框/表格/左对齐", { cn: "对齐:左", en: "Align:L" }),
      center: trs("输入框/表格/居中", { cn: "对齐:中", en: "Align:C" }),
      right: trs("输入框/表格/右对齐", { cn: "对齐:右", en: "Align:R" })
    }

    // 1. 顶部极简轻量操作条（透明底 + 悬停微亮，不与内容抢视觉）
    const toolbar = document.createElement("div")
    toolbar.style.display = "flex"
    toolbar.style.flexWrap = "wrap"
    toolbar.style.alignItems = "center"
    toolbar.style.justifyContent = "space-between"
    toolbar.style.gap = `${getSize(1)}rem`
    toolbar.style.marginBottom = `${getSize(1)}rem`

    const leftGroup = document.createElement("div")
    leftGroup.style.display = "flex"
    leftGroup.style.flexWrap = "wrap"
    leftGroup.style.gap = `${getSize(1)}rem`
    leftGroup.style.alignItems = "center"

    const rightGroup = document.createElement("div")
    rightGroup.style.display = "flex"
    rightGroup.style.flexWrap = "wrap"
    rightGroup.style.gap = `${getSize(1)}rem`
    rightGroup.style.alignItems = "center"

    const makeToolBtn = (labelStr, titleStr, onClickFn, isDanger = false) => {
      const btn = document.createElement("span")
      const baseFront = getColor("gray_1").front
      const hoverBg = isDanger
        ? `color-mix(in srgb, ${getColor("pink_1").back} 32%, transparent)`
        : `color-mix(in srgb, ${baseFront} 12%, transparent)`
      btn.textContent = labelStr
      btn.title = titleStr
      btn.style.setProperty("font-size", `${getSize(3)}rem`, "important")
      btn.style.setProperty("line-height", `${getSize(4)}rem`, "important")
      btn.style.padding = `${getSize(1 / 2)}rem ${getSize(1)}rem`
      btn.style.borderRadius = `${getSize(2)}rem`
      btn.style.background = "transparent"
      btn.style.color = baseFront
      btn.style.opacity = "0.68"
      btn.style.cursor = "pointer"
      btn.onpointerenter = () => {
        btn.style.background = hoverBg
        btn.style.opacity = "1"
      }
      btn.onpointerleave = () => {
        btn.style.background = "transparent"
        btn.style.opacity = "0.68"
      }
      btn.onpointerdown = (e) => {
        if (e.pointerType !== "touch") e.preventDefault()
      }
      btn.onclick = (e) => {
        e.stopPropagation()
        onClickFn()
      }
      return btn
    }

    const alignBtn = makeToolBtn(
      alignLabelMap[tableData.alignments[getActiveRC().col] || "left"],
      trs("输入框/表格/切换列对齐", { cn: "切换当前列对齐方式（左/中/右）", en: "Cycle column alignment" }),
      () => {
        const { row, col } = getActiveRC()
        const order = ["left", "center", "right"]
        const curAlign = tableData.alignments[col] || "left"
        const nextAlign = order[(order.indexOf(curAlign) + 1) % order.length]
        const nextAligns = [...tableData.alignments]
        nextAligns[col] = nextAlign
        commitStructuralMutation(
          {
            headers: [...tableData.headers],
            alignments: nextAligns,
            rows: tableData.rows.map((r) => [...r])
          },
          row,
          col
        )
      }
    )

    leftGroup.appendChild(
      makeToolBtn(
        trs("输入框/表格/加行", { cn: "+ 行", en: "+ Row" }),
        trs("输入框/表格/加行提示", { cn: "在当前行下方插入一行", en: "Insert row below" }),
        () => {
          const { row, col } = getActiveRC()
          const nextRows = tableData.rows.map((r) => [...r])
          const emptyRow = tableData.headers.map(() => "")
          const insertIdx = row === 0 ? 0 : row
          nextRows.splice(insertIdx, 0, emptyRow)
          commitStructuralMutation(
            {
              headers: [...tableData.headers],
              alignments: [...tableData.alignments],
              rows: nextRows
            },
            insertIdx + 1,
            col
          )
        }
      )
    )

    leftGroup.appendChild(
      makeToolBtn(
        trs("输入框/表格/减行", { cn: "- 行", en: "- Row" }),
        trs("输入框/表格/减行提示", { cn: "删除当前数据行", en: "Delete current row" }),
        () => {
          if (tableData.rows.length === 0) {
            triggerToast(trs("输入框/表格/至少保留表头", { cn: "表头不能删除，如需移除请点“删表”", en: "Cannot delete header row" }))
            return
          }
          const { row, col } = getActiveRC()
          const delIdx = row === 0 ? tableData.rows.length - 1 : Math.min(row - 1, tableData.rows.length - 1)
          const nextRows = tableData.rows.map((r) => [...r])
          nextRows.splice(delIdx, 1)
          commitStructuralMutation(
            {
              headers: [...tableData.headers],
              alignments: [...tableData.alignments],
              rows: nextRows
            },
            Math.max(0, Math.min(row, nextRows.length)),
            col
          )
        }
      )
    )

    leftGroup.appendChild(
      makeToolBtn(
        trs("输入框/表格/加列", { cn: "+ 列", en: "+ Col" }),
        trs("输入框/表格/加列提示", { cn: "在当前列右侧插入一列", en: "Insert column right" }),
        () => {
          const { row, col } = getActiveRC()
          const insertCol = col + 1
          const nextHeaders = [...tableData.headers]
          nextHeaders.splice(insertCol, 0, "")
          const nextAligns = [...tableData.alignments]
          nextAligns.splice(insertCol, 0, "left")
          const nextRows = tableData.rows.map((r) => {
            const nr = [...r]
            nr.splice(insertCol, 0, "")
            return nr
          })
          commitStructuralMutation(
            {
              headers: nextHeaders,
              alignments: nextAligns,
              rows: nextRows
            },
            row,
            insertCol
          )
        }
      )
    )

    leftGroup.appendChild(
      makeToolBtn(
        trs("输入框/表格/减列", { cn: "- 列", en: "- Col" }),
        trs("输入框/表格/减列提示", { cn: "删除当前列", en: "Delete current column" }),
        () => {
          if (tableData.headers.length <= 1) {
            triggerToast(trs("输入框/表格/至少保留一列", { cn: "至少保留一列，如需移除请点“删表”", en: "Keep at least one column" }))
            return
          }
          const { row, col } = getActiveRC()
          const nextHeaders = [...tableData.headers]
          nextHeaders.splice(col, 1)
          const nextAligns = [...tableData.alignments]
          nextAligns.splice(col, 1)
          const nextRows = tableData.rows.map((r) => {
            const nr = [...r]
            nr.splice(col, 1)
            return nr
          })
          commitStructuralMutation(
            {
              headers: nextHeaders,
              alignments: nextAligns,
              rows: nextRows
            },
            row,
            Math.max(0, Math.min(col, nextHeaders.length - 1))
          )
        }
      )
    )

    leftGroup.appendChild(alignBtn)

    rightGroup.appendChild(
      makeToolBtn(
        trs("输入框/表格/源码", { cn: "源码", en: "Source" }),
        trs("输入框/表格/源码提示", { cn: "切换为纯文字源码编辑此表格", en: "Edit table as raw Markdown" }),
        () => {
          const { sLine } = getBounds()
          rawTableStarts.add(sLine)
          const curText = getCurrentText()
          const offset = lineColToOffset(curText, sLine, 0)
          applySelectionToDom(curText, offset, offset, true)
        }
      )
    )

    rightGroup.appendChild(
      makeToolBtn(
        trs("输入框/表格/删表", { cn: "删表", en: "Delete" }),
        trs("输入框/表格/删表提示", { cn: "删除整个表格", en: "Delete entire table" }),
        () => {
          const { sLine, eLine } = getBounds()
          const curText = getCurrentText()
          const lines = curText.split("\n")
          lines.splice(sLine, eLine - sLine + 1)
          const nextText = lines.length > 0 ? lines.join("\n") : ""
          const targetLine = Math.max(0, Math.min(sLine, Math.max(0, lines.length - 1)))
          const offset = lineColToOffset(nextText, targetLine, 0)
          commitEdit(nextText, offset, offset, "atomic", true)
        },
        true
      )
    )

    toolbar.appendChild(leftGroup)
    toolbar.appendChild(rightGroup)
    wrap.appendChild(toolbar)

    // 2. 表格主体严格继承 .article 原生表格配色、表头与边框样式，保证真正所见即所得
    const bodyRowWrap = document.createElement("div")
    bodyRowWrap.style.overflowX = "auto"

    const tableEl = document.createElement("table")
    tableEl.style.width = "100%"
    tableEl.style.margin = "0"
    tableEl.style.tableLayout = "auto"

    const totalRows = 1 + tableData.rows.length
    const colCount = tableData.headers.length

    const bindCellEvents = (cellDom, rIdx, cIdx) => {
      cellDom.contentEditable = "true"
      cellDom.dataset.row = String(rIdx)
      cellDom.dataset.col = String(cIdx)
      cellDom.style.padding = `${getSize(1)}rem ${getSize(2)}rem`
      cellDom.style.minWidth = `${getSize(14)}rem`
      cellDom.style.textAlign = tableData.alignments[cIdx] || "left"
      cellDom.style.whiteSpace = "pre-wrap"
      cellDom.style.wordBreak = "break-word"
      cellDom.style.outline = "none"
      cellDom.style.cursor = "text"
      cellDom.style.userSelect = "text"
      cellDom.style.verticalAlign = "top"

      cellDom.onfocus = () => {
        const { sLine } = getBounds()
        isFocused = true
        data.focusEditor = self
        if (comData.data.get().targetChatListId !== listId) {
          comData.data.edit((d) => {
            d.targetChatListId = listId
          })
        }
        activeTableCell.startLine = sLine
        activeTableCell.row = rIdx
        activeTableCell.col = cIdx
        const focusRingColor = rIdx === 0 ? getColor("main").front : getColor("main").back
        cellDom.style.boxShadow = `inset 0 0 0 ${getSize(0.5)}rem ${focusRingColor}`
        alignBtn.textContent = alignLabelMap[tableData.alignments[cIdx] || "left"]
      }

      cellDom.onblur = () => {
        cellDom.style.boxShadow = "none"
        isComposing = false
        compositionBeforeSnapshot = null
        flushDraftPersist(listId)
      }

      cellDom.oncompositionstart = (e) => {
        e.stopPropagation()
        isComposing = true
        captureCompositionBefore()
      }

      cellDom.oncompositionend = (e) => {
        e.stopPropagation()
        isComposing = false
        setTimeout(() => {
          syncCellToModel(cellDom, true)
        }, 0)
      }

      cellDom.oninput = (e) => {
        e.stopPropagation()
        syncCellToModel(cellDom, false)
      }

      cellDom.onpaste = (e) => {
        e.stopPropagation()
        const clipData = e.clipboardData || (e.originalEvent ? e.originalEvent.clipboardData : null)
        if (!clipData) return
        const plain = clipData.getData("text/plain")
        if (plain !== undefined) {
          e.preventDefault()
          const normalized = plain.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0)
            range.deleteContents()
            const textNode = document.createTextNode(normalized)
            range.insertNode(textNode)
            range.setStartAfter(textNode)
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
          }
          syncCellToModel(cellDom, false)
        }
      }

      cellDom.onkeydown = (e) => {
        e.stopPropagation()
        if (e.isComposing || isComposing) return

        const keyLower = e.key ? e.key.toLowerCase() : ""
        // 单元格内支持全局 Undo / Redo
        if ((e.metaKey || e.ctrlKey) && keyLower === "z") {
          e.preventDefault()
          if (e.shiftKey) performRedo()
          else performUndo()
          return
        }
        if (e.ctrlKey && !e.metaKey && keyLower === "y") {
          e.preventDefault()
          performRedo()
          return
        }

        // Tab / Shift+Tab 切换单元格（末尾按 Tab 自动新增一行）
        if (e.key === "Tab") {
          e.preventDefault()
          if (e.shiftKey) {
            if (cIdx > 0) {
              focusTableCellDom(tableEl.querySelector(`[data-row="${rIdx}"][data-col="${cIdx - 1}"]`))
            } else if (rIdx > 0) {
              focusTableCellDom(tableEl.querySelector(`[data-row="${rIdx - 1}"][data-col="${colCount - 1}"]`))
            }
          } else {
            if (cIdx < colCount - 1) {
              focusTableCellDom(tableEl.querySelector(`[data-row="${rIdx}"][data-col="${cIdx + 1}"]`))
            } else if (rIdx < totalRows - 1) {
              focusTableCellDom(tableEl.querySelector(`[data-row="${rIdx + 1}"][data-col="0"]`))
            } else {
              const nextRows = tableData.rows.map((r) => [...r])
              nextRows.push(tableData.headers.map(() => ""))
              commitStructuralMutation(
                {
                  headers: [...tableData.headers],
                  alignments: [...tableData.alignments],
                  rows: nextRows
                },
                totalRows,
                0
              )
            }
          }
          return
        }

        // Enter：跳到下一行同列（最后一行跳出表格）；Shift+Enter：格内换行；Cmd/Ctrl+Enter：发送消息
        if (e.key === "Enter") {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            closeSlashMenu()
            if (currentAttrs.onsubmit) currentAttrs.onsubmit(e)
            return
          }
          if (e.shiftKey) {
            e.preventDefault()
            const sel = window.getSelection()
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0)
              range.deleteContents()
              const br = document.createElement("br")
              range.insertNode(br)
              range.setStartAfter(br)
              range.collapse(true)
              sel.removeAllRanges()
              sel.addRange(range)
            }
            syncCellToModel(cellDom, false)
            return
          }
          e.preventDefault()
          if (rIdx < totalRows - 1) {
            focusTableCellDom(tableEl.querySelector(`[data-row="${rIdx + 1}"][data-col="${cIdx}"]`))
          } else {
            const { eLine } = getBounds()
            exitTableToLine(eLine + 1, false)
          }
          return
        }

        // 第一行按 ↑ 跳出到表格上方；最后一行按 ↓ 跳出到表格下方
        if (e.key === "ArrowUp" && rIdx === 0) {
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const beforeText = getOffsetWithinNode(cellDom, sel.anchorNode, sel.anchorOffset)
            const curVal = extractCellText(cellDom)
            if (!curVal.slice(0, beforeText).includes("\n")) {
              e.preventDefault()
              const { sLine } = getBounds()
              exitTableToLine(sLine - 1, true)
            }
          }
          return
        }

        if (e.key === "ArrowDown" && rIdx === totalRows - 1) {
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const beforeText = getOffsetWithinNode(cellDom, sel.anchorNode, sel.anchorOffset)
            const curVal = extractCellText(cellDom)
            if (!curVal.slice(beforeText).includes("\n")) {
              e.preventDefault()
              const { eLine } = getBounds()
              exitTableToLine(eLine + 1, false)
            }
          }
        }
      }
    }

    const thead = document.createElement("thead")
    const headTr = document.createElement("tr")
    for (let c = 0; c < colCount; c++) {
      const th = document.createElement("th")
      th.textContent = tableData.headers[c] || ""
      bindCellEvents(th, 0, c)
      headTr.appendChild(th)
    }
    thead.appendChild(headTr)
    tableEl.appendChild(thead)

    const tbody = document.createElement("tbody")
    for (let r = 0; r < tableData.rows.length; r++) {
      const tr = document.createElement("tr")
      for (let c = 0; c < colCount; c++) {
        const td = document.createElement("td")
        td.textContent = tableData.rows[r][c] || ""
        bindCellEvents(td, r + 1, c)
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    tableEl.appendChild(tbody)
    bodyRowWrap.appendChild(tableEl)
    wrap.appendChild(bodyRowWrap)

    return wrap
  }

  // 将全文差异同步到单一连续 contenteditable 容器（仅更新脏块/脏行，绝不破坏焦点与未改节点）
  const syncLiveDom = (textStr, nextActiveLine, forceAll = false) => {
    if (!liveRootDom) return false
    let activeHtmlChanged = false
    isInternalDomSync = true
    try {
      const lines = textStr.split("\n")
      const safeActive = isFocused
        ? Math.max(0, Math.min(nextActiveLine, lines.length - 1))
        : -1
      activeLineIdx = safeActive
      const ctxArr = computeLineContexts(lines, safeActive)
      const blocks = buildDocumentBlocks(lines, ctxArr, safeActive, rawTableStarts)

      // 先清理浏览器可能直接塞进根容器的裸 TextNode（避免首字残留在首个行 div 之外）
      Array.from(liveRootDom.childNodes).forEach((childNode) => {
        if (childNode.nodeType !== Node.ELEMENT_NODE || childNode.tagName !== "DIV") {
          liveRootDom.removeChild(childNode)
          activeHtmlChanged = true
        }
      })

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        const existing = liveRootDom.children[i]

        if (block.type === "line") {
          const lineIdx = block.startLine
          const lineText = lines[lineIdx]
          const ctx = block.ctx
          const wantActive = lineIdx === safeActive
          const wantMode = wantActive ? "active" : "rendered"
          const editIdx = (wantActive && editingTagState && editingTagState.line === lineIdx) ? editingTagState.tagIdx : -1
          const wantCtxKey = `${ctx.inFence ? 1 : 0}_${ctx.fencePos}_${ctx.isFenceMarker ? 1 : 0}_${ctx.quotePos}_${ctx.inMath ? 1 : 0}_${ctx.mathPos}_e${editIdx}`

          if (!existing || existing.dataset.blockType !== "line") {
            const newDiv = createLineDiv(lineText, lineIdx, wantActive, ctx)
            if (existing) liveRootDom.replaceChild(newDiv, existing)
            else liveRootDom.appendChild(newDiv)
            if (wantActive) activeHtmlChanged = true
          } else {
            existing.dataset.startLine = String(lineIdx)
            existing.dataset.endLine = String(lineIdx)
            const modeChanged = existing.dataset.mode !== wantMode
            const ctxChanged = existing.dataset.ctxKey !== wantCtxKey
            if (
              forceAll ||
              existing.dataset.raw !== lineText ||
              modeChanged ||
              ctxChanged
            ) {
              const nextHtml = wantActive
                ? buildActiveLineHtml(lineText, ctx, editIdx)
                : buildRenderedLineHtml(lineText, ctx)
              existing.dataset.raw = lineText
              existing.dataset.mode = wantMode
              existing.dataset.ctxKey = wantCtxKey
              applyLineBoxStyle(existing, ctx, wantActive)
              // 关键：仅当 HTML 实际变化时才改写 innerHTML，防止纯文本输入时打断 macOS IME 组字
              if (existing.innerHTML !== nextHtml) {
                const shouldAnimate = modeChanged && !forceAll
                const prevH = shouldAnimate ? existing.getBoundingClientRect().height : 0
                if (existing._heightAnimTimer) {
                  clearTimeout(existing._heightAnimTimer)
                  existing._heightAnimTimer = null
                }
                existing.style.transition = ""
                existing.style.height = ""
                existing.style.overflow = ""

                existing.innerHTML = nextHtml
                if (wantActive) activeHtmlChanged = true

                if (shouldAnimate && prevH > 0) {
                  const runHeightTransition = (fromH) => {
                    existing.style.transition = "none"
                    existing.style.height = ""
                    const targetH = existing.getBoundingClientRect().height
                    if (Math.abs(targetH - fromH) <= 4) {
                      existing.style.transition = ""
                      existing.style.overflow = ""
                      return
                    }
                    existing.style.overflow = "hidden"
                    existing.style.height = `${fromH}px`
                    void existing.offsetHeight
                    existing.style.transition = "height 0.25s ease"
                    existing.style.height = `${targetH}px`
                    if (existing._heightAnimTimer) clearTimeout(existing._heightAnimTimer)
                    existing._heightAnimTimer = setTimeout(() => {
                      existing._heightAnimTimer = null
                      existing.style.transition = ""
                      existing.style.height = ""
                      existing.style.overflow = ""
                    }, 270)
                  }
                  runHeightTransition(prevH)
                  // 若渲染结果包含尚未加载完的图片附件，图片撑开后继续从当前瞬时高度平滑过渡
                  const imgs = existing.querySelectorAll("img")
                  imgs.forEach((imgEl) => {
                    if (!imgEl.complete) {
                      imgEl.addEventListener("load", () => {
                        const curH = existing.getBoundingClientRect().height
                        if (curH > 0) runHeightTransition(curH)
                      }, { once: true })
                    }
                  })
                }
              }
            }
          }
        } else if (block.type === "table") {
          if (!existing || existing.dataset.blockType !== "table" || forceAll || existing.dataset.raw !== block.raw) {
            const newTableDom = createTableBlockDom(block)
            if (existing) liveRootDom.replaceChild(newTableDom, existing)
            else liveRootDom.appendChild(newTableDom)
          } else {
            existing.dataset.startLine = String(block.startLine)
            existing.dataset.endLine = String(block.endLine)
          }
        } else if (block.type === "table_raw_bar") {
          if (!existing || existing.dataset.blockType !== "table_raw_bar" || forceAll) {
            const newBarDom = createTableRawBarDom(block)
            if (existing) liveRootDom.replaceChild(newBarDom, existing)
            else liveRootDom.appendChild(newBarDom)
          } else {
            existing.dataset.startLine = String(block.startLine)
            existing.dataset.endLine = String(block.endLine)
          }
        } else if (block.type === "math_preview") {
          if (!existing || existing.dataset.blockType !== "math_preview" || forceAll || existing.dataset.raw !== block.raw) {
            const newMathDom = createMathPreviewDom(block)
            if (existing) liveRootDom.replaceChild(newMathDom, existing)
            else liveRootDom.appendChild(newMathDom)
          } else {
            existing.dataset.startLine = String(block.startLine)
            existing.dataset.endLine = String(block.endLine)
          }
        }
      }

      // 移除多余尾部节点
      while (liveRootDom.children.length > blocks.length) {
        liveRootDom.removeChild(liveRootDom.lastChild)
      }
    } finally {
      isInternalDomSync = false
    }

    // 表格结构更新后自动恢复目标单元格焦点
    if (pendingTableFocus && liveRootDom) {
      const targetInfo = pendingTableFocus
      pendingTableFocus = null
      const tableWrap = liveRootDom.querySelector(`[data-block-type="table"][data-start-line="${targetInfo.startLine}"]`)
      if (tableWrap) {
        const cell = tableWrap.querySelector(`[data-row="${targetInfo.row}"][data-col="${targetInfo.col}"]`)
        if (cell) {
          focusTableCellDom(cell, true)
        }
      }
    }
    return activeHtmlChanged
  }

  // 在 liveRootDom 子块中查找包含指定行号的 DOM 块
  const findBlockDomByLine = (lineIdx) => {
    if (!liveRootDom) return null
    for (let i = 0; i < liveRootDom.children.length; i++) {
      const child = liveRootDom.children[i]
      if (child.dataset.blockType === "table_raw_bar") continue
      const s = Number(child.dataset.startLine || 0)
      const e = Number(child.dataset.endLine || s)
      if (lineIdx >= s && lineIdx <= e) {
        return child
      }
    }
    return null
  }

  // 从连续 contenteditable 容器还原精确的全局 (start, end) 字符偏移
  const readLiveSelectionOffsets = (textStr) => {
    if (!liveRootDom) return null
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!liveRootDom.contains(range.startContainer) || !liveRootDom.contains(range.endContainer)) {
      return null
    }
    if (isInsideAtomicWidget(range.startContainer) || isInsideAtomicWidget(range.endContainer)) {
      return null
    }

    const resolveEndpoint = (node, offset) => {
      if (node === liveRootDom) {
        const idx = Math.min(offset, Math.max(0, liveRootDom.children.length - 1))
        const targetChild = liveRootDom.children[idx]
        if (!targetChild) return 0
        const sLine = Number(targetChild.dataset.startLine || 0)
        const eLine = Number(targetChild.dataset.endLine || sLine)
        const col = offset >= liveRootDom.children.length ? (targetChild.dataset.raw || "").split("\n").pop().length : 0
        return lineColToOffset(textStr, offset >= liveRootDom.children.length ? eLine : sLine, col)
      }
      let blockDiv = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
      while (blockDiv && blockDiv.parentElement !== liveRootDom) {
        blockDiv = blockDiv.parentElement
      }
      if (!blockDiv) return 0
      const lineIdx = Number(blockDiv.dataset.startLine || 0)
      if (blockDiv.dataset.blockType !== "line") {
        return lineColToOffset(textStr, lineIdx, 0)
      }
      const rawLine = blockDiv.dataset.raw || ""
      const visCol = getOffsetWithinNode(blockDiv, node, offset)
      if (blockDiv.dataset.mode === "active") {
        return lineColToOffset(textStr, lineIdx, Math.min(visCol, rawLine.length))
      }
      // 从渲染行点击进入：按可见文本比例平滑映射到源码列，避免跳到行尾
      const visLen = (blockDiv.textContent || "").length
      const mappedCol = visLen > 0 ? Math.round((visCol / visLen) * rawLine.length) : rawLine.length
      return lineColToOffset(textStr, lineIdx, Math.min(mappedCol, rawLine.length))
    }

    const startNum = resolveEndpoint(range.startContainer, range.startOffset)
    const endNum = resolveEndpoint(range.endContainer, range.endOffset)
    return {
      start: Math.min(startNum, endNum),
      end: Math.max(startNum, endNum)
    }
  }

  // 将全局 (start, end) 字符偏移精确写回 DOM 光标
  const applySelectionToDom = (textStr, startNum, endNum, shouldFocus = false, skipSelectionIfUnchanged = false) => {
    const safeStart = Math.max(0, Math.min(startNum, textStr.length))
    const safeEnd = Math.max(safeStart, Math.min(endNum, textStr.length))

    if (viewMode === "raw") {
      if (!rawTextareaDom) return
      if (rawTextareaDom.value !== textStr) {
        rawTextareaDom.value = textStr
      }
      if (shouldFocus && document.activeElement !== rawTextareaDom) {
        rawTextareaDom.focus()
      }
      if (!skipSelectionIfUnchanged && (document.activeElement === rawTextareaDom || shouldFocus)) {
        rawTextareaDom.setSelectionRange(safeStart, safeEnd)
      }
      return
    }

    if (!liveRootDom) return
    const startLC = offsetToLineCol(textStr, safeStart)
    const endLC = offsetToLineCol(textStr, safeEnd)

    if (shouldFocus && !pendingTableFocus && document.activeElement !== liveRootDom) {
      isFocused = true
      liveRootDom.focus()
    }

    const activeHtmlChanged = syncLiveDom(textStr, startLC.line)
    if (skipSelectionIfUnchanged && !activeHtmlChanged && document.activeElement === liveRootDom) {
      return
    }

    if (document.activeElement === liveRootDom || (shouldFocus && !isInsideAtomicWidget(document.activeElement))) {
      const startDiv = findBlockDomByLine(startLC.line)
      const endDiv = findBlockDomByLine(endLC.line)
      if (startDiv && startDiv.dataset.blockType === "table") {
        if (shouldFocus) {
          const firstCell = startDiv.querySelector(`[data-row="0"][data-col="0"]`)
          if (firstCell) focusTableCellDom(firstCell, true)
        }
        return
      }
      if (startDiv && endDiv && startDiv.dataset.blockType === "line" && endDiv.dataset.blockType === "line") {
        const startPos = placeCaretInLineDom(startDiv, startLC.col)
        const endPos = placeCaretInLineDom(endDiv, endLC.col)
        isInternalDomSync = true
        try {
          const range = document.createRange()
          range.setStart(startPos.node, startPos.offset)
          range.setEnd(endPos.node, endPos.offset)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        } catch (err) {
          console.error("[ChatInputEditor] 恢复选区失败:", err)
        } finally {
          isInternalDomSync = false
        }
      }
    }
  }

  // =========================================================================
  // 业界标准全文 Undo / Redo 引擎
  // =========================================================================
  const pushUndoEntry = (edState, beforeText, beforeStart, beforeEnd, afterText, afterStart, afterEnd, opType) => {
    if (beforeText === afterText) return
    const nowTs = Date.now()
    const topEntry = edState.undoStack[edState.undoStack.length - 1]
    const hasNewline = Math.abs(afterText.split("\n").length - beforeText.split("\n").length) > 0

    // 合并条件：同类型(insert/delete)、非换行、时间在 500ms 内、且编辑点与上次结束点连续
    const canMerge =
      topEntry &&
      opType !== "atomic" &&
      !hasNewline &&
      topEntry.opType === opType &&
      nowTs - topEntry.ts < UNDO_GROUP_DELAY_MS &&
      (
        (opType === "insert" && beforeStart === topEntry.afterEnd && beforeStart === beforeEnd) ||
        (opType === "delete" && (beforeEnd === topEntry.afterStart || beforeStart === topEntry.afterStart))
      )

    if (canMerge) {
      topEntry.afterText = afterText
      topEntry.afterStart = afterStart
      topEntry.afterEnd = afterEnd
      topEntry.ts = nowTs
    } else {
      edState.undoStack.push({
        beforeText,
        beforeStart,
        beforeEnd,
        afterText,
        afterStart,
        afterEnd,
        opType: hasNewline ? "atomic" : opType,
        ts: nowTs
      })
      if (edState.undoStack.length > MAX_UNDO_STEPS) {
        edState.undoStack.shift()
      }
    }
    edState.redoStack = []
  }

  // 统一事务提交：记录全文 Undo、更新 sessionState、同步 DOM、持久化 localStorage
  const commitEdit = (newTextStr, newStartNum, newEndNum, opType = "atomic", shouldFocus = true, beforeOverride = null, skipSelectionIfUnchanged = false) => {
    const oldText = beforeOverride ? beforeOverride.text : getCurrentText()
    const edState = getSessionEditorState(listId, oldText)
    const beforeStart = beforeOverride ? beforeOverride.start : edState.cursorStart
    const beforeEnd = beforeOverride ? beforeOverride.end : edState.cursorEnd
    const safeStart = Math.max(0, Math.min(newStartNum, newTextStr.length))
    const safeEnd = Math.max(safeStart, Math.min(newEndNum, newTextStr.length))

    pushUndoEntry(edState, oldText, beforeStart, beforeEnd, newTextStr, safeStart, safeEnd, opType)

    edState.cursorStart = safeStart
    edState.cursorEnd = safeEnd
    lastSyncedText = newTextStr
    data.getSessionState(listId).inputText = newTextStr
    scheduleDraftPersist(listId)

    applySelectionToDom(newTextStr, safeStart, safeEnd, shouldFocus, skipSelectionIfUnchanged)
    m.redraw()
  }

  const performUndo = () => {
    const edState = getSessionEditorState(listId, getCurrentText())
    if (edState.undoStack.length === 0) return false
    const entry = edState.undoStack.pop()
    edState.redoStack.push(entry)
    edState.cursorStart = entry.beforeStart
    edState.cursorEnd = entry.beforeEnd
    lastSyncedText = entry.beforeText
    data.getSessionState(listId).inputText = entry.beforeText
    scheduleDraftPersist(listId)
    closeSlashMenu()
    applySelectionToDom(entry.beforeText, entry.beforeStart, entry.beforeEnd, true)
    m.redraw()
    return true
  }

  const performRedo = () => {
    const edState = getSessionEditorState(listId, getCurrentText())
    if (edState.redoStack.length === 0) return false
    const entry = edState.redoStack.pop()
    edState.undoStack.push(entry)
    edState.cursorStart = entry.afterStart
    edState.cursorEnd = entry.afterEnd
    lastSyncedText = entry.afterText
    data.getSessionState(listId).inputText = entry.afterText
    scheduleDraftPersist(listId)
    closeSlashMenu()
    applySelectionToDom(entry.afterText, entry.afterStart, entry.afterEnd, true)
    m.redraw()
    return true
  }

  const insertAtCursor = (insertStr) => {
    if (!insertStr) return
    const textStr = getCurrentText()
    const edState = getSessionEditorState(listId, textStr)
    const startNum = Math.max(0, Math.min(edState.cursorStart, textStr.length))
    const endNum = Math.max(startNum, Math.min(edState.cursorEnd, textStr.length))
    const nextText = textStr.slice(0, startNum) + insertStr + textStr.slice(endNum)
    const nextPos = startNum + insertStr.length
    commitEdit(nextText, nextPos, nextPos, "atomic", true)
  }

  const replaceRangeWithText = (startNum, endNum, replacementStr, shouldFocus = true) => {
    const textStr = getCurrentText()
    const safeStart = Math.max(0, Math.min(startNum, textStr.length))
    const safeEnd = Math.max(safeStart, Math.min(endNum, textStr.length))
    const nextText = textStr.slice(0, safeStart) + replacementStr + textStr.slice(safeEnd)
    const nextPos = safeStart + replacementStr.length
    commitEdit(nextText, nextPos, nextPos, "atomic", shouldFocus)
  }

  // 一键插入 2x2 可视化表格并自动聚焦第一个单元格
  const insertNewTable = () => {
    const textStr = getCurrentText()
    const edState = getSessionEditorState(listId, textStr)
    const startNum = Math.max(0, Math.min(edState.cursorStart, textStr.length))
    const endNum = Math.max(startNum, Math.min(edState.cursorEnd, textStr.length))
    const beforeStr = textStr.slice(0, startNum)
    const afterStr = textStr.slice(endNum)
    const needLeadNewline = beforeStr.length > 0 && !beforeStr.endsWith("\n")
    const needTrailNewline = afterStr.length === 0 || !afterStr.startsWith("\n")
    const col1 = trs("输入框/表格/默认列1", { cn: "列1", en: "Col 1" })
    const col2 = trs("输入框/表格/默认列2", { cn: "列2", en: "Col 2" })
    const tableMd = `| ${col1} | ${col2} |\n| --- | --- |\n|  |  |`
    const prefix = needLeadNewline ? "\n" : ""
    const suffix = needTrailNewline ? "\n" : ""
    const nextText = beforeStr + prefix + tableMd + suffix + afterStr
    const tableStartLine = (beforeStr + prefix).split("\n").length - 1
    const tableOffset = lineColToOffset(nextText, tableStartLine, 0)
    rawTableStarts.delete(tableStartLine)
    if (viewMode === "live") {
      pendingTableFocus = { startLine: tableStartLine, row: 0, col: 0 }
      commitEdit(nextText, tableOffset, tableOffset, "atomic", false)
    } else {
      commitEdit(nextText, tableOffset + 2, tableOffset + 2 + col1.length, "atomic", true)
    }
  }

  // =========================================================================
  // 斜杠 `/` 与工具栏 `+` 快捷命令菜单（内容组件已独立至 ChatSlashMenu.js）
  // =========================================================================
  const closeSlashMenu = () => {
    if (!slashState.open) return
    slashState.open = false
    slashState.fromTrigger = false
    slashState.submenuId = ""
    slashState.query = ""
    slashState.selectedIndex = 0
    slashState.parentSelectedIndex = 0
    slashMenuCtrl = null
    Notice.closeTab(slashMenuSign)
  }

  const removeSlashToken = (shouldFocus = true) => {
    const startNum = slashState.start
    const endNum = slashState.end
    const hadTrigger = slashState.fromTrigger
    closeSlashMenu()
    if (hadTrigger) {
      replaceRangeWithText(startNum, endNum, "", shouldFocus)
    } else if (shouldFocus && self) {
      self.focus()
    }
  }

  const replaceSlashToken = (insertStr) => {
    const startNum = slashState.start
    const endNum = slashState.end
    const hadTrigger = slashState.fromTrigger
    closeSlashMenu()
    if (hadTrigger) {
      replaceRangeWithText(startNum, endNum, insertStr, true)
    } else {
      insertAtCursor(insertStr)
    }
  }

  const launchSlashMenuNotice = (anchorRect = null, isMiniMode = true) => {
    const noticeConfig = {
      sign: slashMenuSign,
      tip: trs("输入框/斜杠/标题", {
        cn: "快捷命令",
        en: "Commands"
      }),
      hideBtn: 1,
      closeOnClickOutside: true,
      cancel: () => {
        slashState.open = false
        slashState.fromTrigger = false
        slashState.submenuId = ""
        slashState.query = ""
        slashState.selectedIndex = 0
        slashMenuCtrl = null
        return undefined
      },
      content: ChatSlashMenu,
      contentAttrs: {
        listId,
        slashState,
        isMini: isMiniMode,
        onReady: (ctrl) => {
          slashMenuCtrl = ctrl
        },
        onInsertText: (insertStr) => replaceSlashToken(insertStr),
        onFinishAction: (shouldFocus) => removeSlashToken(shouldFocus),
        onUploadAttach: () => {
          if (slashUploadInputDom) slashUploadInputDom.click()
        },
        onUpdateSession: (targetListId, updatesObj) => updateListSession(targetListId, updatesObj),
        onToast: (msgStr) => triggerToast(msgStr),
        onClose: () => closeSlashMenu()
      }
    }

    if (isMiniMode && anchorRect) {
      const estW = Math.min(280, window.innerWidth - 24)
      const estH = Math.min(260, Math.floor(window.innerHeight * 0.45))
      const posX = Math.max(12, Math.min(window.innerWidth - estW - 12, anchorRect.x))
      const posY = (anchorRect.y + anchorRect.lineH + estH < window.innerHeight - 16)
        ? (anchorRect.y + anchorRect.lineH + 4)
        : Math.max(12, anchorRect.y - estH - 8)
      noticeConfig.isMini = true
      noticeConfig.width = 0
      noticeConfig.useMinus = false
      noticeConfig.win = {
        x: posX,
        y: posY
      }
    }

    Notice.launch(noticeConfig)
  }

  const openSlashMenu = () => {
    const existingTab = Notice.data.dataArr.find((t) => t.sign === slashMenuSign)
    if (slashState.open && existingTab && !slashState.fromTrigger) {
      closeSlashMenu()
      return
    }
    slashState.open = true
    slashState.fromTrigger = false
    slashState.start = 0
    slashState.end = 0
    slashState.query = ""
    slashState.submenuId = ""
    slashState.selectedIndex = 0
    slashState.parentSelectedIndex = 0
    slashState.scrollVersion++
    launchSlashMenuNotice(null, false)
  }

  const updateSlashTrigger = (textStr, globalCursorPos) => {
    const detected = detectSlashTrigger(textStr, globalCursorPos)
    if (!detected) {
      if (slashState.fromTrigger) closeSlashMenu()
      return
    }

    const wasOpen = slashState.open
    slashState.open = true
    slashState.fromTrigger = true
    slashState.start = detected.start
    slashState.end = detected.end
    if (slashState.query !== detected.query) {
      slashState.query = detected.query
      slashState.selectedIndex = 0
      slashState.scrollVersion++
      if (detected.query) {
        slashState.submenuId = ""
      }
    }

    const existingTab = Notice.data.dataArr.find((t) => t.sign === slashMenuSign)
    if (!wasOpen || !existingTab) {
      const caretPos = getActiveCaretViewportPos(viewMode, liveRootDom, rawTextareaDom, detected.start)
      launchSlashMenuNotice(caretPos, true)
    } else {
      m.redraw()
    }
  }

  // Markdown 快捷包裹
  const applyMarkdownWrap = (prefixStr, suffixStr, defaultStr) => {
    const textStr = getCurrentText()
    const edState = getSessionEditorState(listId, textStr)
    const startNum = Math.max(0, Math.min(edState.cursorStart, textStr.length))
    const endNum = Math.max(startNum, Math.min(edState.cursorEnd, textStr.length))
    const selectedStr = textStr.slice(startNum, endNum)
    const bodyStr = selectedStr || defaultStr
    const wrappedStr = prefixStr + bodyStr + suffixStr
    const nextText = textStr.slice(0, startNum) + wrappedStr + textStr.slice(endNum)
    const nextStart = startNum + prefixStr.length
    const nextEnd = nextStart + bodyStr.length
    commitEdit(nextText, nextStart, nextEnd, "atomic", true)
  }

  const LinkDialog = {
    url: "https://",
    text: "",
    view() {
      return m("",
        {
          style: {
            padding: `${getSize(3)}rem ${getSize(4)}rem`,
            display: "flex",
            flexDirection: "column",
            gap: `${getSize(2)}rem`
          }
        },
        [
          m("",
            [
              m("label",
                {
                  style: {
                    display: "block",
                    marginBottom: `${getSize(1)}rem`,
                    fontSize: `${getSize(3)}rem`,
                    color: getColor("brown_4").front
                  }
                },
                trs("输入框/弹窗/链接地址", { cn: "链接地址:", en: "Link URL:" })
              ),
              m(Box,
                {
                  tagName: "input",
                  value: LinkDialog.url,
                  ext: {
                    type: "text",
                    value: LinkDialog.url,
                    placeholder: "https://"
                  },
                  oninput: (dom) => {
                    LinkDialog.url = dom.value
                  }
                }
              )
            ]
          ),
          m("",
            [
              m("label",
                {
                  style: {
                    display: "block",
                    marginBottom: `${getSize(1)}rem`,
                    fontSize: `${getSize(3)}rem`,
                    color: getColor("brown_4").front
                  }
                },
                trs("输入框/弹窗/链接文本", { cn: "链接文字:", en: "Link Text:" })
              ),
              m(Box,
                {
                  tagName: "input",
                  value: LinkDialog.text,
                  ext: {
                    type: "text",
                    value: LinkDialog.text,
                    placeholder: trs("输入框/占位符/链接", { cn: "链接", en: "link" })
                  },
                  oninput: (dom) => {
                    LinkDialog.text = dom.value
                  }
                }
              )
            ]
          )
        ]
      )
    }
  }

  const openInsertLinkDialog = () => {
    const textStr = getCurrentText()
    const edState = getSessionEditorState(listId, textStr)
    const startNum = Math.max(0, Math.min(edState.cursorStart, textStr.length))
    const endNum = Math.max(startNum, Math.min(edState.cursorEnd, textStr.length))
    const selectedStr = textStr.slice(startNum, endNum)
    if (selectedStr) {
      applyMarkdownWrap("[", "](https://)", selectedStr)
      return
    }
    LinkDialog.url = "https://"
    LinkDialog.text = trs("输入框/占位符/链接", { cn: "链接", en: "link" })
    Notice.launch({
      tip: trs("输入框/弹窗/插入链接", { cn: "插入链接", en: "Insert Link" }),
      content: LinkDialog,
      confirm: (box, closeTabFn) => {
        const urlStr = LinkDialog.url.trim()
        const labelStr = LinkDialog.text.trim()
        if (urlStr && labelStr) {
          replaceRangeWithText(startNum, endNum, `[${labelStr}](${urlStr})`, true)
        }
        closeTabFn()
      }
    })
  }

  const isImageFile = (fileObj) => {
    if (!fileObj) return false
    if (fileObj.type && fileObj.type.startsWith("image/")) return true
    return /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(fileObj.name || "")
  }

  const handleDragOverEvent = (e) => {
    e.redraw = false
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
  }

  const handleDropEvent = (e) => {
    e.redraw = false
    e.preventDefault()
    e.stopPropagation()

    // 拖入时自动将本编辑器设为当前活跃输入句柄，防止未提前点击聚焦导致引用失效或误插到其他窗口
    if (self) data.focusEditor = self
    if (comData.data.get().targetChatListId !== listId) {
      comData.data.edit((d) => {
        d.targetChatListId = listId
      })
    }

    const dt = e.dataTransfer
    if (!dt) return

    const files = dt.files
    if (files && files.length > 0) {
      const imageFiles = []
      const quotedPaths = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (isImageFile(file)) {
          imageFiles.push(file)
        } else {
          const pathStr = window.electronAPI && window.electronAPI.getPathForFile
            ? window.electronAPI.getPathForFile(file)
            : (file.path || file.name)
          if (pathStr) quotedPaths.push(pathStr)
        }
      }
      if (quotedPaths.length > 0) {
        insertAtCursor(quotedPaths.map((p) => `[filePath:${p}]`).join(" ") + " ")
      }
      if (imageFiles.length > 0 && self) {
        self.addFiles(imageFiles)
      }
      return
    }

    // 兼容部分桌面程序通过 text/uri-list 拖入的 file:// 本地路径
    const uriList = dt.getData("text/uri-list") || ""
    if (uriList) {
      const localPaths = uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.startsWith("file://"))
        .map((uri) => {
          try {
            let decoded = decodeURIComponent(uri.replace(/^file:\/\//i, ""))
            if (/^\/[a-zA-Z]:/.test(decoded)) decoded = decoded.slice(1)
            return decoded
          } catch (err) {
            return ""
          }
        })
        .filter(Boolean)
      if (localPaths.length > 0) {
        insertAtCursor(localPaths.map((p) => `[filePath:${p}]`).join(" ") + " ")
        return
      }
    }

    const plainText = dt.getData("text/plain") || ""
    if (plainText) {
      const trimmed = plainText.trim()
      if (!trimmed.includes("\n") && (trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed))) {
        insertAtCursor(`[filePath:${trimmed}] `)
      } else {
        insertAtCursor(plainText)
      }
    }
  }

  const handlePasteEvent = (e) => {
    const clipData = e.clipboardData || (e.originalEvent ? e.originalEvent.clipboardData : null)
    if (!clipData) return
    if (clipData.items) {
      const imageFiles = []
      for (let i = 0; i < clipData.items.length; i++) {
        if (clipData.items[i].type && clipData.items[i].type.indexOf("image") !== -1) {
          const file = clipData.items[i].getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        if (self) self.addFiles(imageFiles)
        return
      }
    }
    // Live 模式下强制纯文本粘贴，防止外部富文本 HTML 污染文档面
    if (viewMode === "live") {
      const plainText = clipData.getData("text/plain")
      if (plainText !== undefined) {
        e.preventDefault()
        const normalized = plainText.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        const curText = getCurrentText()
        const selOffsets = readLiveSelectionOffsets(curText) || {
          start: getSessionEditorState(listId, curText).cursorStart,
          end: getSessionEditorState(listId, curText).cursorEnd
        }
        replaceRangeWithText(selOffsets.start, selOffsets.end, normalized, true)
      }
    }
  }

  const captureCompositionBefore = () => {
    if (compositionBeforeSnapshot) return
    const curText = getCurrentText()
    const edState = getSessionEditorState(listId, curText)
    compositionBeforeSnapshot = {
      text: curText,
      start: edState.cursorStart,
      end: edState.cursorEnd
    }
  }

  // 从 Live 模式下当前编辑行同步回全文模型（兼容表格块 / 公式预览块 / 空容器 / 裸 TextNode / 中文 IME）
  const syncLiveInputToModel = (inputEvent = null, isCompositionEnd = false) => {
    if (!liveRootDom || isInternalDomSync) return
    const composingNow = !isCompositionEnd && (
      isComposing || Boolean(inputEvent && (inputEvent.isComposing || inputEvent.inputType === "insertCompositionText"))
    )
    const oldText = getCurrentText()
    const edState = getSessionEditorState(listId, oldText)

    const blockDivArr = Array.from(liveRootDom.children).filter((el) => el.tagName === "DIV")
    const selNow = window.getSelection()
    let editedDiv = null
    if (selNow && selNow.rangeCount > 0 && liveRootDom.contains(selNow.anchorNode)) {
      let curEl = selNow.anchorNode.nodeType === Node.ELEMENT_NODE ? selNow.anchorNode : selNow.anchorNode.parentElement
      while (curEl && curEl.parentElement !== liveRootDom) {
        curEl = curEl.parentElement
      }
      if (curEl && curEl.parentElement === liveRootDom) editedDiv = curEl
    }

    const nextLines = []
    let editedLineIdx = -1

    if (blockDivArr.length > 0) {
      for (let i = 0; i < blockDivArr.length; i++) {
        const div = blockDivArr[i]
        const bType = div.dataset.blockType || "line"
        if (bType === "table_raw_bar") continue
        if (bType === "table" || bType === "math_preview") {
          const rawArr = (div.dataset.raw || "").split("\n")
          for (let k = 0; k < rawArr.length; k++) {
            nextLines.push(rawArr[k])
          }
          continue
        }
        const curLineIndex = nextLines.length
        if (div === editedDiv) editedLineIdx = curLineIndex
        if (div.dataset.mode === "active" || div === editedDiv || !div.dataset.mode) {
          const rawFromDom = extractActiveLineText(div)
          if (div.dataset.mode === "rendered" && /^>\s?/.test(div.dataset.raw || "") && !/^>\s?/.test(rawFromDom)) {
            nextLines.push("> " + rawFromDom)
          } else {
            nextLines.push(rawFromDom)
          }
        } else {
          nextLines.push(div.dataset.raw || "")
        }
      }
    } else {
      const rawFallback = extractActiveLineText(liveRootDom)
      nextLines.push(rawFallback)
    }

    const nextText = nextLines.join("\n")

    let nextPos = nextText.length
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && liveRootDom.contains(sel.anchorNode)) {
      if (blockDivArr.length > 0 && editedDiv && (editedDiv.dataset.blockType || "line") === "line") {
        const safeIdx = Math.max(0, Math.min(editedLineIdx < 0 ? 0 : editedLineIdx, nextLines.length - 1))
        const curLineStr = nextLines[safeIdx] || ""
        const col = getOffsetWithinNode(editedDiv, sel.anchorNode, sel.anchorOffset)
        nextPos = lineColToOffset(nextText, safeIdx, Math.min(col, curLineStr.length))
      } else {
        const col = getOffsetWithinNode(liveRootDom, sel.anchorNode, sel.anchorOffset)
        nextPos = Math.max(0, Math.min(col, nextText.length))
      }
    }

    // IME 组字期间：仅记住组字前快照，绝不改写 DOM、绝不重设选区、绝不污染 Undo 基准文本
    if (composingNow) {
      captureCompositionBefore()
      lastSyncedText = nextText
      data.getSessionState(listId).inputText = nextText
      edState.cursorStart = nextPos
      edState.cursorEnd = nextPos
      return
    }

    const beforeSnapshot = isCompositionEnd && compositionBeforeSnapshot
      ? compositionBeforeSnapshot
      : {
          text: oldText,
          start: edState.cursorStart,
          end: edState.cursorEnd
        }
    if (isCompositionEnd) {
      compositionBeforeSnapshot = null
    }

    // 每次 IME 选词落字作为独立原子 Undo 步骤（与浏览器 / Word 原生分段撤销一致）
    const opType = isCompositionEnd
      ? "atomic"
      : (nextText.length < beforeSnapshot.text.length ? "delete" : "insert")
    commitEdit(nextText, nextPos, nextPos, opType, false, beforeSnapshot, true)
    updateSlashTrigger(nextText, nextPos)
  }

  const handleSharedKeydown = (e, attrs) => {
    if (e.isComposing || isComposing) return

    // 1. 斜杠命令菜单激活时：TV / CLI 风格键盘导航（全程不失焦，自动滚屏）
    if (slashState.open && slashMenuCtrl) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        slashMenuCtrl.moveSelection(1)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        slashMenuCtrl.moveSelection(-1)
        return
      }
      if (e.key === "ArrowRight") {
        if (slashMenuCtrl.enterSubmenu()) {
          e.preventDefault()
          return
        }
      }
      if (e.key === "ArrowLeft" && slashMenuCtrl.hasSubmenu()) {
        e.preventDefault()
        slashMenuCtrl.goBack()
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        slashMenuCtrl.executeSelected()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        if (slashMenuCtrl.hasSubmenu()) {
          slashMenuCtrl.goBack()
        } else {
          closeSlashMenu()
        }
        return
      }
    }

    // 2. 全文 Undo / Redo 快捷键接管
    const keyLower = e.key ? e.key.toLowerCase() : ""
    if ((e.metaKey || e.ctrlKey) && keyLower === "z") {
      e.preventDefault()
      if (e.shiftKey) {
        performRedo()
      } else {
        performUndo()
      }
      return
    }
    if (e.ctrlKey && !e.metaKey && keyLower === "y") {
      e.preventDefault()
      performRedo()
      return
    }

    // 3. 历史发送记录翻阅
    if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault()
      data.loadHistory()
      const historyArr = data.inputHistory
      if (historyArr && historyArr.length > 0) {
        historyIndex = historyIndex < 0
          ? 0
          : (e.key === "ArrowUp"
              ? (historyIndex + 1) % historyArr.length
              : (historyIndex - 1 + historyArr.length) % historyArr.length)
        const histText = historyArr[historyIndex]
        commitEdit(histText, histText.length, histText.length, "atomic", true)
      }
      return
    }

    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
      historyIndex = -1
    }

    // 4. Live 模式下跨行删除、行首退格与方向键进入表格/数学公式块
    if (viewMode === "live") {
      const curText = getCurrentText()
      const selOffsets = readLiveSelectionOffsets(curText)
      if (selOffsets) {
        const edState = getSessionEditorState(listId, curText)
        edState.cursorStart = selOffsets.start
        edState.cursorEnd = selOffsets.end

        // 方向键从正文平滑进入相邻的表格单元格或折叠数学公式
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && selOffsets.start === selOffsets.end) {
          const lc = offsetToLineCol(curText, selOffsets.start)
          const targetLine = e.key === "ArrowDown" ? lc.line + 1 : lc.line - 1
          const neighborBlock = findBlockDomByLine(targetLine)
          if (neighborBlock && neighborBlock.dataset.blockType === "table") {
            e.preventDefault()
            const rows = neighborBlock.querySelectorAll("tr")
            const targetRow = e.key === "ArrowDown" ? 0 : Math.max(0, rows.length - 1)
            const targetCell = neighborBlock.querySelector(`[data-row="${targetRow}"][data-col="0"]`)
            if (targetCell) focusTableCellDom(targetCell, true)
            return
          }
          if (neighborBlock && neighborBlock.dataset.blockType === "math_preview") {
            e.preventDefault()
            const sLine = Number(neighborBlock.dataset.startLine || 0)
            const eLine = Number(neighborBlock.dataset.endLine || sLine)
            const enterLine = e.key === "ArrowDown" ? sLine : eLine
            const nextOffset = lineColToOffset(curText, enterLine, 0)
            applySelectionToDom(curText, nextOffset, nextOffset, true)
            return
          }
        }

        if (e.key === "Backspace") {
          if (selOffsets.start !== selOffsets.end) {
            e.preventDefault()
            const nextText = curText.slice(0, selOffsets.start) + curText.slice(selOffsets.end)
            commitEdit(nextText, selOffsets.start, selOffsets.start, "delete", true)
            updateSlashTrigger(nextText, selOffsets.start)
            return
          }
          const lc = offsetToLineCol(curText, selOffsets.start)
          const lines = curText.split("\n")
          const curLineStr = lines[lc.line] || ""
          const tagsInLine = findSystemTagsInLine(curLineStr)
          const prevAtomicTag = tagsInLine.find((t) =>
            t.end === lc.col && !(editingTagState && editingTagState.line === lc.line && editingTagState.tagIdx === t.idx)
          )
          if (prevAtomicTag) {
            e.preventDefault()
            const delStart = selOffsets.start - prevAtomicTag.raw.length
            const nextText = curText.slice(0, delStart) + curText.slice(selOffsets.start)
            commitEdit(nextText, delStart, delStart, "delete", true)
            updateSlashTrigger(nextText, delStart)
            return
          }
          if (lc.col === 0 && lc.line > 0) {
            e.preventDefault()
            const nextPos = selOffsets.start - 1
            const nextText = curText.slice(0, nextPos) + curText.slice(selOffsets.start)
            commitEdit(nextText, nextPos, nextPos, "delete", true)
            updateSlashTrigger(nextText, nextPos)
            return
          }
        }

        if (e.key === "Delete") {
          if (selOffsets.start !== selOffsets.end) {
            e.preventDefault()
            const nextText = curText.slice(0, selOffsets.start) + curText.slice(selOffsets.end)
            commitEdit(nextText, selOffsets.start, selOffsets.start, "delete", true)
            return
          }
          const lc = offsetToLineCol(curText, selOffsets.start)
          const lines = curText.split("\n")
          const curLineStr = lines[lc.line] || ""
          const tagsInLine = findSystemTagsInLine(curLineStr)
          const nextAtomicTag = tagsInLine.find((t) =>
            t.start === lc.col && !(editingTagState && editingTagState.line === lc.line && editingTagState.tagIdx === t.idx)
          )
          if (nextAtomicTag) {
            e.preventDefault()
            const nextText = curText.slice(0, selOffsets.start) + curText.slice(selOffsets.start + nextAtomicTag.raw.length)
            commitEdit(nextText, selOffsets.start, selOffsets.start, "delete", true)
            return
          }
          if (lc.col === lines[lc.line].length && lc.line < lines.length - 1) {
            e.preventDefault()
            const nextText = curText.slice(0, selOffsets.start) + curText.slice(selOffsets.start + 1)
            commitEdit(nextText, selOffsets.start, selOffsets.start, "delete", true)
            return
          }
        }
      }
    }

    // 5. Enter 发送 / 智能换行策略
    if (e.key === "Enter") {
      const performSmartNewline = () => {
        const curText = getCurrentText()
        const selOffsets = viewMode === "live"
          ? (readLiveSelectionOffsets(curText) || {
              start: getSessionEditorState(listId, curText).cursorStart,
              end: getSessionEditorState(listId, curText).cursorEnd
            })
          : {
              start: rawTextareaDom ? rawTextareaDom.selectionStart : getSessionEditorState(listId, curText).cursorStart,
              end: rawTextareaDom ? rawTextareaDom.selectionEnd : getSessionEditorState(listId, curText).cursorEnd
            }

        if (selOffsets.start === selOffsets.end) {
          const lineStart = curText.lastIndexOf("\n", selOffsets.start - 1) + 1
          const lineEndIdx = curText.indexOf("\n", selOffsets.start)
          const lineEnd = lineEndIdx === -1 ? curText.length : lineEndIdx
          const lineStr = curText.slice(lineStart, lineEnd)
          const colNum = selOffsets.start - lineStart

          // 引用块遵循 CommonMark 懒续行规范：回车直接插入普通换行即可继续留在同一引用框内；连续两个回车产生空行即自动中止引用
          const emptyQuoteMatch = /^\s*>\s*$/.exec(lineStr)
          if (emptyQuoteMatch && selOffsets.start === lineEnd) {
            replaceRangeWithText(lineStart, lineEnd, "", true)
            closeSlashMenu()
            return
          }

          // 任务列表续行 / 空行退出
          const taskMatch = /^(\s*[-*+]\s+\[[ xX]\]\s+)(.*)$/.exec(lineStr)
          if (taskMatch && colNum >= taskMatch[1].length) {
            if (taskMatch[2].trim() === "" && selOffsets.start === lineEnd) {
              replaceRangeWithText(lineStart, lineEnd, "", true)
            } else {
              const nextPrefix = taskMatch[1].replace(/\[[xX]\]/, "[ ]")
              replaceRangeWithText(selOffsets.start, selOffsets.end, `\n${nextPrefix}`, true)
            }
            closeSlashMenu()
            return
          }

          // 无序列表续行 / 空行退出
          const ulMatch = /^(\s*[-*+]\s+)(.*)$/.exec(lineStr)
          if (ulMatch && colNum >= ulMatch[1].length) {
            if (ulMatch[2].trim() === "" && selOffsets.start === lineEnd) {
              replaceRangeWithText(lineStart, lineEnd, "", true)
            } else {
              replaceRangeWithText(selOffsets.start, selOffsets.end, `\n${ulMatch[1]}`, true)
            }
            closeSlashMenu()
            return
          }

          // 有序列表续行（自动递增序号）/ 空行退出
          const olMatch = /^(\s*)(\d+)(\.\s+)(.*)$/.exec(lineStr)
          if (olMatch && colNum >= (olMatch[1].length + olMatch[2].length + olMatch[3].length)) {
            if (olMatch[4].trim() === "" && selOffsets.start === lineEnd) {
              replaceRangeWithText(lineStart, lineEnd, "", true)
            } else {
              replaceRangeWithText(selOffsets.start, selOffsets.end, `\n${olMatch[1]}${Number(olMatch[2]) + 1}${olMatch[3]}`, true)
            }
            closeSlashMenu()
            return
          }
        }

        replaceRangeWithText(selOffsets.start, selOffsets.end, "\n", true)
        closeSlashMenu()
      }

      if (isExpanded) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          e.preventDefault()
          closeSlashMenu()
          if (attrs.onsubmit) attrs.onsubmit(e)
          return
        }
        e.preventDefault()
        performSmartNewline()
      } else {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          e.preventDefault()
          performSmartNewline()
          return
        }
        e.preventDefault()
        closeSlashMenu()
        if (attrs.onsubmit) attrs.onsubmit(e)
      }
    }
  }

  return {
    oninit(vnode) {
      self = vnode.state
      currentAttrs = vnode.attrs || {}
      listId = vnode.attrs.listId || 0
      prevListId = listId
      const session = data.getSessionState(listId)
      const storedMap = readAllStoredDrafts()
      const savedObj = storedMap[String(listId)]
      if (!session.inputText && savedObj && typeof savedObj.text === "string" && savedObj.text) {
        session.inputText = savedObj.text
      }
      getSessionEditorState(listId, session.inputText || "")
      lastSyncedText = session.inputText || ""
    },
    oncreate(vnode) {
      if (vnode.attrs.onReady) vnode.attrs.onReady(vnode.state)
      if (!data.focusEditor) data.focusEditor = vnode.state

      const curText = getCurrentText()
      const edState = getSessionEditorState(listId, curText)
      if (viewMode === "live" && liveRootDom) {
        syncLiveDom(curText, -1, true)
        if (edState.scrollTop > 0) liveRootDom.scrollTop = edState.scrollTop
      } else if (rawTextareaDom) {
        rawTextareaDom.value = curText
        if (edState.scrollTop > 0) rawTextareaDom.scrollTop = edState.scrollTop
      }

      // 监听全局 selectionchange：仅在折叠光标（未拖选）切行时切换活动行，绝不干扰自下而上反选与跨行拖选
      selectionChangeHandler = () => {
        if (isInternalDomSync || isComposing || isInteractivePressGuard || viewMode !== "live" || !liveRootDom) return
        if (document.activeElement !== liveRootDom) return
        const textStr = getCurrentText()
        const selOffsets = readLiveSelectionOffsets(textStr)
        if (!selOffsets) return
        const ed = getSessionEditorState(listId, textStr)
        ed.cursorStart = selOffsets.start
        ed.cursorEnd = selOffsets.end
        const sel = window.getSelection()
        if (!sel || !sel.isCollapsed) return
        const nextLC = offsetToLineCol(textStr, selOffsets.start)
        if (editingTagState) {
          if (editingTagState.line !== nextLC.line) {
            editingTagState = null
          } else {
            const lineStr = textStr.split("\n")[nextLC.line] || ""
            const curTag = findSystemTagsInLine(lineStr).find((t) => t.idx === editingTagState.tagIdx)
            if (!curTag || nextLC.col < curTag.start || nextLC.col > curTag.end) {
              editingTagState = null
              applySelectionToDom(textStr, selOffsets.start, selOffsets.end, false)
              return
            }
          }
        }
        if (nextLC.line !== activeLineIdx) {
          applySelectionToDom(textStr, selOffsets.start, selOffsets.end, false)
        }
      }
      document.addEventListener("selectionchange", selectionChangeHandler)
    },
    onupdate(vnode) {
      currentAttrs = vnode.attrs || {}
      const nextListId = vnode.attrs.listId || 0
      if (nextListId !== prevListId) {
        flushDraftPersist(prevListId)
        closeSlashMenu()
        editingTagState = null
        rawTableStarts.clear()
        prevListId = nextListId
        listId = nextListId
        const session = data.getSessionState(listId)
        const storedMap = readAllStoredDrafts()
        const savedObj = storedMap[String(listId)]
        if (!session.inputText && savedObj && typeof savedObj.text === "string" && savedObj.text) {
          session.inputText = savedObj.text
        }
        const nextEd = getSessionEditorState(listId, session.inputText || "")
        lastSyncedText = session.inputText || ""
        applySelectionToDom(lastSyncedText, nextEd.cursorStart, nextEd.cursorEnd, isFocused)
        if (viewMode === "live" && liveRootDom) liveRootDom.scrollTop = nextEd.scrollTop
        if (viewMode === "raw" && rawTextareaDom) rawTextareaDom.scrollTop = nextEd.scrollTop
        return
      }

      // 多窗口打开同一会话：非本编辑器聚焦时同步外部文本变化
      const curText = getCurrentText()
      if (!isFocused && curText !== lastSyncedText) {
        lastSyncedText = curText
        const ed = getSessionEditorState(listId, curText)
        ed.cursorStart = curText.length
        ed.cursorEnd = curText.length
        if (viewMode === "live") {
          syncLiveDom(curText, -1, true)
        } else if (rawTextareaDom) {
          rawTextareaDom.value = curText
        }
      }
    },
    onremove(vnode) {
      flushDraftPersist(listId)
      closeSlashMenu()
      if (selectionChangeHandler) {
        document.removeEventListener("selectionchange", selectionChangeHandler)
        selectionChangeHandler = null
      }
      if (tipTimeout) clearTimeout(tipTimeout)
      if (draftSaveTimer) clearTimeout(draftSaveTimer)
      if (data.focusEditor === vnode.state) {
        data.focusEditor = null
      }
    },
    insertAtCursor,
    appendText(textStr) {
      insertAtCursor(textStr)
    },
    addFiles(files) {
      const targetListId = listId
      const session = data.getSessionState(targetListId)
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const attachObj = {
          id: file.name,
          url: URL.createObjectURL(file),
          type: isImageFile(file) ? "image" : "file",
          progress: 0,
          status: "uploading"
        }
        session.attachments.push(attachObj)
        m.redraw()
        const formData = new FormData()
        formData.append("file", file)
        const xhr = new XMLHttpRequest()
        attachObj.xhr = xhr
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            attachObj.progress = Math.round((event.loaded / event.total) * 100)
            m.redraw()
          }
        }
        xhr.onload = () => {
          try {
            if (xhr.status >= 200 && xhr.status < 300) {
              const res = JSON.parse(xhr.responseText)
              if (res && res.id) {
                attachObj.id = res.id
                attachObj.url = res.url
                attachObj.status = "done"
                attachObj.progress = 100
                if (listId === targetListId) {
                  if (self) data.focusEditor = self
                  insertAtCursor(`[attachid:${res.id}] `)
                } else {
                  const curStr = session.inputText || ""
                  session.inputText = curStr + `[attachid:${res.id}] `
                  m.redraw()
                }
              }
            }
          } catch (err) {
            console.error("[ChatInputEditor] 解析附件上传响应失败:", err)
          }
        }
        xhr.onerror = () => {
          attachObj.status = "error"
          Notice.launch({
            msg: trs("输入框/提示/上传失败", {
              cn: `上传失败: ${file.name}`,
              en: `Upload failed: ${file.name}`
            })
          })
          m.redraw()
        }
        xhr.open("POST", "/api/attachments/set")
        xhr.send(formData)
      }
    },
    getListId() {
      return listId
    },
    setText(textStr) {
      const safeText = typeof textStr === "string" ? textStr : ""
      commitEdit(safeText, safeText.length, safeText.length, "atomic", false)
    },
    clear() {
      closeSlashMenu()
      rawTableStarts.clear()
      const session = data.getSessionState(listId)
      session.inputText = ""
      session.attachments = []
      session.quotes = []
      lastSyncedText = ""
      const edState = getSessionEditorState(listId, "")
      edState.undoStack = []
      edState.redoStack = []
      edState.cursorStart = 0
      edState.cursorEnd = 0
      edState.scrollTop = 0
      flushDraftPersist(listId)
      if (viewMode === "live") {
        syncLiveDom("", isFocused ? 0 : -1, true)
      } else if (rawTextareaDom) {
        rawTextareaDom.value = ""
      }
      m.redraw()
    },
    openSlashMenu,
    focus() {
      const curText = getCurrentText()
      const edState = getSessionEditorState(listId, curText)
      applySelectionToDom(curText, edState.cursorStart, edState.cursorEnd, true)
    },
    view({ attrs }) {
      currentAttrs = attrs || {}
      listId = attrs.listId || 0
      const textStr = getCurrentText()
      const edState = getSessionEditorState(listId, textStr)
      const charCount = textStr.length
      const canUndo = edState.undoStack.length > 0
      const canRedo = edState.redoStack.length > 0

      const editorFront = getColor("gray_1").front
      const subtleDivider = `color-mix(in srgb, ${editorFront} 12%, transparent)`
      const activePillBg = `color-mix(in srgb, ${getColor("main").back} 24%, transparent)`
      const hoverPillBg = `color-mix(in srgb, ${editorFront} 10%, transparent)`

      const wrapperStyle = {
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        ...attrs.style,
        minHeight: isExpanded ? `${getSize(62)}rem` : (attrs.style?.minHeight || `${getSize(20)}rem`),
        maxHeight: isExpanded ? `${getSize(100)}rem` : (attrs.style?.maxHeight || `${getSize(50)}rem`),
        padding: 0,
        outline: isFocused ? `${getSize(0.5)}rem solid ${getColor("main").back}` : "none"
      }

      const toolbarItems = [
        {
          icon: "TextBold",
          title: trs("输入框/工具栏/粗体", { cn: "粗体", en: "Bold" }),
          onclick: () => applyMarkdownWrap("**", "**", trs("输入框/占位符/粗体", { cn: "粗体文本", en: "bold" }))
        },
        {
          icon: "TextItalic",
          title: trs("输入框/工具栏/斜体", { cn: "斜体", en: "Italic" }),
          onclick: () => applyMarkdownWrap("*", "*", trs("输入框/占位符/斜体", { cn: "斜体文本", en: "italic" }))
        },
        {
          icon: "Strikethrough",
          title: trs("输入框/工具栏/删除线", { cn: "删除线", en: "Strikethrough" }),
          onclick: () => applyMarkdownWrap("~~", "~~", trs("输入框/占位符/删除线", { cn: "删除文本", en: "strike" }))
        },
        {
          icon: "Code",
          title: trs("输入框/工具栏/行内代码", { cn: "行内代码", en: "Inline Code" }),
          onclick: () => applyMarkdownWrap("`", "`", trs("输入框/占位符/代码", { cn: "代码", en: "code" }))
        },
        {
          icon: "Terminal",
          title: trs("输入框/工具栏/代码块", { cn: "代码块", en: "Code Block" }),
          onclick: () => applyMarkdownWrap("\n```\n", "\n```\n", trs("输入框/占位符/代码块", { cn: "代码内容", en: "code here" }))
        },
        {
          icon: "Quote",
          title: trs("输入框/工具栏/引用", { cn: "引用", en: "Quote" }),
          onclick: () => applyMarkdownWrap("\n> ", "\n", trs("输入框/占位符/引用", { cn: "引用内容", en: "quote" }))
        },
        {
          icon: "GridNine",
          title: trs("输入框/工具栏/表格", { cn: "插入表格", en: "Insert Table" }),
          onclick: () => insertNewTable()
        },
        {
          icon: "LinkOne",
          title: trs("输入框/工具栏/链接", { cn: "插入链接", en: "Insert Link" }),
          onclick: () => openInsertLinkDialog()
        },
        {
          icon: "ListTwo",
          title: trs("输入框/工具栏/无序列表", { cn: "无序列表", en: "Bullet List" }),
          onclick: () => applyMarkdownWrap("\n- ", "\n", trs("输入框/占位符/列表项", { cn: "列表项", en: "item" }))
        }
      ]

      return m("",
        {
          style: wrapperStyle,
          ondragenter: (e) => handleDragOverEvent(e),
          ondragover: (e) => handleDragOverEvent(e),
          ondrop: (e) => handleDropEvent(e)
        },
        [
          // 隐藏文件选择器（供斜杠 /附件 -> 上传新附件使用）
          m("input",
            {
              type: "file",
              multiple: true,
              style: {
                display: "none"
              },
              oncreate: (v) => {
                slashUploadInputDom = v.dom
              },
              onremove: () => {
                slashUploadInputDom = null
              },
              onchange: (e) => {
                if (e.target.files && e.target.files.length > 0 && self) {
                  self.addFiles(e.target.files)
                }
                e.target.value = ""
              }
            }
          ),

          // 顶部浮动提示 Toast
          showTip
            ? m("",
                {
                  style: {
                    position: "absolute",
                    bottom: isExpanded ? `${getSize(8)}rem` : `${getSize(3)}rem`,
                    left: "50%",
                    maxWidth: "85%",
                    transform: "translateX(-50%)",
                    background: getColor("yellow_1").back,
                    color: getColor("yellow_1").front,
                    padding: `${getSize(1)}rem ${getSize(3)}rem`,
                    borderRadius: `${getSize(8)}rem`,
                    fontSize: `${getSize(3)}rem`,
                    zIndex: 100,
                    pointerEvents: "none",
                    wordBreak: "break-word",
                    textAlign: "center"
                  }
                },
                tipText
              )
            : null,

          // 展开模式下的极简 Markdown 工具条（透明轻顶栏 + 内缩淡线，不裁切外框圆角）
          isExpanded
            ? m("",
                {
                  style: {
                    display: "flex",
                    flexWrap: "wrap",
                    gap: `${getSize(1)}rem`,
                    padding: `${getSize(2)}rem 0 ${getSize(1)}rem 0`,
                    margin: `0 ${getSize(4)}rem`,
                    borderBottom: `${getSize(0.25)}rem solid ${subtleDivider}`,
                    background: "transparent",
                    alignItems: "center"
                  }
                },
                toolbarItems.map((btn) =>
                  m("span",
                    {
                      title: btn.title,
                      style: {
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: `${getSize(1)}rem`,
                        borderRadius: `${getSize(2)}rem`,
                        color: editorFront,
                        opacity: 0.68
                      },
                      onpointerenter: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = hoverPillBg
                        e.currentTarget.style.opacity = "1"
                      },
                      onpointerleave: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = "transparent"
                        e.currentTarget.style.opacity = "0.68"
                      },
                      onpointerdown: (e) => e.preventDefault(),
                      onclick: btn.onclick
                    },
                    m.trust(window.iconPark.getIcon(btn.icon, {
                      fill: "currentColor",
                      size: `${getSize(4)}rem`
                    }))
                  )
                )
              )
            : null,

          // 核心编辑区容器（双模切换，各自保持稳定物理 DOM，绝不丢焦点）
          m("",
            {
              style: {
                position: "relative",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden"
              }
            },
            [
              // Live 模式占位符常驻挂载，仅切 display，绝不在首字输入时增删同级 DOM 节点
              m("",
                {
                  style: {
                    display: viewMode === "live" && !textStr ? "block" : "none",
                    position: "absolute",
                    top: isExpanded ? `${getSize(2)}rem` : `${getSize(3)}rem`,
                    left: `${getSize(4)}rem`,
                    right: `${getSize(4)}rem`,
                    color: editorFront,
                    opacity: 0.5,
                    fontSize: `${getSize(4)}rem`,
                    lineHeight: `${getSize(5)}rem`,
                    pointerEvents: "none",
                    userSelect: "none"
                  }
                },
                attrs.placeholder || ""
              ),

              viewMode === "raw"
                ? m("textarea",
                    {
                      placeholder: attrs.placeholder || "",
                      value: textStr,
                      oncreate: (v) => {
                        rawTextareaDom = v.dom
                        v.dom.value = textStr
                        if (edState.scrollTop > 0) v.dom.scrollTop = edState.scrollTop
                      },
                      onremove: () => {
                        rawTextareaDom = null
                      },
                      onfocus: () => {
                        isFocused = true
                        data.focusEditor = self
                        if (comData.data.get().targetChatListId !== listId) {
                          comData.data.edit((d) => {
                            d.targetChatListId = listId
                          })
                        }
                        m.redraw()
                      },
                      onblur: (e) => {
                        isFocused = false
                        isComposing = false
                        compositionBeforeSnapshot = null
                        edState.cursorStart = e.target.selectionStart
                        edState.cursorEnd = e.target.selectionEnd
                        edState.scrollTop = e.target.scrollTop
                        flushDraftPersist(listId)
                        m.redraw()
                      },
                      onscroll: (e) => {
                        e.redraw = false
                        edState.scrollTop = e.target.scrollTop
                      },
                      oncompositionstart: (e) => {
                        e.redraw = false
                        isComposing = true
                        captureCompositionBefore()
                      },
                      oncompositionend: (e) => {
                        e.redraw = false
                        isComposing = false
                        const targetDom = e.target
                        setTimeout(() => {
                          if (!targetDom) return
                          const val = targetDom.value
                          const pos = targetDom.selectionStart
                          const beforeSnap = compositionBeforeSnapshot
                          compositionBeforeSnapshot = null
                          commitEdit(val, pos, targetDom.selectionEnd, "atomic", false, beforeSnap, true)
                          updateSlashTrigger(val, pos)
                        }, 0)
                      },
                      onselect: (e) => {
                        e.redraw = false
                        edState.cursorStart = e.target.selectionStart
                        edState.cursorEnd = e.target.selectionEnd
                      },
                      oninput: (e) => {
                        e.redraw = false
                        const val = e.target.value
                        const pos = e.target.selectionStart
                        const endPos = e.target.selectionEnd
                        const prevLen = textStr.length
                        if (isComposing || e.isComposing || e.inputType === "insertCompositionText") {
                          captureCompositionBefore()
                          lastSyncedText = val
                          data.getSessionState(listId).inputText = val
                          edState.cursorStart = pos
                          edState.cursorEnd = endPos
                          return
                        }
                        const opType = val.length < prevLen ? "delete" : "insert"
                        commitEdit(val, pos, endPos, opType, false, null, true)
                        updateSlashTrigger(val, pos)
                      },
                      ondragenter: (e) => handleDragOverEvent(e),
                      ondragover: (e) => handleDragOverEvent(e),
                      ondrop: (e) => handleDropEvent(e),
                      onpaste: (e) => {
                        e.redraw = false
                        handlePasteEvent(e)
                      },
                      onkeydown: (e) => {
                        e.redraw = false
                        handleSharedKeydown(e, attrs)
                      },
                      style: {
                        width: "100%",
                        boxSizing: "border-box",
                        flex: 1,
                        resize: "none",
                        border: "none",
                        background: "transparent",
                        outline: "none",
                        color: editorFront,
                        fontFamily: "inherit",
                        fontSize: `${getSize(4)}rem`,
                        lineHeight: `${getSize(5)}rem`,
                        padding: `${isExpanded ? getSize(2) : getSize(3)}rem ${getSize(4)}rem ${getSize(2)}rem ${getSize(4)}rem`,
                        overflowY: "auto"
                      }
                    }
                  )
                : m(".article",
                    {
                      contenteditable: true,
                      onbeforeupdate: () => false,
                      oncreate: (v) => {
                        liveRootDom = v.dom
                        // 捕获阶段交互策略：
                        // - 预览态（rendered 行）：单击直接触发预览（不收起），长按切入该行编辑态
                        // - 编辑态（active 行原子标签）：单击保持编辑，长按或 Cmd/Ctrl + 单击触发预览
                        const LONG_PRESS_MS = 450
                        const LONG_PRESS_MOVE_PX = 8
                        let longPressTimer = null
                        let pressStartX = 0
                        let pressStartY = 0
                        let suppressNextClick = false
                        let suppressResetTimer = null
                        let guardResetTimer = null
                        let pendingPressIsRendered = false
                        let wasFocusedOnPress = false
                        let allowNativePreview = false

                        const findInteractiveTarget = (rawTarget) => {
                          if (isInsideAtomicWidget(rawTarget)) return null
                          const el = rawTarget && rawTarget.nodeType === Node.ELEMENT_NODE ? rawTarget : rawTarget?.parentElement
                          if (!el || typeof el.closest !== "function") return null
                          if (el.closest("[data-tag-edit]")) return null
                          const lineDiv = el.closest("[data-block-type='line']")
                          const interactiveEl = el.closest("[onclick], a[href], img, [data-tag-raw]")
                          if (!interactiveEl || !lineDiv) return null
                          return { el, lineDiv, interactiveEl }
                        }

                        const enterLineEditMode = (lineDiv) => {
                          const lineIdx = Number(lineDiv.dataset.startLine || 0)
                          const curText = getCurrentText()
                          const lineStr = curText.split("\n")[lineIdx] || ""
                          const targetOffset = lineColToOffset(curText, lineIdx, lineStr.length)
                          applySelectionToDom(curText, targetOffset, targetOffset, true)
                        }

                        const launchAtomicTagPreview = (atomicTagEl) => {
                          const rawTag = atomicTagEl.dataset.tagRaw || ""
                          const mTag = /^\[(filePath|attachid|appid|refAppid|codeQuote|elementId|msg|compress|skill):([^\]]+)\]$/i.exec(rawTag)
                          if (!mTag) return
                          const tType = mTag[1].toLowerCase()
                          const tVal = mTag[2]
                          const isImgPath = (s) => /\.(png|jpe?g|webp|svg|gif|bmp|ico)$/i.test(String(s || "").split("?")[0].split("#")[0])
                          if (tType === "attachid") {
                            const isImg = isImgPath(tVal) || !tVal.includes(".")
                            const url = tVal.includes(".") ? `/attachment/${tVal}` : `/attachment/${tVal}.png`
                            const fullImgUrl = `${window.location.origin}${url}`
                            settingData.fnCall("appLaunch", [isImg ? "imageViewer" : "editor", { data: isImg ? { currentImagePath: fullImgUrl } : { filePath: url, readOnly: true, singleInstance: true } }])
                          } else if (tType === "filepath") {
                            const isImg = isImgPath(tVal)
                            settingData.fnCall("appLaunch", [isImg ? "imageViewer" : "editor", { data: isImg ? { currentImagePath: tVal } : { filePath: tVal, readOnly: true, singleInstance: true } }])
                          } else if (tType === "appid" || tType === "refappid") {
                            settingData.fnCall("appLaunch", [tVal, { data: {} }])
                          }
                        }

                        const triggerInteractivePreview = (interactiveEl) => {
                          const atomicTagEl = interactiveEl.closest("[data-tag-raw]")
                          if (atomicTagEl) {
                            launchAtomicTagPreview(atomicTagEl)
                            return
                          }
                          const nativeTarget = interactiveEl.closest("[onclick], a[href]") || interactiveEl
                          allowNativePreview = true
                          try {
                            nativeTarget.click()
                          } finally {
                            allowNativePreview = false
                          }
                        }

                        const clearLongPress = () => {
                          if (longPressTimer) {
                            clearTimeout(longPressTimer)
                            longPressTimer = null
                          }
                        }

                        const clearGuardResetTimer = () => {
                          if (guardResetTimer) {
                            clearTimeout(guardResetTimer)
                            guardResetTimer = null
                          }
                        }

                        const capturePointerDownHandler = (e) => {
                          if (e.pointerType === "mouse" && e.button !== 0) return
                          clearLongPress()
                          clearGuardResetTimer()
                          const hit = findInteractiveTarget(e.target)
                          if (!hit) {
                            pendingPressIsRendered = false
                            isInteractivePressGuard = false
                            return
                          }
                          const isRenderedLine = hit.lineDiv.dataset.mode === "rendered"
                          pendingPressIsRendered = isRenderedLine
                          wasFocusedOnPress = isFocused
                          // 桌面端阻止 pointerdown 默认聚焦、选区变更与原生图片拖拽，避免预览态点击/长按提前收起预览行
                          if (e.pointerType !== "touch") {
                            e.preventDefault()
                          }
                          isInteractivePressGuard = true
                          pressStartX = e.clientX
                          pressStartY = e.clientY
                          longPressTimer = setTimeout(() => {
                            longPressTimer = null
                            suppressNextClick = true
                            if (suppressResetTimer) clearTimeout(suppressResetTimer)
                            suppressResetTimer = setTimeout(() => {
                              suppressNextClick = false
                              isInteractivePressGuard = false
                              suppressResetTimer = null
                            }, 600)
                            if (isRenderedLine) {
                              // 预览态长按：切入该行编辑态，并抑制松手后的 click 避免同时弹窗
                              isInteractivePressGuard = false
                              enterLineEditMode(hit.lineDiv)
                            } else {
                              if (!wasFocusedOnPress && document.activeElement === liveRootDom) {
                                liveRootDom.blur()
                              }
                              triggerInteractivePreview(hit.interactiveEl)
                            }
                          }, LONG_PRESS_MS)
                        }

                        const capturePointerMoveHandler = (e) => {
                          if (!longPressTimer) return
                          if (Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY) > LONG_PRESS_MOVE_PX) {
                            clearLongPress()
                            pendingPressIsRendered = false
                            if (!suppressNextClick) isInteractivePressGuard = false
                          }
                        }

                        const capturePointerUpHandler = () => {
                          clearLongPress()
                          if (suppressNextClick) return
                          if (pendingPressIsRendered) {
                            // 预览态短按抬起：短暂维持保护至 click 结束，防止移动端 touchend 触发 focus/selectionchange 收起预览
                            clearGuardResetTimer()
                            guardResetTimer = setTimeout(() => {
                              isInteractivePressGuard = false
                              pendingPressIsRendered = false
                              guardResetTimer = null
                            }, 400)
                          } else {
                            isInteractivePressGuard = false
                          }
                        }

                        const capturePointerCancelHandler = () => {
                          clearLongPress()
                          clearGuardResetTimer()
                          pendingPressIsRendered = false
                          if (!suppressNextClick) isInteractivePressGuard = false
                        }

                        const captureContextMenuHandler = (e) => {
                          if (longPressTimer || suppressNextClick) {
                            e.preventDefault()
                            e.stopPropagation()
                          }
                        }

                        const captureClickHandler = (e) => {
                          if (allowNativePreview) return
                          if (suppressNextClick) {
                            suppressNextClick = false
                            isInteractivePressGuard = false
                            pendingPressIsRendered = false
                            clearGuardResetTimer()
                            if (suppressResetTimer) {
                              clearTimeout(suppressResetTimer)
                              suppressResetTimer = null
                            }
                            e.preventDefault()
                            e.stopPropagation()
                            return
                          }

                          const hit = findInteractiveTarget(e.target)
                          if (!hit) return

                          const isRenderedLine = hit.lineDiv.dataset.mode === "rendered"
                          if (isRenderedLine) {
                            // 预览态单击：直接放行 format.js 原生预览 onclick / 链接跳转，且不收起预览行
                            clearGuardResetTimer()
                            const shouldBlurAfterPreview = !wasFocusedOnPress
                            pendingPressIsRendered = false
                            setTimeout(() => {
                              if (shouldBlurAfterPreview && document.activeElement === liveRootDom) {
                                liveRootDom.blur()
                              }
                              isInteractivePressGuard = false
                            }, 0)
                            return
                          }

                          const isModifier = Boolean(e.metaKey || e.ctrlKey)
                          const atomicTagEl = hit.el.closest("[data-tag-raw]")
                          if (!isModifier) {
                            e.preventDefault()
                            e.stopPropagation()
                            enterLineEditMode(hit.lineDiv)
                            return
                          }

                          if (atomicTagEl) {
                            e.preventDefault()
                            e.stopPropagation()
                            launchAtomicTagPreview(atomicTagEl)
                          }
                        }

                        v.dom._owoCleanupCapture = () => {
                          clearLongPress()
                          clearGuardResetTimer()
                          isInteractivePressGuard = false
                          pendingPressIsRendered = false
                          if (suppressResetTimer) {
                            clearTimeout(suppressResetTimer)
                            suppressResetTimer = null
                          }
                          v.dom.removeEventListener("click", captureClickHandler, true)
                          v.dom.removeEventListener("pointerdown", capturePointerDownHandler, true)
                          v.dom.removeEventListener("pointermove", capturePointerMoveHandler, true)
                          v.dom.removeEventListener("pointerup", capturePointerUpHandler, true)
                          v.dom.removeEventListener("pointercancel", capturePointerCancelHandler, true)
                          v.dom.removeEventListener("contextmenu", captureContextMenuHandler, true)
                        }
                        v.dom.addEventListener("click", captureClickHandler, true)
                        v.dom.addEventListener("pointerdown", capturePointerDownHandler, true)
                        v.dom.addEventListener("pointermove", capturePointerMoveHandler, true)
                        v.dom.addEventListener("pointerup", capturePointerUpHandler, true)
                        v.dom.addEventListener("pointercancel", capturePointerCancelHandler, true)
                        v.dom.addEventListener("contextmenu", captureContextMenuHandler, true)
                        syncLiveDom(textStr, isFocused ? offsetToLineCol(textStr, edState.cursorStart).line : -1, true)
                        if (edState.scrollTop > 0) v.dom.scrollTop = edState.scrollTop
                      },
                      onremove: (v) => {
                        if (v.dom && v.dom._owoCleanupCapture) {
                          v.dom._owoCleanupCapture()
                          v.dom._owoCleanupCapture = null
                        }
                        liveRootDom = null
                      },
                      onfocus: (e) => {
                        if (isInsideAtomicWidget(e.target) || isInteractivePressGuard) return
                        isFocused = true
                        data.focusEditor = self
                        if (comData.data.get().targetChatListId !== listId) {
                          comData.data.edit((d) => {
                            d.targetChatListId = listId
                          })
                        }
                        const cur = getCurrentText()
                        const selOffsets = readLiveSelectionOffsets(cur)
                        const targetLine = selOffsets
                          ? offsetToLineCol(cur, selOffsets.start).line
                          : offsetToLineCol(cur, edState.cursorStart).line
                        syncLiveDom(cur, targetLine)
                        m.redraw()
                      },
                      onpointerdown: (e) => {
                        e.redraw = false
                        const editBtnEl = e.target && typeof e.target.closest === "function" ? e.target.closest("[data-tag-edit]") : null
                        if (editBtnEl) {
                          e.preventDefault()
                          e.stopPropagation()
                        }
                      },
                      onclick: (e) => {
                        e.redraw = false
                        const editBtnEl = e.target && typeof e.target.closest === "function" ? e.target.closest("[data-tag-edit]") : null
                        if (!editBtnEl || !liveRootDom) return
                        e.preventDefault()
                        e.stopPropagation()
                        const lineDiv = editBtnEl.closest("[data-block-type='line']")
                        if (!lineDiv) return
                        const lineIdx = Number(lineDiv.dataset.startLine || 0)
                        const tagIdx = Number(editBtnEl.dataset.tagIdx || 0)
                        const curText = getCurrentText()
                        const lineStr = curText.split("\n")[lineIdx] || ""
                        const targetTag = findSystemTagsInLine(lineStr).find((t) => t.idx === tagIdx)
                        if (!targetTag) return
                        editingTagState = { line: lineIdx, tagIdx }
                        const caretOffset = lineColToOffset(curText, lineIdx, Math.max(targetTag.start + 1, targetTag.end - 1))
                        applySelectionToDom(curText, caretOffset, caretOffset, true)
                      },
                      onblur: (e) => {
                        // 若焦点移入同一编辑器内部的表格单元格，不视为整体失焦
                        if (e.relatedTarget && liveRootDom && liveRootDom.contains(e.relatedTarget)) {
                          return
                        }
                        isFocused = false
                        isComposing = false
                        compositionBeforeSnapshot = null
                        editingTagState = null
                        const cur = getCurrentText()
                        const selOffsets = readLiveSelectionOffsets(cur)
                        if (selOffsets) {
                          edState.cursorStart = selOffsets.start
                          edState.cursorEnd = selOffsets.end
                        }
                        if (liveRootDom) edState.scrollTop = liveRootDom.scrollTop
                        syncLiveDom(cur, -1)
                        flushDraftPersist(listId)
                        m.redraw()
                      },
                      onscroll: (e) => {
                        e.redraw = false
                        edState.scrollTop = e.target.scrollTop
                      },
                      onbeforeinput: (e) => {
                        e.redraw = false
                        if (isInsideAtomicWidget(e.target)) return
                        // 若光标意外落在 rendered 态块内，输入前立刻切为可编辑 active 态
                        if (!isComposing && !e.isComposing && liveRootDom) {
                          const sel = window.getSelection()
                          if (sel && sel.rangeCount > 0 && liveRootDom.contains(sel.anchorNode)) {
                            let lineDiv = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement
                            while (lineDiv && lineDiv.parentElement !== liveRootDom) {
                              lineDiv = lineDiv.parentElement
                            }
                            if (lineDiv && lineDiv.dataset.blockType === "line" && lineDiv.dataset.mode === "rendered") {
                              const cur = getCurrentText()
                              const selOffsets = readLiveSelectionOffsets(cur)
                              if (selOffsets) {
                                applySelectionToDom(cur, selOffsets.start, selOffsets.end, false)
                              }
                            }
                          }
                        }
                      },
                      oncompositionstart: (e) => {
                        e.redraw = false
                        if (isInsideAtomicWidget(e.target)) return
                        isComposing = true
                        captureCompositionBefore()
                      },
                      oncompositionend: (e) => {
                        e.redraw = false
                        if (isInsideAtomicWidget(e.target)) return
                        isComposing = false
                        // 对齐 ProseMirror / CodeMirror 6：延后一个 macrotask 等 Chromium 彻底结束 IME 事务后再同步 DOM
                        setTimeout(() => {
                          syncLiveInputToModel(null, true)
                        }, 0)
                      },
                      oninput: (e) => {
                        e.redraw = false
                        if (isInsideAtomicWidget(e.target)) return
                        syncLiveInputToModel(e, false)
                      },
                      ondragenter: (e) => handleDragOverEvent(e),
                      ondragover: (e) => handleDragOverEvent(e),
                      ondrop: (e) => handleDropEvent(e),
                      onpaste: (e) => {
                        e.redraw = false
                        if (isInsideAtomicWidget(e.target)) return
                        handlePasteEvent(e)
                      },
                      onkeydown: (e) => {
                        e.redraw = false
                        if (isInsideAtomicWidget(e.target)) return
                        handleSharedKeydown(e, attrs)
                      },
                      style: {
                        width: "100%",
                        boxSizing: "border-box",
                        flex: 1,
                        overflowY: "auto",
                        outline: "none",
                        color: editorFront,
                        fontSize: `${getSize(4)}rem`,
                        lineHeight: `${getSize(5)}rem`,
                        padding: `${isExpanded ? getSize(2) : getSize(3)}rem ${getSize(4)}rem ${getSize(2)}rem ${getSize(4)}rem`,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        cursor: "text"
                      }
                    }
                  )
            ]
          ),

          // 底部轻量状态与操作栏（左右视觉量级对齐，内缩淡线分隔正文）
          m("",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: `${getSize(1)}rem`,
                margin: `0 ${getSize(4)}rem`,
                padding: `${getSize(1)}rem 0 ${getSize(2)}rem 0`,
                borderTop: `${getSize(0.25)}rem solid ${subtleDivider}`,
                background: "transparent",
                fontSize: `${getSize(3)}rem`,
                userSelect: "none"
              }
            },
            [
              // 左侧：字数统计 + 撤销/重做快捷按钮
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: `${getSize(2)}rem`
                  }
                },
                [
                  m("span",
                    {
                      style: {
                        color: editorFront,
                        opacity: 0.65
                      }
                    },
                    trs("输入框/字数", {
                      cn: `${charCount} 字`,
                      en: `${charCount} chars`
                    })
                  ),
                  m("span",
                    {
                      title: trs("输入框/按钮/撤销", { cn: "撤销 (Cmd/Ctrl+Z)", en: "Undo (Cmd/Ctrl+Z)" }),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        cursor: canUndo ? "pointer" : "default",
                        opacity: canUndo ? 0.72 : 0.3,
                        padding: `${getSize(1 / 2)}rem`,
                        borderRadius: `${getSize(2)}rem`
                      },
                      onpointerenter: (e) => {
                        e.redraw = false
                        if (canUndo) {
                          e.currentTarget.style.background = hoverPillBg
                          e.currentTarget.style.opacity = "1"
                        }
                      },
                      onpointerleave: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = "transparent"
                        e.currentTarget.style.opacity = canUndo ? "0.72" : "0.3"
                      },
                      onpointerdown: (e) => e.preventDefault(),
                      onclick: () => {
                        if (canUndo) performUndo()
                      }
                    },
                    m.trust(window.iconPark.getIcon("Undo", {
                      fill: editorFront,
                      size: `${getSize(4)}rem`
                    }))
                  ),
                  m("span",
                    {
                      title: trs("输入框/按钮/重做", { cn: "重做 (Cmd/Ctrl+Shift+Z)", en: "Redo (Cmd/Ctrl+Shift+Z)" }),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        cursor: canRedo ? "pointer" : "default",
                        opacity: canRedo ? 0.72 : 0.3,
                        padding: `${getSize(1 / 2)}rem`,
                        borderRadius: `${getSize(2)}rem`
                      },
                      onpointerenter: (e) => {
                        e.redraw = false
                        if (canRedo) {
                          e.currentTarget.style.background = hoverPillBg
                          e.currentTarget.style.opacity = "1"
                        }
                      },
                      onpointerleave: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = "transparent"
                        e.currentTarget.style.opacity = canRedo ? "0.72" : "0.3"
                      },
                      onpointerdown: (e) => e.preventDefault(),
                      onclick: () => {
                        if (canRedo) performRedo()
                      }
                    },
                    m.trust(window.iconPark.getIcon("Redo", {
                      fill: editorFront,
                      size: `${getSize(4)}rem`
                    }))
                  )
                ]
              ),

              // 右侧：展开 / 历史 / 双模切换（轻量透明控件，激活态柔和浅高亮，不再与外栏撞脸）
              m("",
                {
                  style: {
                    display: "flex",
                    gap: `${getSize(1)}rem`,
                    alignItems: "center",
                    flexWrap: "wrap"
                  }
                },
                [
                  m("span",
                    {
                      title: isExpanded
                        ? trs("输入框/提示/收起高度", { cn: "收起输入框", en: "Shrink editor" })
                        : trs("输入框/提示/展开高度", { cn: "展开为文章高度", en: "Expand editor" }),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: `${getSize(1)}rem`,
                        cursor: "pointer",
                        background: isExpanded ? activePillBg : "transparent",
                        color: editorFront,
                        opacity: isExpanded ? 1 : 0.72,
                        padding: `${getSize(1 / 2)}rem ${getSize(2)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        fontSize: `${getSize(3)}rem`
                      },
                      onpointerenter: (e) => {
                        e.redraw = false
                        if (!isExpanded) e.currentTarget.style.background = hoverPillBg
                        e.currentTarget.style.opacity = "1"
                      },
                      onpointerleave: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = isExpanded ? activePillBg : "transparent"
                        e.currentTarget.style.opacity = isExpanded ? "1" : "0.72"
                      },
                      onclick: () => {
                        isExpanded = !isExpanded
                        if (isExpanded) {
                          triggerToast(trs("输入框/提示/展开模式", {
                            cn: "已进入文章展开模式：Enter 键换行，Cmd/Ctrl/Shift + Enter 发送消息喵~",
                            en: "Expanded mode: Enter for new line, Cmd/Ctrl/Shift + Enter to send."
                          }))
                        }
                        m.redraw()
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon(isExpanded ? "OffScreenOne" : "FullScreenOne", {
                        fill: editorFront,
                        size: `${getSize(4)}rem`
                      })),
                      isExpanded
                        ? trs("输入框/按钮/收起", { cn: "收起", en: "Shrink" })
                        : trs("输入框/按钮/展开", { cn: "展开", en: "Expand" })
                    ]
                  ),

                  m("span",
                    {
                      title: trs("输入框/按钮/提示历史", { cn: "选择历史消息", en: "Select history message" }),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: `${getSize(1)}rem`,
                        cursor: "pointer",
                        background: "transparent",
                        color: editorFront,
                        opacity: 0.72,
                        padding: `${getSize(1 / 2)}rem ${getSize(2)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        fontSize: `${getSize(3)}rem`
                      },
                      onpointerenter: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = hoverPillBg
                        e.currentTarget.style.opacity = "1"
                      },
                      onpointerleave: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = "transparent"
                        e.currentTarget.style.opacity = "0.72"
                      },
                      onclick: () => {
                        data.loadHistory()
                        const historyArr = data.inputHistory
                        if (!historyArr || historyArr.length === 0) {
                          Notice.launch({
                            msg: trs("输入框/提示/暂无历史", { cn: "暂无输入历史记录喵", en: "No input history yet" })
                          })
                          return
                        }
                        Notice.launch({
                          tip: trs("输入框/弹窗/选择历史", { cn: "选择输入历史", en: "Select Input History" }),
                          content: {
                            view(vnode) {
                              return m("",
                                {
                                  style: {
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: `${getSize(1)}rem`,
                                    maxHeight: `${getSize(50)}rem`,
                                    overflowY: "auto",
                                    padding: `${getSize(2)}rem`
                                  }
                                },
                                historyArr.map((hStr, idx) =>
                                  m(Box,
                                    {
                                      key: idx,
                                      isBtn: true,
                                      style: {
                                        margin: 0,
                                        textAlign: "left",
                                        whiteSpace: "pre-wrap",
                                        fontSize: `${getSize(4)}rem`
                                      },
                                      onclick: () => {
                                        commitEdit(hStr, hStr.length, hStr.length, "atomic", true)
                                        const noticeConfig = vnode.attrs.noticeConfig
                                        if (noticeConfig) {
                                          Notice.closeTab(noticeConfig.sign)
                                        }
                                      }
                                    },
                                    `${idx + 1}. ${hStr.slice(0, 80)}${hStr.length > 80 ? "..." : ""}`
                                  )
                                )
                              )
                            }
                          }
                        })
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon("History", {
                        fill: editorFront,
                        size: `${getSize(4)}rem`
                      })),
                      trs("输入框/按钮/历史", { cn: "历史", en: "History" })
                    ]
                  ),

                  m("span",
                    {
                      title: viewMode === "live"
                        ? trs("输入框/提示/切纯文本", { cn: "当前所见即所得模式，点击切换为纯文本源码", en: "Switch to raw Markdown mode" })
                        : trs("输入框/提示/切所见即所得", { cn: "当前纯文本源码模式，点击切换为所见即所得", en: "Switch to live preview mode" }),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: `${getSize(1)}rem`,
                        cursor: "pointer",
                        background: viewMode === "live" ? activePillBg : "transparent",
                        color: editorFront,
                        opacity: viewMode === "live" ? 1 : 0.72,
                        padding: `${getSize(1 / 2)}rem ${getSize(2)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        fontSize: `${getSize(3)}rem`
                      },
                      onpointerenter: (e) => {
                        e.redraw = false
                        if (viewMode !== "live") e.currentTarget.style.background = hoverPillBg
                        e.currentTarget.style.opacity = "1"
                      },
                      onpointerleave: (e) => {
                        e.redraw = false
                        e.currentTarget.style.background = viewMode === "live" ? activePillBg : "transparent"
                        e.currentTarget.style.opacity = viewMode === "live" ? "1" : "0.72"
                      },
                      onclick: () => {
                        closeSlashMenu()
                        viewMode = viewMode === "live" ? "raw" : "live"
                        m.redraw()
                        requestAnimationFrame(() => {
                          applySelectionToDom(getCurrentText(), edState.cursorStart, edState.cursorEnd, true)
                        })
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon(viewMode === "live" ? "MagicWand" : "FileCode", {
                        fill: editorFront,
                        size: `${getSize(4)}rem`
                      })),
                      viewMode === "live"
                        ? trs("输入框/按钮/所见即所得", { cn: "所见即所得", en: "Live" })
                        : trs("输入框/按钮/纯文本", { cn: "纯文本", en: "Raw" })
                    ]
                  )
                ]
              )
            ]
          )
        ]
      )
    }
  }
}
