import m from "/@npm/mithril.js"
import Tag from "./tag.js"
import getColor from "./getColor.js"
import { trs } from "./i18n.js"
import getSize from "./getSize.js"

// 行级 LCS 差异算法（O(n*m)，超大文件降级为逐行对比）
function computeDiff(origLines, propLines) {
  const n = origLines.length
  const m = propLines.length

  if (n * m > 4000000) {
    return computeSimpleDiff(origLines, propLines)
  }

  const W = m + 1
  const dp = new Int32Array((n + 1) * W)
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (origLines[i - 1] === propLines[j - 1]) {
        dp[i * W + j] = dp[(i - 1) * W + (j - 1)] + 1
      } else {
        const a = dp[(i - 1) * W + j]
        const b = dp[i * W + (j - 1)]
        dp[i * W + j] = a > b ? a : b
      }
    }
  }

  const ops = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (origLines[i - 1] === propLines[j - 1]) {
      ops.push({ type: "same", text: origLines[i - 1], orig: i - 1, prop: j - 1 })
      i--
      j--
    } else if (dp[(i - 1) * W + j] >= dp[i * W + (j - 1)]) {
      ops.push({ type: "del", text: origLines[i - 1], orig: i - 1, prop: -1 })
      i--
    } else {
      ops.push({ type: "add", text: propLines[j - 1], orig: -1, prop: j - 1 })
      j--
    }
  }
  while (i > 0) {
    ops.push({ type: "del", text: origLines[i - 1], orig: i - 1, prop: -1 })
    i--
  }
  while (j > 0) {
    ops.push({ type: "add", text: propLines[j - 1], orig: -1, prop: j - 1 })
    j--
  }
  ops.reverse()
  return ops
}

// 降级：逐行对比（超大文件）
function computeSimpleDiff(origLines, propLines) {
  const ops = []
  const len = Math.max(origLines.length, propLines.length)
  for (let k = 0; k < len; k++) {
    const o = origLines[k]
    const p = propLines[k]
    if (o === undefined) {
      ops.push({ type: "add", text: p, orig: -1, prop: k })
    } else if (p === undefined) {
      ops.push({ type: "del", text: o, orig: k, prop: -1 })
    } else if (o === p) {
      ops.push({ type: "same", text: o, orig: k, prop: k })
    } else {
      ops.push({ type: "del", text: o, orig: k, prop: -1 })
      ops.push({ type: "add", text: p, orig: -1, prop: k })
    }
  }
  return ops
}

// 构建显示段（变化块 + 上下文）与折叠段
function buildSegments(ops, context) {
  const show = new Array(ops.length).fill(false)
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== "same") {
      for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) {
        show[k] = true
      }
    }
  }

  const segments = []
  let i = 0
  while (i < ops.length) {
    if (show[i]) {
      let j = i
      while (j < ops.length && show[j]) j++
      const segOps = ops.slice(i, j)
      segments.push({ type: "show", ops: segOps, hasChange: segOps.some(op => op.type !== "same") })
      i = j
    } else {
      let j = i
      while (j < ops.length && !show[j]) j++
      segments.push({ type: "fold", lineCount: j - i, ops: ops.slice(i, j) })
      i = j
    }
  }
  return segments
}

export default () => {
  let expandedFold = {}
  let currentChange = 0

  return {
    oninit() {
      expandedFold = {}
      currentChange = 0
    },
    view({ attrs }) {
      const originalContent = attrs.originalContent || ""
      const proposedContent = attrs.proposedContent || ""
      const fileId = attrs.fileId || "diff"
      const context = attrs.context || 3
      const edits = attrs.edits

      const ops = computeDiff(originalContent.split(/\r?\n/), proposedContent.split(/\r?\n/))
      const segments = buildSegments(ops, context)
      const changeBlocks = segments.filter(s => s.type === "show" && s.hasChange)

      if (changeBlocks.length === 0) {
        return m("",
          {
            style: {
              padding: `${getSize(3)}rem`,
              margin: `${getSize(1)}rem 0`,
              color: getColor("gray_4").front,
              fontSize: `${getSize(3)}rem`
            }
          },
          "文件无差异"
        )
      }

      const jumpTo = (idx) => {
        currentChange = Math.max(0, Math.min(changeBlocks.length - 1, idx))
        m.redraw()
        setTimeout(() => {
          const el = document.getElementById(`diff-fold-${fileId}-change-${currentChange}`)
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        }, 50)
      }

      const renderLine = (op) => {
        const isDel = op.type === "del"
        const isAdd = op.type === "add"
        const color = isDel ? "pink_1" : (isAdd ? "green_1" : null)
        const lineNo = isDel ? op.orig + 1 : (isAdd ? op.prop + 1 : op.orig + 1)
        const sign = isDel ? "-" : (isAdd ? "+" : " ")
        return m("",
          {
            style: {
              display: "flex",
              fontFamily: "monospace",
              fontSize: `${getSize(3)}rem`,
              background: color ? getColor(color).back : "transparent",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all"
            }
          },
          [
            m("span",
              {
                style: {
                  width: `${getSize(11)}rem`,
                  minWidth: `${getSize(11)}rem`,
                  textAlign: "right",
                  marginRight: `${getSize(2)}rem`,
                  color: color ? getColor(color).front : getColor("gray_4").front,
                  userSelect: "none"
                }
              },
              `${sign}${lineNo}`
            ),
            m("span",
              {
                style: {
                  flex: 1,
                  color: color ? getColor(color).front : getColor("gray_4").front
                }
              },
              op.text || " "
            )
          ]
        )
      }

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            margin: `${getSize(1)}rem 0`,
            borderRadius: `${getSize(3)}rem`,
            background: getColor("gray_4").back
          }
        },
        [
          m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: `${getSize(1)}rem`,
                margin: `${getSize(1)}rem`,
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: getColor("gray_4").back
              }
            },
            [
              m(Tag,
                {
                  isBtn: true,
                  color: "main",
                  styleExt: { cursor: "pointer" },
                  onclick: () => jumpTo(currentChange - 1)
                },
                "上一处"
              ),
              m(Tag,
                {
                  isBtn: true,
                  color: "main",
                  styleExt: { cursor: "pointer" },
                  onclick: () => jumpTo(currentChange + 1)
                },
                "下一处"
              ),
              m("span",
                {
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    color: getColor("gray_4").front
                  }
                },
                `${currentChange + 1} / ${changeBlocks.length}`
              )
            ]
          ),
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column"
              }
            },
            segments.map((seg, segIdx) => {
              if (seg.type === "fold") {
                const isExpanded = !!expandedFold[segIdx]
                return m("",
                  { key: `fold-${segIdx}` },
                  [
                    m("",
                      {
                        style: {
                          textAlign: "center",
                          padding: `${getSize(1)}rem ${getSize(1)}rem`,
                          margin: "0",
                          background: getColor("gray_2").back,
                          color: getColor("gray_2").front,
                          fontSize: `${getSize(3)}rem`,
                          cursor: "pointer",
                          userSelect: "none"
                        },
                        onclick: () => {
                          expandedFold[segIdx] = !isExpanded
                        }
                      },
                      isExpanded ? `---- 点击折叠 ${seg.lineCount} 行 ----` : `---- 已折叠 ${seg.lineCount} 行，点击展开 ----`
                    ),
                    isExpanded ? seg.ops.map(op => renderLine(op)) : null
                  ]
                )
              }
              const changeIdx = changeBlocks.indexOf(seg)
              const renderedEdits = new Set()
              return m("",
                {
                  key: `show-${segIdx}`,
                  id: changeIdx >= 0 ? `diff-fold-${fileId}-change-${changeIdx}` : null,
                  style: {
                    display: "flex",
                    flexDirection: "column"
                  }
                },
                seg.ops.map(op => {
                  let matchedEdit = null
                  if (edits && edits.length > 0) {
                    if (op.type === "del") {
                      const curLine = op.orig + 1
                      matchedEdit = edits.find(e => !renderedEdits.has(e) && e.origStartLine === curLine)
                    } else if (op.type === "add") {
                      const curLine = op.prop + 1
                      matchedEdit = edits.find(e => !renderedEdits.has(e) && e.modifiedStartLine === curLine)
                    }
                  }

                  if (matchedEdit) {
                    renderedEdits.add(matchedEdit)
                  }

                  const reasonBanner = matchedEdit && matchedEdit.reason
                    ? m("",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: `${getSize(2)}rem`,
                          padding: `${getSize(1)}rem ${getSize(2)}rem`,
                          margin: `${getSize(1)}rem 0`,
                          borderRadius: `${getSize(2)}rem`,
                          background: getColor("blue_1").back,
                          color: getColor("blue_1").front,
                          fontSize: `${getSize(3)}rem`
                        }
                      },
                      [
                        m("span",
                          {
                            style: {
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: getColor("blue_1").front,
                              color: getColor("blue_1").back,
                              padding: `${getSize(0.5)}rem ${getSize(1)}rem`,
                              borderRadius: `${getSize(1)}rem`,
                              flexShrink: 0
                            }
                          },
                          m.trust(window.iconPark.getIcon("Edit", { size: `${getSize(3)}rem`, fill: getColor("blue_1").back }))
                        ),
                        m("span",
                          {
                            style: {
                              flex: 1,
                              wordBreak: "break-all",
                              overflowWrap: "break-word"
                            }
                          },
                          matchedEdit.reason
                        )
                      ]
                    )
                    : null

                  return [
                    reasonBanner,
                    renderLine(op)
                  ]
                })
              )
            })
          )
        ]
      )
    }
  }
}
