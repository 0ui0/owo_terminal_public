import m from "mithril"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"
import settingData from "../setting/settingData.js"
import Notice from "../common/Notice.js"
import ChatToolSelect from "./ChatToolSelect.js"

export default () => {
  let toolsList = []
  let loadingTools = true
  let modalDraft = null

  const getToolDisplayName = (id) => {
    const found = toolsList.find(t => t.id === id)
    return found?.name || id
  }

  return {
    async oninit(vnode) {
      const { targetChatListId, targetSession, updateListSession, noticeConfig } = vnode.attrs

      // 初始化本地草稿对象，不直接污染外部 session
      modalDraft = {
        thinkControl: !!targetSession?.thinkControl,
        enableThinking: !!targetSession?.enableThinking,
        thinkStrength: targetSession?.thinkStrength || "medium",
        tokenCompressSwitch: targetSession?.tokenCompressSwitch ?? true,
        autoLaunchEditor: !!targetSession?.autoLaunchEditor,
        skipConfirmTools: [...(targetSession?.skipConfirmTools || [])]
      }

      // 💡 遵循 Notice 规范：在模块内部接管 noticeConfig 的 confirm 回调
      const config = noticeConfig || vnode.attrs._winConfig
      if (config) {
        config.hideBtn = 0
        config.confirm = async (dom, closeFn) => {
          try {
            if (updateListSession) {
              const res = await updateListSession(targetChatListId, {
                thinkControl: modalDraft.thinkControl,
                enableThinking: modalDraft.enableThinking,
                thinkStrength: modalDraft.thinkStrength,
                tokenCompressSwitch: modalDraft.tokenCompressSwitch,
                autoLaunchEditor: modalDraft.autoLaunchEditor,
                skipConfirmTools: modalDraft.skipConfirmTools
              })

              // 💡 服务端返回 ok: false 时弹出 Notice 报警，并返回 true 拦截窗口关闭
              if (res && res.ok === false) {
                Notice.launch({
                  msg: trs("输入栏/参数/保存失败", {
                    cn: `保存配置失败: ${res.msg || "未知错误"}`,
                    en: `Failed to save settings: ${res.msg || "Unknown error"}`
                  })
                })
                return true
              }

              // 💡 服务端保存成功后弹出 Notice 成功提示
              Notice.launch({
                msg: trs("输入栏/参数/保存成功", {
                  cn: "配置保存成功",
                  en: "Settings saved successfully"
                })
              })
            }
            if (typeof closeFn === "function") {
              closeFn()
            }
          } catch (err) {
            console.error("[ChatSendParams] 提交配置异常:", err)
            return true
          }
        }
      }

      try {
        if (settingData?.fnCall) {
          const res = await settingData.fnCall("getToolsList", [targetChatListId || 0])
          if (res?.ok && Array.isArray(res.data)) {
            // 完全信任后端通过反射动态过 滤出的具备 waitConfirm 的工具
            toolsList = res.data
          }
        }
      } catch (e) {
        console.warn("[ChatSendParamsModal] 加载工具列表失败:", e)
      } finally {
        loadingTools = false
        m.redraw()
      }
    },

    view() {
      if (!modalDraft) return null

      const isThinkControl = !!modalDraft.thinkControl
      const isEnableThinking = !!modalDraft.enableThinking
      const thinkStrength = modalDraft.thinkStrength || "medium"
      const isTokenCompress = modalDraft.tokenCompressSwitch ?? true
      const isAutoLaunchEditor = !!modalDraft.autoLaunchEditor
      const skipConfirmTools = modalDraft.skipConfirmTools || []

      return m(
        "",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "1.2rem",
            padding: "1rem",
            color: getColor("gray_1").front,
            maxWidth: "48rem"
          }
        },
        [
          // 卡片 1: 深度思考配置
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: "3rem",
                margin: "0",
                padding: "1.2rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem"
              }
            },
            [
              // 第一重开关
              m(
                "",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
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
                    trs("输入栏/参数/思考控制", {
                      cn: "思考控制",
                      en: "Think Control"
                    })
                  ),
                  m(
                    Box,
                    {
                      color: "main",
                      isSwitch: true,
                      value: isThinkControl,
                      style: {
                        margin: "0"
                      },
                      onbeforeupdate(vnode) {
                        vnode.state.data.value = isThinkControl
                      },
                      onclick: () => {
                        modalDraft.thinkControl = !isThinkControl
                        m.redraw()
                      }
                    }
                  )
                ]
              ),

              // 仅在第一重开启时展示第二重思考开关及强度
              isThinkControl
                ? m(
                  "",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.8rem",
                      paddingTop: "0.8rem",
                      borderTop: `0.1rem dashed ${getColor("gray_1").front}22`
                    }
                  },
                  [
                    // 第二重思考开关
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
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
                          trs("输入栏/参数/深度思考", {
                            cn: "深度思考",
                            en: "Deep Thinking"
                          })
                        ),
                        m(
                          Box,
                          {
                            color: "yellow",
                            isSwitch: true,
                            value: isEnableThinking,
                            style: {
                              margin: "0"
                            },
                            onbeforeupdate(vnode) {
                              vnode.state.data.value = isEnableThinking
                            },
                            onclick: () => {
                              modalDraft.enableThinking = !isEnableThinking
                              m.redraw()
                            }
                          }
                        )
                      ]
                    ),

                    // 思考强度选择
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
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
                          trs("输入栏/参数/思考强度", {
                            cn: "思考强度",
                            en: "Thinking Strength"
                          })
                        ),
                        m(
                          "",
                          {
                            style: {
                              display: "flex",
                              gap: "0.5rem"
                            }
                          },
                          [
                            {
                              level: "low",
                              label: trs("输入栏/参数/强度快速", {
                                cn: "快速 (1)",
                                en: "Fast (1)"
                              })
                            },
                            {
                              level: "medium",
                              label: trs("输入栏/参数/强度均衡", {
                                cn: "均衡 (2)",
                                en: "Balanced (2)"
                              })
                            },
                            {
                              level: "high",
                              label: trs("输入栏/参数/强度深度", {
                                cn: "深度 (3)",
                                en: "Deep (3)"
                              })
                            }
                          ].map(opt => {
                            const isActive = thinkStrength === opt.level
                            return m(
                              Tag,
                              {
                                isBtn: true,
                                color: isActive ? "yellow_1" : "gray_2",
                                styleExt: {
                                  margin: "0",
                                  fontSize: "1.2rem",
                                  padding: "0.3rem 0.8rem",
                                  borderRadius: "3rem"
                                },
                                onclick: () => {
                                  modalDraft.thinkStrength = opt.level
                                  m.redraw()
                                }
                              },
                              opt.label
                            )
                          })
                        )
                      ]
                    )
                  ]
                )
                : null
            ]
          ),

          // 卡片 2: 上下文管理 (Token压缩)
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: "3rem",
                margin: "0",
                padding: "1.2rem 1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
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
                trs("输入栏/参数/上下文压缩", {
                  cn: "上下文压缩",
                  en: "Context Compress"
                })
              ),
              m(
                Box,
                {
                  color: "main",
                  isSwitch: true,
                  value: isTokenCompress,
                  style: {
                    margin: "0"
                  },
                  onbeforeupdate(vnode) {
                    vnode.state.data.value = isTokenCompress
                  },
                  onclick: () => {
                    modalDraft.tokenCompressSwitch = !isTokenCompress
                    m.redraw()
                  }
                }
              )
            ]
          ),

          // 卡片 3: 审批同时打开编辑器
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: "3rem",
                margin: "0",
                padding: "1.2rem 1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
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
                trs("输入栏/参数/审批打开编辑器", {
                  cn: "审批同时打开编辑器",
                  en: "Open Editor on Review"
                })
              ),
              m(
                Box,
                {
                  color: "main",
                  isSwitch: true,
                  value: isAutoLaunchEditor,
                  style: {
                    margin: "0"
                  },
                  onbeforeupdate(vnode) {
                    vnode.state.data.value = isAutoLaunchEditor
                  },
                  onclick: () => {
                    modalDraft.autoLaunchEditor = !isAutoLaunchEditor
                    m.redraw()
                  }
                }
              )
            ]
          ),

          // 卡片 4: 工具免确认权限
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: "3rem",
                margin: "0",
                padding: "1.2rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem"
              }
            },
            [
              // 标题与操作栏（外置添加工具按钮）
              m(
                "",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }
                },
                [
                  m(
                    "",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem"
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
                        trs("输入栏/参数/工具免确认权限", {
                          cn: "工具免确认权限",
                          en: "Skip Tool Confirmation"
                        })
                      ),
                      m(
                        "span",
                        {
                          style: {
                            fontSize: "1.2rem",
                            opacity: 0.6
                          }
                        },
                        `(${skipConfirmTools.length})`
                      )
                    ]
                  ),

                  // ➕ 添加工具按钮
                  m(
                    Tag,
                    {
                      isBtn: true,
                      color: "yellow_1",
                      styleExt: {
                        margin: "0",
                        fontSize: "1.2rem",
                        padding: "0.3rem 0.8rem",
                        borderRadius: "3rem"
                      },
                      onclick: () => {
                        Notice.launch({
                          sign: "chat_tool_select_modal",
                          tip: trs("输入栏/参数/选择免确认工具", {
                            cn: "选择免确认工具",
                            en: "Select Tools to Skip Confirmation"
                          }),
                          hideBtn: 2, // 仅展示关闭按钮
                          content: ChatToolSelect,
                          contentAttrs: {
                            toolsList,
                            modalDraft,
                            onToggleTool: (toolId) => {
                              if (modalDraft.skipConfirmTools.includes(toolId)) {
                                modalDraft.skipConfirmTools = modalDraft.skipConfirmTools.filter(id => id !== toolId)
                              } else {
                                modalDraft.skipConfirmTools = [...modalDraft.skipConfirmTools, toolId]
                              }
                              m.redraw()
                            }
                          }
                        })
                      }
                    },
                    trs("输入栏/参数/添加工具按钮", {
                      cn: "+ 添加工具",
                      en: "+ Add Tool"
                    })
                  )
                ]
              ),

              m(
                "div",
                {
                  style: {
                    fontSize: "1.2rem",
                    opacity: 0.6
                  }
                },
                trs("输入栏/参数/工具免确认说明", {
                  cn: "加入白名单的工具在被 AI 调用时将直接放行，无需每次手动确认",
                  en: "Whitelisted tools will execute directly when called by AI without popup confirmation"
                })
              ),

              // 纯粹的已选标签流容器
              m(
                "",
                {
                  style: {
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.8rem",
                    paddingTop: "0.4rem",
                    alignItems: "center",
                    minHeight: "2.4rem"
                  }
                },
                skipConfirmTools.length === 0
                  ? [
                    m(
                      "span",
                      {
                        key: "empty_tip",
                        style: {
                          fontSize: "1.2rem",
                          opacity: 0.5,
                          padding: "0.2rem 0"
                        }
                      },
                      trs("输入栏/参数/暂无免确认工具", {
                        cn: "暂无免确认工具（点击右上角“+ 添加工具”）",
                        en: "No tools configured (click '+ Add Tool' above)"
                      })
                    )
                  ]
                  : skipConfirmTools.map(toolId => {
                    const name = getToolDisplayName(toolId)
                    return m(
                      Tag,
                      {
                        key: toolId,
                        color: "main",
                        styleExt: {
                          margin: "0",
                          fontSize: "1.3rem",
                          padding: "0.4rem 1rem",
                          borderRadius: "3rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.5rem"
                        }
                      },
                      [
                        m("span", name),
                        m(
                          "span",
                          {
                            style: {
                              cursor: "pointer",
                              opacity: 0.7,
                              fontSize: "1.2rem",
                              paddingLeft: "0.2rem"
                            },
                            onclick: (e) => {
                              e.stopPropagation()
                              modalDraft.skipConfirmTools = modalDraft.skipConfirmTools.filter(id => id !== toolId)
                              m.redraw()
                            }
                          },
                          "✕"
                        )
                      ]
                    )
                  })
              )
            ]
          )
        ]
      )
    }
  }
}
