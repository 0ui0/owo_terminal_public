import aiSelectionData from "./aiSelectionData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, iconPark, getColor }) => {
  // === State ===
  let title = "请选择一项操作"
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

  return {
    oninit(vnode) {
      // 从 vnode.attrs 获取启动参数
      if (vnode.attrs.data) {
        if (vnode.attrs.data.title) {
          title = vnode.attrs.data.title
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
      settingData.fnCall("appDispatch", [
        appId,
        "cancel",
        {
          comment: localComment
        }
      ]).catch(e => {
        console.error(e)
      })
      return undefined
    },
    view() {
      return m("", {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${getColor('gray_3').back} 0%, ${getColor('gray_4').back} 100%)`,
          color: getColor('gray_3').front,
          fontFamily: "'Inter', sans-serif",
          padding: "2.4rem",
          boxSizing: "border-box",
          overflow: "hidden",
          position: "relative"
        }
      }, [
        // Bubble Decorative Elements
        m("", {
          style: {
            position: "absolute",
            top: "-5.0rem",
            right: "-5.0rem",
            width: "15.0rem",
            height: "15.0rem",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.03)",
            filter: "blur(4.0rem)",
            pointerEvents: "none"
          }
        }),

        // Header
        m("", {
          style: {
            marginBottom: "2.0rem",
            textAlign: "center"
          }
        }, [
          m("", {
            style: {
              fontSize: "1.8rem",
              fontWeight: "800",
              color: getColor('gray_3').front,
              letterSpacing: "-0.05rem"
            }
          }, title)
        ]),

        // 备注输入框 - 改用 Box 实现
        m("", {
          style: {
            marginBottom: "1.6rem",
            display: "flex",
            flexDirection: "column"
          }
        }, [
          m(Box, {
            tagName: "input[type=text]",
            color: "gray_2",
            oninput: (dom, e) => {
              localComment = dom.value
            },
            style: {
              width: "100%",
              boxSizing: "border-box",
              outline: "none"
            },
            ext: {
              value: localComment,
              placeholder: "输入要随选择一并发送的备注信息..."
            }
          })
        ]),

        // Options List
        m("", {
          style: {
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.2rem",
            padding: "0.4rem"
          }
        }, [
          options.map(opt => {
            return m(Box, {
              isBtn: true,
              color: opt.color || "gray_2",
              onclick: async () => {
                try {
                  await settingData.fnCall("appDispatch", [
                    appId,
                    "select",
                    {
                      value: opt.value,
                      comment: localComment
                    }
                  ])
                } catch (e) {
                  console.error(e)
                }
              }
            }, [
              m("span", opt.label),
              m.trust(
                iconPark.getIcon("Right", {
                  fill: opt.color ? getColor(opt.color).front : getColor('gray_2').front,
                  size: "1.4rem"
                })
              )
            ])
          }),

          // 取消选择按钮
          m(Box, {
            isBtn: true,
            color: "gray_3",
            onclick: async () => {
              try {
                await settingData.fnCall("appDispatch", [
                  appId,
                  "cancel",
                  {
                    comment: localComment
                  }
                ])
              } catch (e) {
                console.error(e)
              }
            }
          }, [
            m("span", "取消选择"),
            m.trust(
              iconPark.getIcon("Close", {
                fill: getColor('gray_3').front,
                size: "1.4rem"
              })
            )
          ])
        ])
      ])
    }
  }
}
