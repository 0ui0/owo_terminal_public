import m from "mithril"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"

export default () => {
  let searchText = ""

  return {
    view(vnode) {
      const { toolsList, modalDraft, onToggleTool } = vnode.attrs
      const allTools = toolsList || []
      const currentList = modalDraft?.skipConfirmTools || []
      const kw = searchText.trim().toLowerCase()

      const filteredTools = allTools.filter(t => {
        if (!kw) return true
        const name = (t.name || "").toLowerCase()
        const id = (t.id || "").toLowerCase()
        const doc = (t.doc || "").toLowerCase()
        return name.includes(kw) || id.includes(kw) || doc.includes(kw)
      })

      return m(
        "",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "1.2rem",
            padding: "1rem",
            color: getColor("gray_1").front,
            width: "100%",
            maxWidth: "48rem",
            maxHeight: "70vh",
            boxSizing: "border-box"
          }
        },
        [
          // 搜索输入框 (Box oninput 签名: el, e, v, box_this)
          m(
            Box,
            {
              tagName: "input[type=text]",
              color: "gray_4",
              style: {
                borderRadius: "3rem",
                margin: "0",
                padding: "1rem 1.5rem",
                fontSize: "1.5rem",
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

          // 工具列表区域
          m(
            "",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem",
                overflowY: "auto",
                maxHeight: "50vh",
                paddingRight: "0.2rem"
              }
            },
            filteredTools.length === 0
              ? m(
                  "div",
                  {
                    key: "empty_search",
                    style: {
                      padding: "2rem",
                      textAlign: "center",
                      fontSize: "1.2rem",
                      opacity: 0.6
                    }
                  },
                  trs("输入栏/参数/未找到匹配工具", {
                    cn: "未找到匹配的工具",
                    en: "No matching tools found"
                  })
                )
              : filteredTools.map(tool => {
                  const isSelected = currentList.includes(tool.id)
                  return m(
                    Box,
                    {
                      key: tool.id,
                      color: isSelected ? "yellow_1" : "gray_4",
                      isBtn: true,
                      style: {
                        borderRadius: "3rem",
                        margin: "0",
                        padding: "1rem 1.5rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      },
                      onclick: () => {
                        if (onToggleTool) {
                          onToggleTool(tool.id)
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
                            gap: "0.3rem",
                            flex: 1,
                            marginRight: "1rem"
                          }
                        },
                        [
                          m(
                            "span",
                            {
                              style: {
                                fontSize: "1.5rem"
                              }
                            },
                            tool.name || tool.id
                          ),
                          m(
                            "span",
                            {
                              style: {
                                fontSize: "1.2rem",
                                opacity: 0.6,
                                fontFamily: "monospace"
                              }
                            },
                            tool.id
                          )
                        ]
                      ),

                      m(
                        Tag,
                        {
                          color: isSelected ? "green_1" : "gray_2",
                          styleExt: {
                            margin: "0",
                            fontSize: "1.2rem",
                            padding: "0.4rem 1rem",
                            borderRadius: "3rem"
                          }
                        },
                        isSelected
                          ? trs("输入栏/参数/已添加", { cn: "已添加", en: "Added" })
                          : trs("输入栏/参数/点击添加", { cn: "+ 添加", en: "+ Add" })
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
