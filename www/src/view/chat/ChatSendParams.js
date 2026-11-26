import m from "/@npm/mithril.js"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"
import settingData from "../setting/settingData.js"
import Notice from "../common/notice.js"
import ChatToolSelect from "./ChatToolSelect.js"
import getSize from "../common/getSize.js"

export default () => {
  let toolsList = []
  let allToolsList = []
  let loadingTools = true
  let modalDraft = null

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
        autoConfirmWorkspacePatch: !!targetSession?.autoConfirmWorkspacePatch,
        confirmDeleteScope: Number(targetSession?.confirmDeleteScope ?? 0),
        skipConfirmTools: [...(targetSession?.skipConfirmTools || [])],
        allowUseTools: Array.isArray(targetSession?.allowUseTools) ? [...targetSession.allowUseTools] : null
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
                autoConfirmWorkspacePatch: modalDraft.autoConfirmWorkspacePatch,
                confirmDeleteScope: modalDraft.confirmDeleteScope,
                skipConfirmTools: modalDraft.skipConfirmTools,
                allowUseTools: modalDraft.allowUseTools
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
          const resAll = await settingData.fnCall("getToolsList", [targetChatListId || 0, "all"])
          if (resAll?.ok && Array.isArray(resAll.data)) {
            allToolsList = resAll.data
          }
        }
      } catch (e) {
        console.warn("[ChatSendParamsModal] 加载工具列表失败:", e)
      } finally {
        loadingTools = false
        m.redraw()
      }
    },

    view(vnode) {
      if (!modalDraft) return null

      const isThinkControl = !!modalDraft.thinkControl
      const isEnableThinking = !!modalDraft.enableThinking
      const thinkStrength = modalDraft.thinkStrength || "medium"
      const isTokenCompress = modalDraft.tokenCompressSwitch ?? true
      const isAutoLaunchEditor = !!modalDraft.autoLaunchEditor
      const isAutoConfirmWorkspace = !!modalDraft.autoConfirmWorkspacePatch
      const confirmDeleteScope = Number(modalDraft.confirmDeleteScope ?? 0)
      const skipConfirmTools = modalDraft.skipConfirmTools || []
      const allowUseToolIdList = modalDraft.allowUseTools

      return m(
        "",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: `${getSize(3)}rem`,
            padding: `${getSize(3)}rem`,
            color: getColor("gray_1").front
          }
        },
        [
          // 卡片 1: 深度思考配置
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2.5)}rem`
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
                        fontSize: `${getSize(4)}rem`
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
                      gap: `${getSize(2)}rem`,
                      paddingTop: `${getSize(2)}rem`,
                      borderTop: `${getSize(0.25)}rem dashed ${getColor("gray_1").front}22`
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
                              fontSize: `${getSize(4)}rem`
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
                            color: "main",
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
                              fontSize: `${getSize(4)}rem`
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
                              gap: `${getSize(1)}rem`
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
                                  fontSize: `${getSize(3)}rem`,
                                  padding: `${getSize(1)}rem ${getSize(2)}rem`,
                                  borderRadius: `${getSize(8)}rem`
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
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
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
                    fontSize: `${getSize(4)}rem`
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
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
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
                    fontSize: `${getSize(4)}rem`
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

          // 卡片 3.5: 工作目录内编辑文件免确认
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(1.5)}rem`
              }
            },
            [
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
                        fontSize: `${getSize(4)}rem`
                      }
                    },
                    trs("输入栏/参数/工作目录内编辑免确认", {
                      cn: "文件增删改工具：工作目录编辑免确认",
                      en: "filePatcher: Auto-confirm Edits in Workspace"
                    })
                  ),
                  m(
                    Box,
                    {
                      color: "main",
                      isSwitch: true,
                      value: isAutoConfirmWorkspace,
                      style: {
                        margin: "0"
                      },
                      onbeforeupdate(vnode) {
                        vnode.state.data.value = isAutoConfirmWorkspace
                      },
                      onclick: () => {
                        modalDraft.autoConfirmWorkspacePatch = !isAutoConfirmWorkspace
                        m.redraw()
                      }
                    }
                  )
                ]
              ),
              m(
                "div",
                {
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    opacity: 0.6,
                    lineHeight: `${getSize(4)}rem`
                  }
                },
                trs("输入栏/参数/工作目录内编辑免确认说明", {
                  cn: "此项仅对“文件增删改工具”生效，对终端等其它工具无效。开启后，仅在当前工作目录内编辑文件时自动放行；若下方配置了该工具的免确认白名单，则以全系统免确认优先，但不包含删除文件。",
                  en: "This setting only applies to \"filePatcher\" and does not affect terminal or other tools. When enabled, file edits inside the current workspace are auto-approved; if whitelisted below, full-system skip takes priority, excluding file deletion."
                })
              )
            ]
          ),

          // 卡片 3.6: 删除文件免确认 (3档分段器)
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`
              }
            },
            [
              m(
                "",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: `${getSize(1)}rem`
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
                    trs("输入栏/参数/删除文件免确认", {
                      cn: "文件增删改工具：删除文件免确认",
                      en: "filePatcher: Skip Confirm for File Deletion"
                    })
                  ),
                  m(
                    "",
                    {
                      style: {
                        display: "inline-flex",
                        borderRadius: `${getSize(8)}rem`,
                        background: getColor("确认框输入背景"),
                        padding: `${getSize(1)}rem`
                      }
                    },
                    [
                      m(
                        Tag,
                        {
                          isBtn: true,
                          color: confirmDeleteScope === 0 ? "main" : "gray_2",
                          styleExt: {
                            margin: "0",
                            borderRadius: `${getSize(8)}rem 0 0 ${getSize(8)}rem`,
                            cursor: "pointer",
                            fontSize: `${getSize(3)}rem`,
                            padding: `${getSize(0.5)}rem ${getSize(2)}rem`,
                            opacity: confirmDeleteScope === 0 ? 1 : 0.6
                          },
                          onclick: () => {
                            modalDraft.confirmDeleteScope = 0
                            m.redraw()
                          }
                        },
                        trs("输入栏/参数/删除免确认_关闭", {
                          cn: "关闭",
                          en: "Off"
                        })
                      ),
                      m(
                        Tag,
                        {
                          isBtn: true,
                          color: confirmDeleteScope === 1 ? "main" : "gray_2",
                          styleExt: {
                            margin: "0",
                            borderRadius: "0",
                            cursor: "pointer",
                            fontSize: `${getSize(3)}rem`,
                            padding: `${getSize(0.5)}rem ${getSize(2)}rem`,
                            opacity: confirmDeleteScope === 1 ? 1 : 0.6
                          },
                          onclick: () => {
                            modalDraft.confirmDeleteScope = 1
                            m.redraw()
                          }
                        },
                        trs("输入栏/参数/删除免确认_工作目录", {
                          cn: "工作目录",
                          en: "Workspace"
                        })
                      ),
                      m(
                        Tag,
                        {
                          isBtn: true,
                          color: confirmDeleteScope === 2 ? "main" : "gray_2",
                          styleExt: {
                            margin: "0",
                            borderRadius: `0 ${getSize(8)}rem ${getSize(8)}rem 0`,
                            cursor: "pointer",
                            fontSize: `${getSize(3)}rem`,
                            padding: `${getSize(0.5)}rem ${getSize(2)}rem`,
                            opacity: confirmDeleteScope === 2 ? 1 : 0.6
                          },
                          onclick: () => {
                            modalDraft.confirmDeleteScope = 2
                            m.redraw()
                          }
                        },
                        trs("输入栏/参数/删除免确认_全系统", {
                          cn: "全系统",
                          en: "System"
                        })
                      )
                    ]
                  )
                ]
              ),
              m(
                "div",
                {
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    opacity: 0.6,
                    lineHeight: `${getSize(4)}rem`
                  }
                },
                trs("输入栏/参数/删除文件免确认说明", {
                  cn: "此项仅对“文件增删改工具”的删除操作生效（对终端等工具无效）。设为“关闭”时，全系统任何删除均需人工确认（即使下方配置了免确认工具也会被拦截）；设为“工作目录”时，仅工作区内删除免确认；设为“全系统”时，所有删除均直接放行。",
                  en: "This setting only applies to file deletions by \"filePatcher\" (not terminal). When set to \"Off\", all file deletions require manual confirmation even if whitelisted below; \"Workspace\" auto-approves deletions inside workspace; \"System\" auto-approves all deletions."
                })
              )
            ]
          ),

          // 卡片 4: 工具免确认权限
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`
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
                        gap: `${getSize(2)}rem`
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
                        trs("输入栏/参数/工具免确认权限", {
                          cn: "工具免确认权限",
                          en: "Skip Tool Confirmation"
                        })
                      ),
                      m(
                        "span",
                        {
                          style: {
                            fontSize: `${getSize(3)}rem`,
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
                        fontSize: `${getSize(3)}rem`,
                        padding: `${getSize(1)}rem ${getSize(2)}rem`,
                        borderRadius: `${getSize(8)}rem`
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
                            getSelectedList: () => modalDraft.skipConfirmTools,
                            onSetAll: (idList) => {
                              modalDraft.skipConfirmTools = [...idList]
                              m.redraw()
                            },
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
                    fontSize: `${getSize(3)}rem`,
                    opacity: 0.6
                  }
                },
                trs("输入栏/参数/工具免确认说明", {
                  cn: "加入白名单的工具在被 AI 调用时将直接全系统放行，无需每次手动确认。若在白名单中配置了“文件增删改工具”，其免确认权限不包含删除文件，需要在上方开关中单独配置。",
                  en: "Whitelisted tools will execute system-wide without confirmation when called by AI. If \"filePatcher\" is whitelisted, deletion is not included and must be configured separately in the switch above."
                })
              ),

              skipConfirmTools.length === 0
                ? m("div", {
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    opacity: 0.5,
                    paddingLeft: `${getSize(0.5)}rem`,
                    paddingTop: `${getSize(1)}rem`
                  }
                }, trs("输入栏/参数/暂无免确认工具", {
                  cn: "暂无免确认工具（点击右上角“+ 添加工具”）",
                  en: "No tools configured (click '+ Add Tool' above)"
                }))
                : null
            ]
          ),

          // 卡片: 工具许可（只有列入名单的工具才允许被 AI 调用）
          m(
            Box,
            {
              color: "gray_4",
              style: {
                borderRadius: `${getSize(8)}rem`,
                margin: "0",
                padding: `${getSize(3)}rem ${getSize(4)}rem`,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(3)}rem`
              }
            },
            [
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
                        gap: `${getSize(2)}rem`
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
                        trs("输入栏/参数/工具许可", {
                          cn: "工具许可",
                          en: "Tool Access"
                        })
                      ),
                      m(
                        "span",
                        {
                          style: {
                            fontSize: `${getSize(3)}rem`,
                            opacity: 0.6
                          }
                        },
                        allowUseToolIdList === null
                          ? trs("输入栏/参数/工具许可未限制标记", {
                            cn: "未限制",
                            en: "Unrestricted"
                          })
                          : `(${allowUseToolIdList.length})`
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
                      m(
                        Tag,
                        {
                          isBtn: true,
                          color: "yellow_1",
                          styleExt: {
                            margin: "0",
                            fontSize: `${getSize(3)}rem`,
                            padding: `${getSize(1)}rem ${getSize(2)}rem`,
                            borderRadius: `${getSize(8)}rem`
                          },
                          onclick: () => {
                            Notice.launch({
                              sign: "chat_tool_access_modal_" + vnode.attrs.targetChatListId,
                              tip: trs("输入栏/参数/选择工具许可", {
                                cn: "选择允许使用的工具",
                                en: "Select Allowed Tools"
                              }),
                              hideBtn: 2,
                              content: ChatToolSelect,
                              contentAttrs: {
                                toolsList: allToolsList,
                                getSelectedList: () => modalDraft.allowUseTools || [],
                                onSetAll: (idList) => {
                                  modalDraft.allowUseTools = [...idList]
                                  m.redraw()
                                },
                                onToggleTool: (toolId) => {
                                  const currentList = modalDraft.allowUseTools || []
                                  if (currentList.includes(toolId)) {
                                    modalDraft.allowUseTools = currentList.filter(id => id !== toolId)
                                  } else {
                                    modalDraft.allowUseTools = [...currentList, toolId]
                                  }
                                  m.redraw()
                                }
                              }
                            })
                          }
                        },
                        trs("输入栏/参数/选择工具按钮", {
                          cn: "选择工具",
                          en: "Select Tools"
                        })
                      )
                    ]
                  )
                ]
              ),

              m(
                "div",
                {
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    opacity: 0.6
                  }
                },
                trs("输入栏/参数/工具许可说明", {
                  cn: "只有列入名单的工具才允许被 AI 调用；未设置时不受限制，名单为空时全部禁用",
                  en: "Only listed tools can be called by AI; unrestricted when unset, all disabled when the list is empty"
                })
              ),

              allowUseToolIdList === null || allowUseToolIdList.length === 0
                ? m("div", {
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    opacity: 0.5,
                    paddingLeft: `${getSize(0.5)}rem`,
                    paddingTop: `${getSize(1)}rem`
                  }
                }, allowUseToolIdList === null
                  ? trs("输入栏/参数/工具许可未限制说明", {
                    cn: "当前未限制，全部可用工具均可被调用",
                    en: "Currently unrestricted: every available tool can be called"
                  })
                  : trs("输入栏/参数/工具许可全禁说明", {
                    cn: "名单为空，全部工具均被禁用",
                    en: "The list is empty: all tools are disabled"
                  }))
                : null
            ]
          )
        ]
      )
    }
  }
}
