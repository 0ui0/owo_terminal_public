import m from "/@npm/mithril.js"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import { trs } from "../common/i18n.js"
import Notice from "../common/notice.js"

export default () => {
  let searchText = ""
  let chipsExpanded = false

  return {
    view(vnode) {
      const { toolsList, modalDraft, getSelectedList, onToggleTool, onSetAll } = vnode.attrs
      const allTools = toolsList || []
      const currentList = typeof getSelectedList === "function"
        ? (getSelectedList() || [])
        : (modalDraft?.skipConfirmTools || [])
      const kw = searchText.trim().toLowerCase()

      const filteredTools = allTools.filter(t => {
        if (!kw) return true
        const name = (t.name || "").toLowerCase()
        const id = (t.id || t || "").toLowerCase()
        const doc = (t.doc || "").toLowerCase()
        return name.includes(kw) || id.includes(kw) || doc.includes(kw)
      })

      return m(
        "",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: `${getSize(3)}rem`,
            padding: `${getSize(3)}rem`,
            color: getColor("gray_1").front,
            width: "100%",
            maxWidth: `${getSize(120)}rem`,
            boxSizing: "border-box"
          }
        },
        [
          // 搜索输入框
          m(
            Box,
            {
              tagName: "input[type=text]",
              color: "gray_4",
              style: {
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
                fontSize: `${getSize(4)}rem`,
                outline: "none",
                border: "none",
                width: "100%",
                boxSizing: "border-box"
              },
              placeholder: trs("输入栏/参数/搜索工具占位符", {
                cn: "输入工具名称或 ID 快速搜索...",
                en: "Search by tool name or ID..."
              }),
              value: searchText,
              oninput: (el) => {
                searchText = el.value
              }
            }
          ),

          // 批量操作行 (使用系统标准 Tag 尺寸)
          onSetAll
            ? m(
              "",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: `${getSize(2)}rem`
                }
              },
              [
                m(
                  Tag,
                  {
                    isBtn: true,
                    color: "yellow_1",
                    styleExt: {
                      margin: "0"
                    },
                    ext: {
                      onclick: () => {
                        onSetAll(allTools.map(tool => tool.id || tool))
                      }
                    }
                  },
                  trs("输入栏/参数/添加全部工具", {
                    cn: "添加全部",
                    en: "Add All"
                  })
                ),
                m(
                  Tag,
                  {
                    isBtn: true,
                    color: "pink_1",
                    styleExt: {
                      margin: "0"
                    },
                    ext: {
                      onclick: () => {
                        onSetAll([])
                      }
                    }
                  },
                  trs("输入栏/参数/取消全部工具", {
                    cn: "取消全部",
                    en: "Remove All"
                  })
                )
              ]
            )
            : null,

          // 已选工具胶囊流 (继承标准 Tag 尺寸，span 强制 inherit 杜绝全局 font-size 污染)
          currentList.length === 0
            ? null
            : m(
              "",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  width: "100%"
                }
              },
              [
                m(
                  "",
                  {
                    style: {
                      display: "flex",
                      flexWrap: "wrap",
                      width: "100%",
                      maxHeight: chipsExpanded ? "none" : `${getSize(18)}rem`,
                      overflow: "hidden"
                    }
                  },
                  currentList.map(toolId => {
                    const toolItem = allTools.find(tool => (tool.id || tool) === toolId)
                    const displayName = toolItem?.name || toolId
                    return m(
                      Tag,
                      {
                        key: toolId,
                        color: "main",
                        styleExt: {
                          display: "inline-flex",
                          alignItems: "center",
                          gap: `${getSize(1)}rem`
                        }
                      },
                      [
                        m(
                          "span",
                          {
                            style: {
                              fontSize: "inherit"
                            }
                          },
                          displayName
                        ),
                        m(
                          "span",
                          {
                            style: {
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: "pointer",
                              opacity: 0.7,
                              fontSize: "inherit"
                            },
                            onclick: (e) => {
                              e.stopPropagation()
                              if (onToggleTool) {
                                onToggleTool(toolId)
                              }
                            }
                          },
                          m.trust(window.iconPark.getIcon("CloseSmall", {
                            size: `${getSize(3)}rem`,
                            fill: getColor("main").front
                          }))
                        )
                      ]
                    )
                  })
                ),

                // 展开/收起按钮 (标准 Tag 规格)
                currentList.length > 6
                  ? m(
                    Tag,
                    {
                      isBtn: true,
                      color: "gray_2",
                      ext: {
                        onclick: () => {
                          chipsExpanded = !chipsExpanded
                        }
                      }
                    },
                    chipsExpanded
                      ? trs("输入栏/参数/收起工具列表", { cn: "收起", en: "Collapse" })
                      : trs("输入栏/参数/展开全部工具", { cn: `展开全部 (${currentList.length})`, en: `Expand All (${currentList.length})` })
                  )
                  : null
              ]
            ),

          // 工具列表区域 (由 NoticeBox 统一调度单层平滑滚动)
          m(
            "",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`
              }
            },
            filteredTools.length === 0
              ? m(
                "div",
                {
                  key: "empty_search",
                  style: {
                    padding: `${getSize(5)}rem`,
                    textAlign: "center",
                    fontSize: `${getSize(3)}rem`,
                    opacity: 0.6
                  }
                },
                trs("输入栏/参数/未找到匹配工具", {
                  cn: "未找到匹配的工具",
                  en: "No matching tools found"
                })
              )
              : filteredTools.map(tool => {
                const toolId = tool.id || tool
                const toolName = tool.name || toolId
                const isSelected = currentList.includes(toolId)
                return m(
                  Box,
                  {
                    key: toolId,
                    color: isSelected ? "yellow_1" : "gray_4",
                    isBtn: true,
                    style: {
                      borderRadius: `${getSize(8)}rem`,
                      margin: "0",
                      padding: `${getSize(3)}rem ${getSize(4)}rem`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    },
                    ext: {
                      onclick: () => {
                        if (onToggleTool) {
                          onToggleTool(toolId)
                        }
                      }
                    }
                  },
                  [
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: `${getSize(1)}rem`,
                          flex: 1,
                          marginRight: `${getSize(3)}rem`
                        }
                      },
                      [
                        m(
                          "span",
                          {
                            style: {
                              fontSize: `${getSize(4)}rem`
                            }
                          },
                          toolName
                        ),
                        m(
                          "span",
                          {
                            style: {
                              fontSize: `${getSize(3)}rem`,
                              opacity: 0.6,
                              fontFamily: "monospace"
                            }
                          },
                          toolId
                        )
                      ]
                    ),

                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: `${getSize(1)}rem`
                        }
                      },
                      [
                        tool.doc
                          ? m(
                            Tag,
                            {
                              isBtn: true,
                              color: "gray_2",
                              ext: {
                                onclick: (e) => {
                                  e.stopPropagation()
                                  Notice.launch({
                                    sign: "tool_doc_" + toolId,
                                    tip: toolName,
                                    hideBtn: 2,
                                    content: {
                                      view: () => m(Box, tool.doc)
                                    }
                                  })
                                }
                              }
                            },
                            trs("输入栏/参数/工具说明", { cn: "说明", en: "Docs" })
                          )
                          : null,
                        m(
                          Tag,
                          {
                            color: isSelected ? "green_1" : "gray_2"
                          },
                          isSelected
                            ? trs("输入栏/参数/已添加", { cn: "已添加", en: "Added" })
                            : trs("输入栏/参数/点击添加", { cn: "+ 添加", en: "+ Add" })
                        )
                      ]
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
