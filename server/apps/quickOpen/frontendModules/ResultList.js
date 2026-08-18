// quickOpen 搜索结果列表展示组件
// 支持 2 类搜索展示：1. 文件名匹配展示 (含文件名 Tag)  2. 全文内容匹配展示 (含行号、monospace 与 submatches 黄色高亮)
// 严格遵循 App 开发指南与 Mithril 函数组件规范

export default ({ m, Box, getColor, trs }) => {
  // VSCode 同款高亮文本渲染器
  const renderHighlightedText = (content, submatches) => {
    if (!submatches || submatches.length === 0) return content
    const nodes = []
    let lastIdx = 0
    submatches.forEach((mObj) => {
      if (mObj.start > lastIdx) {
        nodes.push(content.substring(lastIdx, mObj.start))
      }
      nodes.push(m("span",
        {
          style: {
            background: "#e5c07b",
            color: "#000",
            borderRadius: "0.2rem",
            padding: "0 0.2rem"
          }
        },
        content.substring(mObj.start, mObj.end)
      ))
      lastIdx = mObj.end
    })
    if (lastIdx < content.length) {
      nodes.push(content.substring(lastIdx))
    }
    return nodes
  }

  return {
    view(vnode) {
      const { list = [], selectedIndex = 0, keyword = "", onOpenFile } = vnode.attrs

      if (list.length === 0) {
        if (!keyword.trim()) return null
        return m("",
          {
            style: {
              textAlign: "center",
              color: getColor('gray_4').front,
              padding: "1rem"
            }
          },
          trs("快速打开/无结果", {
            cn: "无匹配结果喵",
            en: "No matches"
          })
        )
      }

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "0.3rem",
            maxHeight: "35rem",
            overflowY: "auto"
          }
        },
        list.map((f, i) => {
          const isSelected = (i === selectedIndex)

          return m(Box,
            {
              isBtn: true,
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                background: isSelected ? getColor('main').back : "transparent",
                margin: "0",
                padding: "0.5rem 0.8rem",
                borderRadius: "0.6rem"
              },
              ext: {
                onclick: () => {
                  if (typeof onOpenFile === "function") {
                    onOpenFile(f)
                  }
                }
              }
            },
            [
              // 第一行：文件名与行号信息
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    color: isSelected ? getColor('main').front : getColor('gray_1').front,
                    wordBreak: "break-word"
                  }
                },
                [
                  // 1. 文件名匹配类型：显示文件名与蓝色标识 Tag
                  f.isFileNameMatch
                    ? [
                        m("span", f.name),
                        m("span",
                          {
                            style: {
                              fontSize: "1rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "0.3rem",
                              background: isSelected ? getColor('main').front + "33" : getColor('main').back + "55",
                              color: isSelected ? getColor('main').front : getColor('main').front,
                              flexShrink: 0
                            }
                          },
                          trs("快速打开/文件名标记", {
                            cn: "文件名",
                            en: "Filename"
                          })
                        )
                      ]
                    // 2. 全文内容匹配类型：显示 文件名 : 行号
                    : m("span", `${f.name} : ${f.line}`)
                ]
              ),

              // 第二行：路径或 VSCode 同款高亮代码行
              f.isSearchResult && !f.isFileNameMatch
                ? // 全文匹配：等宽字体 + submatches 黄色高亮代码行
                  m("div",
                    {
                      style: {
                        opacity: isSelected ? 0.9 : 0.75,
                        whiteSpace: "pre-wrap",
                        fontFamily: "monospace",
                        tabSize: 2,
                        marginTop: "0.1rem",
                        color: isSelected ? getColor('main').front : getColor('gray_4').front
                      }
                    },
                    renderHighlightedText(f.content, f.submatches)
                  )
                : // 文件名匹配：显示文件相对路径
                  m("",
                    {
                      style: {
                        color: isSelected ? getColor('main').front + "cc" : getColor('gray_4').front,
                        wordBreak: "break-word"
                      }
                    },
                    f.relPath
                  )
            ]
          )
        })
      )
    }
  }
}
