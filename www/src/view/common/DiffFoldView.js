import m from "mithril"
import Tag from "./tag.js"
import getColor from "./getColor.js"

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

      const ops = computeDiff(originalContent.split(/\r?\n/), proposedContent.split(/\r?\n/))
      const segments = buildSegments(ops, context)
      const changeBlocks = segments.filter(s => s.type === "show" && s.hasChange)

      if (changeBlocks.length === 0) {
        return m("",
          {
            style: {
              padding: "1rem",
              margin: "0.5rem 0",
              color: getColor("gray_4").front,
              fontSize: "1.2rem"
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
              fontSize: "1.2rem",
              background: color ? getColor(color).back : "transparent",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all"
            }
          },
          [
            m("span",
              {
                style: {
                  width: "4.5rem",
                  minWidth: "4.5rem",
                  textAlign: "right",
                  marginRight: "0.8rem",
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
            margin: "0.5rem 0",
            borderRadius: "1rem",
            background: getColor("gray_4").back
          }
        },
        [
          m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                margin: "0.5rem",
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
                    fontSize: "1.2rem",
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
                          padding: "0.3rem 0.5rem",
                          margin: "0",
                          background: getColor("gray_2").back,
                          color: getColor("gray_2").front,
                          fontSize: "1.2rem",
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
              return m("",
                {
                  key: `show-${segIdx}`,
                  id: changeIdx >= 0 ? `diff-fold-${fileId}-change-${changeIdx}` : null,
                  style: {
                    display: "flex",
                    flexDirection: "column"
                  }
                },
                seg.ops.map(op => renderLine(op))
              )
            })
          )
        ]
      )
    }
  }
}
