import m from "/@npm/mithril.js"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import IconTag from "../common/iconTag.js"
import Notice from "../common/notice.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"
import settingData from "../setting/settingData.js"
import { launchModelWizard } from "../setting/settingModelWizard.js"
import chatData from "./chatData.js"
import comData from "../../comData/comData.js"
import getSize from "../common/getSize.js"

export default () => {
  let selectedModelId = ""
  let selectedChatListId = null
  let coverPrompt = true
  let clearContext = false
  let thinkControl = false
  let enableThinking = false
  let thinkStrength = "medium"

  const syncThinkingFromSession = (session) => {
    thinkControl = !!session?.thinkControl
    enableThinking = !!session?.enableThinking
    thinkStrength = session?.thinkStrength || "medium"
  }

  const updateThinkingConfig = async (updates) => {
    if (updates.thinkControl !== undefined) thinkControl = updates.thinkControl
    if (updates.enableThinking !== undefined) enableThinking = updates.enableThinking
    if (updates.thinkStrength !== undefined) thinkStrength = updates.thinkStrength

    chatData.initSessionState(selectedChatListId, updates)
    await settingData.fnCall("updateListConfig", [selectedChatListId, updates])
    m.redraw()
  }

  return {
    oninit({ attrs }) {
      const chatLists = comData.data.get().chatLists
      selectedChatListId = attrs.targetChatListId !== undefined ? attrs.targetChatListId : chatLists[0].id

      const targetSession = attrs.targetSession || chatData.getSessionState(selectedChatListId) || chatLists.find(l => l.id === selectedChatListId)
      selectedModelId = targetSession?.currentModelId || ""
      syncThinkingFromSession(targetSession)

      const noticeConfig = attrs.noticeConfig
      if (noticeConfig) {
        noticeConfig.confirm = async () => {
          if (!selectedModelId) {
            Notice.launch({
              msg: trs("输入栏/提示/请先选择模型", { cn: "请先选择一个模型", en: "Please select a model first" }),
              color: "yellow"
            })
            return true
          }

          try {
            let res = await settingData.fnCall("switchModel", [{
              listId: selectedChatListId,
              modelId: selectedModelId,
              options: { coverPrompt, clearContext }
            }])

            if (!res.ok) {
              Notice.launch({
                msg: res.msg,
                color: "pink"
              })
              return true
            }

            if (attrs.updateListSession) {
              attrs.updateListSession(selectedChatListId, { currentModelId: selectedModelId })
            }

            chatData.focusEditor?.focus()
            return undefined
          } catch (err) {
            console.error(err)
            Notice.launch({ msg: err.message, color: "pink" })
            return true
          }
        }
      }
    },

    view({ attrs }) {
      const allModels = settingData.options.get("ai_aiList").filter(m => m.switch)
      const chatLists = comData.data.get().chatLists

      return m("",
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
          // 无条件显示的会话选择区
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: `${getSize(4)}rem`,
                    color: getColor("gray_1").front,
                    marginLeft: `${getSize(1)}rem`
                  }
                },
                trs("组件/提示/选择目标会话", { cn: "目标会话队列", en: "Target Session Queue" })
              ),
              m("select",
                {
                  value: selectedChatListId,
                  onchange: (e) => {
                    selectedChatListId = Number(e.target.value)
                    const session = chatData.getSessionState(selectedChatListId) || chatLists.find(l => l.id === selectedChatListId)
                    selectedModelId = session?.currentModelId || ""
                    syncThinkingFromSession(session)
                  },
                  style: {
                    padding: `${getSize(2.5)}rem ${getSize(4)}rem`,
                    borderRadius: `${getSize(8)}rem`,
                    border: "none",
                    background: getColor("gray_4").back,
                    color: getColor("gray_4").front,
                    outline: "none",
                    fontSize: `${getSize(4)}rem`,
                    appearance: "none",
                    cursor: "pointer"
                  }
                },
                chatLists.map(list => m("option", { value: list.id }, `${list.name || '主会话'} (ID: ${list.id})`))
              )
            ]
          ),

          // 顶部栏：L3 字号标题与添加模型向导 Tag
          m("",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                margin: `0 ${getSize(1)}rem`
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: `${getSize(4)}rem`,
                    color: getColor("gray_1").front
                  }
                },
                trs("输入栏/标签/可用模型列表", { cn: "可用模型", en: "Available Models" })
              ),
              m(IconTag,
                {
                  iconName: "Plus",
                  bgColor: getColor("main").back,
                  fgColor: getColor("main").front,
                  ext: {
                    onclick: () => {
                      launchModelWizard({
                        onSuccess: async (newModelObj) => {
                          await settingData.options.pull()
                          if (newModelObj && newModelObj.id) {
                            selectedModelId = newModelObj.id
                          }
                          m.redraw()
                        }
                      })
                    }
                  }
                },
                trs("输入栏/按钮/添加模型", { cn: "添加模型", en: "Add Model" })
              )
            ]
          ),

          // 模型列表卡片（采用 3rem 经典圆角 Box，字号基准 1.6rem + 副标 1.2rem）
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`,
                maxHeight: `${getSize(60)}rem`,
                overflowY: "auto"
              }
            },
            allModels.map(model => {
              const isSelected = selectedModelId === model.id
              return m(Box,
                {
                  key: model.id,
                  isBtn: true,
                  color: isSelected ? "main" : "gray_4",
                  style: {
                    borderRadius: `${getSize(8)}rem`,
                    margin: "0",
                    padding: `${getSize(2.5)}rem ${getSize(4)}rem`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  },
                  onclick: () => {
                    selectedModelId = model.id
                    m.redraw()
                  }
                },
                [
                  m("",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: `${getSize(1/2)}rem`,
                        textAlign: "left"
                      }
                    },
                    [
                      m("span",
                        {
                          style: {
                            fontSize: `${getSize(4)}rem`
                          }
                        },
                        model.name
                      ),
                      m("span",
                        {
                          style: {
                            fontSize: `${getSize(3)}rem`,
                            opacity: 0.6
                          }
                        },
                        model.model
                      )
                    ]
                  ),
                  isSelected ?
                    m.trust(window.iconPark.getIcon("CheckOne", {
                      size: `${getSize(4.5)}rem`,
                      fill: getColor("main").front
                    })) : null
                ]
              )
            })
          ),

          // 深度思考配置卡片（从更多面板整合进模型选择 Notice，统一项目标题字号）
          m(Box,
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
              // 第一重开关：思考控制
              m("",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }
                },
                [
                  m("span",
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
                  m(Box,
                    {
                      color: "main",
                      isSwitch: true,
                      value: thinkControl,
                      style: {
                        margin: "0"
                      },
                      onbeforeupdate(vnode) {
                        vnode.state.data.value = thinkControl
                      },
                      onclick: async () => {
                        await updateThinkingConfig({ thinkControl: !thinkControl })
                      }
                    }
                  )
                ]
              ),

              // 仅在第一重开启时展示第二重思考开关及强度
              thinkControl
                ? m("",
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
                    // 第二重思考开关：深度思考
                    m("",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }
                      },
                      [
                        m("span",
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
                        m(Box,
                          {
                            color: "main",
                            isSwitch: true,
                            value: enableThinking,
                            style: {
                              margin: "0"
                            },
                            onbeforeupdate(vnode) {
                              vnode.state.data.value = enableThinking
                            },
                            onclick: async () => {
                              await updateThinkingConfig({ enableThinking: !enableThinking })
                            }
                          }
                        )
                      ]
                    ),

                    // 思考强度选择
                    m("",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }
                      },
                      [
                        m("span",
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
                        m("",
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
                            return m(Tag,
                              {
                                isBtn: true,
                                color: isActive ? "yellow_1" : "gray_2",
                                styleExt: {
                                  margin: "0",
                                  fontSize: `${getSize(3)}rem`,
                                  padding: `${getSize(1)}rem ${getSize(2)}rem`,
                                  borderRadius: `${getSize(8)}rem`
                                },
                                onclick: async () => {
                                  await updateThinkingConfig({ thinkStrength: opt.level })
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

          // 选项控制区（标题字号统一 getSize(4)）
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`,
                marginTop: `${getSize(1)}rem`
              }
            },
            [
              // 选项1：覆盖初始提示词
              m(Box,
                {
                  isBtn: true,
                  color: coverPrompt ? "main" : "gray_4",
                  style: {
                    borderRadius: `${getSize(8)}rem`,
                    margin: "0",
                    padding: `${getSize(2.5)}rem ${getSize(4)}rem`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  },
                  onclick: () => {
                    coverPrompt = !coverPrompt
                    m.redraw()
                  }
                },
                [
                  m("span",
                    {
                      style: {
                        fontSize: `${getSize(4)}rem`
                      }
                    },
                    trs("输入栏/选项/覆盖初始提示词", { cn: "覆盖初始提示词", en: "Override initial prompt" })
                  ),
                  m("",
                    {
                      style: {
                        width: `${getSize(9)}rem`,
                        height: `${getSize(5)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        background: coverPrompt ? getColor("main").front : `${getColor("gray_4").front}33`,
                        position: "relative",
                        transition: "background 0.3s"
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            width: `${getSize(4)}rem`,
                            height: `${getSize(4)}rem`,
                            borderRadius: "50%",
                            background: coverPrompt ? getColor("main").back : getColor("gray_4").front,
                            position: "absolute",
                            top: `${getSize(0.5)}rem`,
                            left: coverPrompt ? `${getSize(4.5)}rem` : `${getSize(0.5)}rem`,
                            transition: "left 0.3s"
                          }
                        }
                      )
                    ]
                  )
                ]
              ),

              // 选项2：清空临时上下文
              m(Box,
                {
                  isBtn: true,
                  color: clearContext ? "main" : "gray_4",
                  style: {
                    borderRadius: `${getSize(8)}rem`,
                    margin: "0",
                    padding: `${getSize(2.5)}rem ${getSize(4)}rem`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  },
                  onclick: () => {
                    clearContext = !clearContext
                    m.redraw()
                  }
                },
                [
                  m("span",
                    {
                      style: {
                        fontSize: `${getSize(4)}rem`
                      }
                    },
                    trs("输入栏/选项/清空上下文阅读历史", { cn: "清空上下文并插入历史阅读提示", en: "Clear temp context and insert read history prompt" })
                  ),
                  m("",
                    {
                      style: {
                        width: `${getSize(9)}rem`,
                        height: `${getSize(5)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        background: clearContext ? getColor("main").front : `${getColor("gray_4").front}33`,
                        position: "relative",
                        transition: "background 0.3s"
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            width: `${getSize(4)}rem`,
                            height: `${getSize(4)}rem`,
                            borderRadius: "50%",
                            background: clearContext ? getColor("main").back : getColor("gray_4").front,
                            position: "absolute",
                            top: `${getSize(0.5)}rem`,
                            left: clearContext ? `${getSize(4.5)}rem` : `${getSize(0.5)}rem`,
                            transition: "left 0.3s"
                          }
                        }
                      )
                    ]
                  )
                ]
              )
            ]
          )
        ]
      )
    }
  }
}
