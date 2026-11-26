// 笔记与网点图查看器（外层默认 Box 铺底，网点图与每条笔记均可收纳/展开）

import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import IconTag from "../common/iconTag.js"
import mermaid from "/@npm/mermaid.js"
import format from "../common/format.js"
import settingData from "../setting/settingData.js"

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "monospace",
  flowchart: {
    htmlLabels: false
  },
  themeVariables: {
    primaryColor: getColor("main").back,
    primaryTextColor: getColor("main").front,
    lineColor: getColor("main").back
  }
})

// 将网点图节点与连线编译为 Mermaid 源码
const buildMermaidCode = (graph) => {
  if (!graph || !graph.nodes || Object.keys(graph.nodes).length === 0) {
    return ""
  }
  let codeStr = "graph TD\n"
  for (const idStr in graph.nodes) {
    const labelStr = (graph.nodes[idStr].label || "").replace(/"/g, "'")
    codeStr += `  ${idStr}["${labelStr}"]\n`
  }
  if (graph.links) {
    graph.links.forEach(link => {
      const fromStr = link.from || link.source
      const toStr = link.to || link.target
      if (fromStr && toStr) {
        codeStr += `  ${fromStr} --> ${toStr}\n`
      }
    })
  }
  return codeStr
}

// 绝对几何扁平化处理器：将 Mermaid 嵌套图元转换为矢量图编辑器可识别的纯净 SVG text
const flattenMermaidSvgToCleanSvg = (svgStr) => {
  if (!svgStr || typeof svgStr !== "string") {
    return svgStr
  }
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgStr, "image/svg+xml")
    if (!doc.querySelector("svg")) {
      return svgStr
    }

    const topNodesArr = Array.from(doc.querySelectorAll("g.node, .node"))
      .filter(n => !n.parentElement || !n.parentElement.closest("g.node, .node"))

    topNodesArr.forEach(nodeEl => {
      const textStr = (nodeEl.textContent || "").trim()
      if (!textStr) {
        return
      }
      nodeEl.querySelectorAll("g.label, foreignObject").forEach(el => el.remove())

      let textLenNum = 0
      for (let i = 0; i < textStr.length; i++) {
        textLenNum += textStr.charCodeAt(i) > 255 ? 14 : 7
      }
      const renderXStr = (-textLenNum / 2).toString()

      const flatText = doc.createElementNS("http://www.w3.org/2000/svg", "text")
      flatText.setAttribute("x", renderXStr)
      flatText.setAttribute("y", "5")
      flatText.setAttribute("text-anchor", "middle")
      flatText.setAttribute("dominant-baseline", "middle")
      flatText.setAttribute("fill", "#000000")
      flatText.setAttribute("font-size", "14")
      flatText.setAttribute("font-family", "Arial, sans-serif")

      textStr.split("\n").forEach((lineStr, idxNum) => {
        const tspan = doc.createElementNS("http://www.w3.org/2000/svg", "tspan")
        tspan.setAttribute("x", renderXStr)
        if (idxNum > 0) {
          tspan.setAttribute("dy", "16")
        }
        tspan.textContent = lineStr
        flatText.appendChild(tspan)
      })
      nodeEl.appendChild(flatText)
    })

    doc.querySelectorAll("foreignObject").forEach(fo => fo.remove())
    return new XMLSerializer().serializeToString(doc.documentElement)
  } catch (err) {
    console.error("[ChatNote] SVG 绝对几何扁平化失败:", err)
    return svgStr
  }
}

const getNotePreview = (note) => {
  if (typeof note === "string") {
    return note.trim()
  }
  if (note && note.memory) {
    return [note.memory.why, note.memory.how, note.memory.what].filter(Boolean).join(" ")
  }
  return ""
}

const MEMORY_FIELDS_ARR = [
  { key: "when", labelFn: () => trs("组件/笔记/时间", { cn: "时间", en: "When" }) },
  { key: "where", labelFn: () => trs("组件/笔记/地点", { cn: "地点", en: "Where" }) },
  { key: "who", labelFn: () => trs("组件/笔记/人物", { cn: "人物", en: "Who" }) },
  { key: "why", labelFn: () => trs("组件/笔记/起因", { cn: "起因", en: "Why" }) },
  { key: "how", labelFn: () => trs("组件/笔记/经过", { cn: "经过", en: "How" }) },
  { key: "what", labelFn: () => trs("组件/笔记/结果", { cn: "结果", en: "What" }) }
]

export default () => {
  const noteOpenMap = {}
  const focusOpenMap = {}
  let graphOpenBool = true
  let currentSvgStr = ""
  let renderedCodeStr = ""

  const renderGraph = async (dom, codeStr) => {
    if (!codeStr) {
      return
    }
    try {
      const { svg } = await mermaid.render("mermaid_" + Math.random().toString(36).slice(2, 9), codeStr)
      currentSvgStr = svg
      renderedCodeStr = codeStr
      dom.innerHTML = svg
      m.redraw()
    } catch (err) {
      console.error("[ChatNote] 网点图渲染失败:", err)
      dom.innerText = `${trs("组件/笔记/网点图渲染失败", { cn: "网点图渲染失败", en: "Graph render failed" })}: ${err.message}`
      m.redraw()
    }
  }

  return {
    view({ attrs }) {
      const notesArr = attrs.notes || []
      const mermaidCodeStr = buildMermaidCode(attrs.graph || null)

      const isNoteOpen = (idxNum) => noteOpenMap[idxNum] !== undefined
        ? noteOpenMap[idxNum]
        : idxNum === notesArr.length - 1

      const allOpenBool = notesArr.length > 0 && notesArr.every((_, idxNum) => isNoteOpen(idxNum))

      return m(
        Box,
        {
          isBlock: true,
          style: {
            minWidth: `min(${getSize(150)}rem, 100%)`,
            boxSizing: "border-box",
            padding: `${getSize(3)}rem`,
            display: "flex",
            flexDirection: "column",
            gap: `${getSize(3)}rem`
          }
        },
        [
          // 1. 网点图区（flexShrink: 0 防止被下方笔记流挤压消失，圆角与外周一致为 getSize(8)）
          mermaidCodeStr
            ? m(
              "",
              {
                style: {
                  flexShrink: 0,
                  background: getColor("gray_3").back,
                  color: getColor("gray_3").front,
                  borderRadius: `${getSize(8)}rem`,
                  padding: `${getSize(3)}rem`,
                  display: "flex",
                  flexDirection: "column",
                  gap: `${getSize(3)}rem`,
                  minWidth: 0
                }
              },
              [
                m(
                  "",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: `${getSize(2)}rem`,
                      flexWrap: "wrap"
                    }
                  },
                  [
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: `${getSize(2)}rem`,
                          fontSize: `${getSize(4)}rem`,
                          color: getColor("gray_3").front,
                          cursor: "pointer"
                        },
                        onclick() {
                          graphOpenBool = !graphOpenBool
                        }
                      },
                      [
                        m.trust(window.iconPark.getIcon("TrendTwo", {
                          size: `${getSize(5)}rem`,
                          fill: getColor("gray_3").front
                        })),
                        trs("组件/笔记/网点图", { cn: "网点图", en: "Graph" }),
                        m.trust(window.iconPark.getIcon(graphOpenBool ? "Up" : "Down", {
                          size: `${getSize(4)}rem`,
                          fill: getColor("gray_3").front
                        }))
                      ]
                    ),
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap"
                        }
                      },
                      [
                        m(
                          IconTag,
                          {
                            iconName: "CopyOne",
                            isBtn: true,
                            bgColor: getColor("gray_2").back,
                            fgColor: getColor("gray_2").front,
                            ext: {
                              async onclick() {
                                if (!currentSvgStr) {
                                  if (window.Notice) {
                                    window.Notice.launch({
                                      msg: trs("组件/笔记/无网点图", { cn: "当前暂无网点图 SVG", en: "No graph SVG available" }),
                                      color: "yellow"
                                    })
                                  }
                                  return
                                }
                                try {
                                  await navigator.clipboard.writeText(currentSvgStr)
                                  if (window.Notice) {
                                    window.Notice.launch({
                                      msg: trs("组件/笔记/复制SVG成功", { cn: "网点图 SVG 已复制到剪贴板", en: "Graph SVG copied" }),
                                      color: "green"
                                    })
                                  }
                                } catch (err) {
                                  console.error("[ChatNote] 复制失败:", err)
                                  if (window.Notice) {
                                    window.Notice.launch({
                                      msg: `${trs("组件/笔记/复制失败", { cn: "复制失败", en: "Copy failed" })}: ${err.message}`,
                                      type: "error"
                                    })
                                  }
                                }
                              }
                            }
                          },
                          trs("组件/笔记/复制SVG", { cn: "复制 SVG", en: "Copy SVG" })
                        ),
                        m(
                          IconTag,
                          {
                            iconName: "Edit",
                            isBtn: true,
                            bgColor: getColor("purple_2").back,
                            fgColor: getColor("purple_2").front,
                            ext: {
                              async onclick() {
                                if (!currentSvgStr) {
                                  if (window.Notice) {
                                    window.Notice.launch({
                                      msg: trs("组件/笔记/无网点图", { cn: "当前暂无网点图 SVG", en: "No graph SVG available" }),
                                      color: "yellow"
                                    })
                                  }
                                  return
                                }
                                try {
                                  const launchRes = await settingData.fnCall("appLaunch", ["svgEditor", {}])
                                  if (launchRes && launchRes.ok && launchRes.app && launchRes.app.id) {
                                    const cleanSvgStr = flattenMermaidSvgToCleanSvg(currentSvgStr)
                                    setTimeout(async () => {
                                      try {
                                        await settingData.fnCall("appDispatch", [
                                          launchRes.app.id,
                                          "drawSvg",
                                          { svgString: cleanSvgStr }
                                        ])
                                      } catch (dispatchErr) {
                                        console.error("[ChatNote] 分发 SVG 失败:", dispatchErr)
                                      }
                                    }, 350)
                                  } else if (window.Notice) {
                                    window.Notice.launch({
                                      msg: `${trs("组件/笔记/启动编辑器失败", { cn: "启动矢量图编辑器失败", en: "Failed to launch SVG editor" })}: ${(launchRes && launchRes.msg) || trs("通用/未知错误", { cn: "未知错误", en: "Unknown error" })}`,
                                      type: "error"
                                    })
                                  }
                                } catch (err) {
                                  console.error("[ChatNote] 启动矢量图编辑器失败:", err)
                                  if (window.Notice) {
                                    window.Notice.launch({
                                      msg: `${trs("组件/笔记/启动失败", { cn: "启动失败", en: "Launch failed" })}: ${err.message}`,
                                      type: "error"
                                    })
                                  }
                                }
                              }
                            }
                          },
                          trs("组件/笔记/打开矢量图编辑器", { cn: "在矢量图编辑器打开", en: "Open in SVG Editor" })
                        )
                      ]
                    )
                  ]
                ),
                graphOpenBool
                  ? m(
                    "",
                    {
                      style: {
                        background: getColor("terminal_back"),
                        color: getColor("terminal_front"),
                        borderRadius: `${getSize(8)}rem`,
                        padding: `${getSize(3)}rem`,
                        minHeight: `${getSize(36)}rem`,
                        overflowX: "auto",
                        textAlign: "center",
                        minWidth: 0
                      },
                      oncreate(vnode) {
                        renderGraph(vnode.dom, mermaidCodeStr)
                      },
                      onupdate(vnode) {
                        if (renderedCodeStr !== mermaidCodeStr) {
                          renderGraph(vnode.dom, mermaidCodeStr)
                        }
                      }
                    }
                  )
                  : null
              ]
            )
            : null,

          // 2. 笔记顶栏：标题 + 原生 Tag 条数 + 原生 IconTag 全部展开/收起
          m(
            "",
            {
              style: {
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: `${getSize(2)}rem`,
                flexWrap: "wrap"
              }
            },
            [
              m(
                "",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: `${getSize(1)}rem`,
                    fontSize: `${getSize(4)}rem`
                  }
                },
                [
                  m.trust(window.iconPark.getIcon("Notes", {
                    size: `${getSize(5)}rem`,
                    fill: getColor("gray_4").front
                  })),
                  trs("组件/笔记/标题", { cn: "笔记", en: "Notes" }),
                  m(
                    Tag,
                    {
                      color: "main"
                    },
                    `${notesArr.length}`
                  )
                ]
              ),
              notesArr.length > 0
                ? m(
                  IconTag,
                  {
                    iconName: allOpenBool ? "Up" : "Down",
                    isBtn: true,
                    bgColor: getColor("gray_2").back,
                    fgColor: getColor("gray_2").front,
                    ext: {
                      onclick() {
                        const nextOpenBool = !allOpenBool
                        notesArr.forEach((_, idxNum) => {
                          noteOpenMap[idxNum] = nextOpenBool
                        })
                      }
                    }
                  },
                  allOpenBool
                    ? trs("组件/笔记/全部收起", { cn: "全部收起", en: "Collapse All" })
                    : trs("组件/笔记/全部展开", { cn: "全部展开", en: "Expand All" })
                )
                : null
            ]
          ),

          // 3. 笔记条目列表（收纳时保留 4 行文本预览高度，圆角与外周一致为 getSize(8)）
          notesArr.length === 0
            ? m(
              "",
              {
                style: {
                  flexShrink: 0,
                  background: getColor("gray_3").back,
                  color: getColor("gray_3").front,
                  borderRadius: `${getSize(8)}rem`,
                  padding: `${getSize(3)}rem`,
                  textAlign: "center",
                  fontSize: `${getSize(4)}rem`
                }
              },
              trs("组件/笔记/暂无数据", { cn: "暂无笔记", en: "No notes yet" })
            )
            : m(
              "",
              {
                style: {
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: `${getSize(3)}rem`,
                  minWidth: 0
                }
              },
              notesArr.map((memoryItem, mIdxNum) => {
                const note = memoryItem.note
                if (!note) {
                  return null
                }
                const isOpenBool = isNoteOpen(mIdxNum)
                const previewStr = getNotePreview(note)

                return m(
                  "",
                  {
                    key: mIdxNum,
                    style: {
                      flexShrink: 0,
                      background: getColor("gray_3").back,
                      color: getColor("gray_3").front,
                      borderRadius: `${getSize(8)}rem`,
                      padding: `${getSize(3)}rem`,
                      display: "flex",
                      flexDirection: "column",
                      gap: `${getSize(3)}rem`,
                      minWidth: 0
                    }
                  },
                  [
                    // 笔记头部：原生 Tag 序号/ID + 时间 + 原生 IconTag 展开/收起
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: `${getSize(2)}rem`,
                          flexWrap: "wrap",
                          minWidth: 0
                        }
                      },
                      [
                        m(
                          "",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              flexWrap: "wrap",
                              minWidth: 0
                            }
                          },
                          [
                            m(
                              Tag,
                              {
                                color: "main"
                              },
                              `#${mIdxNum + 1}`
                            ),
                            memoryItem.id !== undefined
                              ? m(
                                Tag,
                                {
                                  color: "gray_4"
                                },
                                `ID ${memoryItem.id}`
                              )
                              : null
                          ]
                        ),
                        m(
                          "",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: `${getSize(1)}rem`,
                              flexShrink: 0
                            }
                          },
                          [
                            memoryItem.time
                              ? m(
                                "span",
                                {
                                  style: {
                                    fontSize: `${getSize(3)}rem`,
                                    color: getColor("gray_3").front,
                                    opacity: 0.75,
                                    whiteSpace: "nowrap"
                                  }
                                },
                                new Date(memoryItem.time).toLocaleString()
                              )
                              : null,
                            m(
                              IconTag,
                              {
                                iconName: isOpenBool ? "Up" : "Down",
                                isBtn: true,
                                bgColor: getColor("gray_2").back,
                                fgColor: getColor("gray_2").front,
                                ext: {
                                  onclick() {
                                    noteOpenMap[mIdxNum] = !isOpenBool
                                  }
                                }
                              },
                              isOpenBool
                                ? trs("组件/笔记/收起", { cn: "收起", en: "Collapse" })
                                : trs("组件/笔记/展开", { cn: "展开", en: "Expand" })
                            )
                          ]
                        )
                      ]
                    ),

                    // 收纳态：4 行可读文本预览（点击可直接展开）
                    !isOpenBool
                      ? m(
                        "",
                        {
                          style: {
                            fontSize: `${getSize(4)}rem`,
                            lineHeight: `${getSize(5)}rem`,
                            maxHeight: `${getSize(20)}rem`,
                            color: getColor("gray_3").front,
                            display: "-webkit-box",
                            WebkitLineClamp: 4,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            cursor: "pointer"
                          },
                          onclick() {
                            noteOpenMap[mIdxNum] = true
                          }
                        },
                        previewStr
                      )
                      : m(
                        "",
                        {
                          style: {
                            paddingTop: `${getSize(3)}rem`,
                            borderTop: `${getSize(0.25)}rem solid rgba(0,0,0,0.08)`,
                            minWidth: 0
                          }
                        },
                        typeof note === "string"
                          ? m(
                            ".article",
                            {
                              style: {
                                color: getColor("gray_3").front,
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                                minWidth: 0
                              }
                            },
                            m.trust(format(note, "markdown"))
                          )
                          : m(
                            "",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: `${getSize(3)}rem`,
                                minWidth: 0
                              }
                            },
                            [
                              note.memory
                                ? m(
                                  "",
                                  {
                                    style: {
                                      padding: `${getSize(3)}rem`,
                                      background: getColor("gray_4").back,
                                      color: getColor("gray_4").front,
                                      borderRadius: `${getSize(8)}rem`,
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: `${getSize(3)}rem`,
                                      minWidth: 0
                                    }
                                  },
                                  MEMORY_FIELDS_ARR
                                    .filter(field => Boolean(note.memory[field.key]))
                                    .map(field => m(
                                      "",
                                      {
                                        key: field.key,
                                        style: {
                                          display: "flex",
                                          alignItems: "flex-start",
                                          gap: `${getSize(1)}rem`,
                                          minWidth: 0
                                        }
                                      },
                                      [
                                        m(
                                          Tag,
                                          {
                                            color: "gray_3"
                                          },
                                          field.labelFn()
                                        ),
                                        m(
                                          "span",
                                          {
                                            style: {
                                              flex: 1,
                                              minWidth: 0,
                                              overflowWrap: "anywhere",
                                              wordBreak: "break-word"
                                            }
                                          },
                                          note.memory[field.key]
                                        )
                                      ]
                                    ))
                                )
                                : null,

                              note.focus && note.focus.length > 0
                                ? m(
                                  "",
                                  {
                                    style: {
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: `${getSize(2)}rem`,
                                      minWidth: 0
                                    }
                                  },
                                  note.focus.map((item, fIdxNum) => {
                                    const uniqueKeyStr = `${mIdxNum}_${fIdxNum}`
                                    const isFocusOpenBool = Boolean(focusOpenMap[uniqueKeyStr])
                                    return m(
                                      "",
                                      {
                                        key: fIdxNum,
                                        style: {
                                          background: getColor("gray_4").back,
                                          color: getColor("gray_4").front,
                                          borderRadius: `${getSize(8)}rem`,
                                          padding: `${getSize(3)}rem`,
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: `${getSize(2)}rem`,
                                          minWidth: 0
                                        }
                                      },
                                      [
                                        m(
                                          "",
                                          {
                                            style: {
                                              cursor: "pointer",
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              gap: `${getSize(2)}rem`,
                                              minWidth: 0
                                            },
                                            onclick() {
                                              focusOpenMap[uniqueKeyStr] = !isFocusOpenBool
                                            }
                                          },
                                          [
                                            m(
                                              "",
                                              {
                                                style: {
                                                  display: "flex",
                                                  gap: `${getSize(1)}rem`,
                                                  alignItems: "center",
                                                  flexWrap: "wrap",
                                                  minWidth: 0,
                                                  flex: 1
                                                }
                                              },
                                              [
                                                m(
                                                  Tag,
                                                  {
                                                    color: "main"
                                                  },
                                                  item.target
                                                ),
                                                m(
                                                  "span",
                                                  {
                                                    style: {
                                                      fontSize: `${getSize(4)}rem`,
                                                      color: getColor("gray_4").front,
                                                      overflowWrap: "anywhere",
                                                      wordBreak: "break-word"
                                                    }
                                                  },
                                                  item.step
                                                )
                                              ]
                                            ),
                                            m(
                                              "span",
                                              {
                                                style: {
                                                  display: "flex",
                                                  alignItems: "center",
                                                  flexShrink: 0
                                                }
                                              },
                                              m.trust(window.iconPark.getIcon(
                                                isFocusOpenBool ? "Up" : "Down",
                                                {
                                                  size: `${getSize(4)}rem`,
                                                  fill: getColor("gray_4").front
                                                }
                                              ))
                                            )
                                          ]
                                        ),
                                        isFocusOpenBool
                                          ? m(
                                            "",
                                            {
                                              style: {
                                                paddingTop: `${getSize(2)}rem`,
                                                borderTop: `${getSize(0.25)}rem solid rgba(0,0,0,0.08)`,
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: `${getSize(2)}rem`,
                                                minWidth: 0
                                              }
                                            },
                                            [
                                              item.code
                                                ? item.code.content !== "无代码"
                                                  ? m(
                                                    "",
                                                    {
                                                      style: {
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: `${getSize(1)}rem`,
                                                        minWidth: 0
                                                      }
                                                    },
                                                    [
                                                      m(
                                                        "span",
                                                        {
                                                          style: {
                                                            fontSize: `${getSize(3)}rem`,
                                                            color: getColor("gray_4").front
                                                          }
                                                        },
                                                        `L${item.code.lineS} - L${item.code.lineE}`
                                                      ),
                                                      m(
                                                        "pre",
                                                        {
                                                          style: {
                                                            background: getColor("terminal_back"),
                                                            color: getColor("terminal_front"),
                                                            padding: `${getSize(3)}rem`,
                                                            borderRadius: `${getSize(8)}rem`,
                                                            fontSize: `${getSize(3)}rem`,
                                                            overflowX: "auto",
                                                            margin: `${getSize(0)}rem`,
                                                            wordBreak: "break-all",
                                                            whiteSpace: "pre-wrap"
                                                          }
                                                        },
                                                        item.code.content
                                                      )
                                                    ]
                                                  )
                                                  : m(
                                                    "",
                                                    {
                                                      style: {
                                                        fontSize: `${getSize(3)}rem`,
                                                        color: getColor("gray_4").front,
                                                        padding: `${getSize(2)}rem`,
                                                        border: `${getSize(0.25)}rem dashed rgba(0,0,0,0.15)`,
                                                        borderRadius: `${getSize(8)}rem`,
                                                        textAlign: "center"
                                                      }
                                                    },
                                                    trs("组件/笔记/无代码快照", { cn: "(无关联代码快照)", en: "(No related code snapshot)" })
                                                  )
                                                : null,
                                              m(
                                                "",
                                                {
                                                  style: {
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: `${getSize(2)}rem`,
                                                    minWidth: 0
                                                  }
                                                },
                                                (item.comments || []).map((c, cIdxNum) => m(
                                                  "",
                                                  {
                                                    key: cIdxNum,
                                                    style: {
                                                      display: "flex",
                                                      flexDirection: "column",
                                                      gap: `${getSize(1)}rem`,
                                                      minWidth: 0,
                                                      overflowWrap: "anywhere",
                                                      wordBreak: "break-word"
                                                    }
                                                  },
                                                  [
                                                    m(
                                                      "",
                                                      [
                                                        m(
                                                          Tag,
                                                          {
                                                            color: "main"
                                                          },
                                                          `${c.order}`
                                                        ),
                                                        m("span", trs("组件/笔记/因为", { cn: "【因为】", en: "[Since] " })),
                                                        m("span", c.since)
                                                      ]
                                                    ),
                                                    m(
                                                      "",
                                                      [
                                                        m("span", trs("组件/笔记/所以", { cn: "【所以】", en: "[Therefore] " })),
                                                        m("span", c.therefore)
                                                      ]
                                                    ),
                                                    m(
                                                      "",
                                                      [
                                                        m("span", trs("组件/笔记/依据", { cn: "【依据】", en: "[By] " })),
                                                        m("span", c.by)
                                                      ]
                                                    ),
                                                    c.comment
                                                      ? m(
                                                        "",
                                                        {
                                                          style: {
                                                            fontSize: `${getSize(3)}rem`
                                                          }
                                                        },
                                                        `(${c.comment})`
                                                      )
                                                      : null
                                                  ]
                                                ))
                                              )
                                            ]
                                          )
                                          : null
                                      ]
                                    )
                                  })
                                )
                                : null
                            ]
                          )
                      )
                  ]
                )
              })
            )
        ]
      )
    }
  }
}
