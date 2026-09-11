import aiSelectionData from "./aiSelectionData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, format, Box, iconPark, getColor, trs }) => {
  // === State ===
  let title = ""
  let content = ""
  let options = []
  let localComment = ""

  // === Instance Interface ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (msg.action === "getHTML") {
        return callback({
          ok: true,
          data: document.body.innerHTML
        })
      }
      if (callback) {
        callback({
          ok: true
        })
      }
    }
  }

  // === Init ===
  const init = () => {
    aiSelectionData.addTool("commonData", commonData)
    aiSelectionData.registerInstances(appId, instanceInterface)
    if (commonData.registerApp) {
      commonData.registerApp(appId, aiSelectionData)
    }
  }

  init()

  // === Actions ===
  const dispatchChoice = async (action, args) => {
    try {
      await settingData.fnCall("appDispatch", [appId, action, args])
    }
    catch (e) {
      console.error(e)
    }
  }

  return {
    oninit(vnode) {
      // 从 vnode.attrs 获取启动参数
      if (vnode.attrs.data) {
        if (vnode.attrs.data.title) {
          title = vnode.attrs.data.title
        }
        if (vnode.attrs.data.content) {
          content = vnode.attrs.data.content
        }
        if (vnode.attrs.data.options) {
          options = vnode.attrs.data.options
        }
      }
    },
    onremove() {
      aiSelectionData.unregisterInstances(appId, commonData)
    },
    cancel() {
      dispatchChoice("cancel", {
        comment: localComment
      })
      return undefined
    },
    view() {
      return m(Box, {
        color: "gray_1",
        isBlock: true,
        style: {
          height: "100%",
          margin: "0",
          borderRadius: "0",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          overflow: "hidden"
        }
      }, [
        // 标题
        m("",
          {
            style: {
              textAlign: "center"
            }
          },
          [
            m("",
              {
              style: {
                fontSize: "1.8rem"
              }
            },
            title || trs("AI助手选择/默认标题", {
              cn: "请选择一项操作",
              en: "Please choose an option"
            })
          )
        ]),

        // 说明内容（与系统正文一致的 Markdown 排版）
        content ? m(Box, {
          class: "article",
          color: "gray_4",
          isBlock: true,
          style: {
            margin: "0",
            maxHeight: "24rem",
            overflowY: "auto"
          }
        }, [
          m.trust(format(content, "markdown", {}))
        ]) : null,

        // 备注（随选择一并回传给 AI）
        m(Box, {
          color: "gray_4",
          isBlock: true,
          style: {
            margin: "0",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }
        }, [
          m("",
            {
              style: {
                fontSize: "1.2rem"
              }
            },
            trs("AI助手选择/备注标签", {
              cn: "备注（随选择一并发送给 AI）",
              en: "Note (sent along with your choice)"
            })
          ),
          m(Box, {
            tagName: "textarea",
            color: "gray_4",
            isBlock: true,
            style: {
              margin: "0",
              minHeight: "10rem",
              resize: "vertical",
              outline: "none",
              background: getColor("确认框输入背景"),
              color: getColor("确认框输入文字"),
              border: `0.1rem solid ${getColor("确认框输入边框")}`,
              borderRadius: "1rem"
            },
            oninput: (dom) => {
              localComment = dom.value
            },
            ext: {
              value: localComment,
              placeholder: trs("AI助手选择/备注占位", {
                cn: "输入要随选择一并发送的备注信息...",
                en: "Type a note to send with your choice..."
              })
            }
          })
        ]),

        // 选项列表
        m("",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              flex: "1",
              overflowY: "auto"
            }
          },
          options.map((opt) => {
            return m(Box, {
              color: opt.color || "gray_4",
              isBtn: true,
              isBlock: true,
              style: {
                margin: "0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              },
              onclick: () => {
                dispatchChoice("select", {
                  value: opt.value,
                  comment: localComment
                })
              }
            }, [
              m("span", opt.label),
              m.trust(iconPark.getIcon("Right", {
                fill: getColor(opt.color || "gray_4").front,
                size: "1.4rem"
              }))
            ])
          })
        ),

        // 取消选择
        m(Box, {
          color: "gray_2",
          isBtn: true,
          isBlock: true,
          style: {
            margin: "0",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "0.5rem"
          },
          onclick: () => {
            dispatchChoice("cancel", {
              comment: localComment
            })
          }
        }, [
          m("span", trs("AI助手选择/取消选择", {
            cn: "取消选择",
            en: "Cancel"
          })),
          m.trust(iconPark.getIcon("Close", {
            fill: getColor("gray_2").front,
            size: "1.4rem"
          }))
        ])
      ])
    }
  }
}
