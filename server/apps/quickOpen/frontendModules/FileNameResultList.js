// quickOpen 纯文件名搜索结果列表展示组件
// 专注于文件名快速匹配展示：文件名 + 【文件名】Tag 标识 + 相对路径
// 严格遵循 App 开发指南与 Mithril 函数组件规范

export default ({ m, Box, getColor, trs }) => {
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
              // 第一行：文件名与【文件名】Tag
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
              ),

              // 第二行：文件相对路径
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
