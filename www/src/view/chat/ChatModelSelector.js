import m from "mithril"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import Notice from "../common/notice.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"
import settingData from "../setting/settingData.js"
import { launchModelWizard } from "../setting/settingModelWizard.js"
import chatData from "./chatData.js"
import comData from "../../comData/comData.js"

export default () => {
  let selectedModelId = ""
  let selectedChatListId = null
  let coverPrompt = true
  let clearContext = false

  return {
    oninit({ attrs }) {
      const chatLists = comData.data.get().chatLists
      selectedChatListId = attrs.targetChatListId !== undefined ? attrs.targetChatListId : chatLists[0].id

      const targetSession = attrs.targetSession || chatLists.find(l => l.id === selectedChatListId)
      selectedModelId = targetSession.currentModelId

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

            chatData?.inputDom?.focus()
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
            gap: "1rem",
            padding: "1rem",
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
                gap: "0.5rem"
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: "1.2rem",
                    color: getColor("gray_1").front,
                    marginLeft: "0.5rem"
                  }
                },
                trs("组件/提示/选择目标会话", { cn: "目标会话队列", en: "Target Session Queue" })
              ),
              m("select",
                {
                  value: selectedChatListId,
                  onchange: (e) => {
                    selectedChatListId = Number(e.target.value)
                    const session = chatLists.find(l => l.id === selectedChatListId)
                    selectedModelId = session.currentModelId
                  },
                  style: {
                    padding: "1rem 1.5rem",
                    borderRadius: "3rem",
                    border: "none",
                    background: getColor("gray_4").back,
                    color: getColor("gray_4").front,
                    outline: "none",
                    fontSize: "1.2rem",
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
                margin: "0 0.5rem"
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: "1.6rem",
                    color: getColor("gray_1").front
                  }
                },
                trs("输入栏/标签/可用模型列表", { cn: "可用模型", en: "Available Models" })
              ),
              m(Tag,
                {
                  isBtn: true,
                  color: "main",
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
                },
                [
                  m.trust(window.iconPark.getIcon("Plus", {
                    size: "1.2rem",
                    fill: getColor("main").front
                  })),
                  m("span",
                    {
                      style: {
                        marginLeft: "0.5rem"
                      }
                    },
                    trs("输入栏/按钮/添加模型", { cn: "添加模型", en: "Add Model" })
                  )
                ]
              )
            ]
          ),

          // 模型列表卡片（采用 3rem 经典圆角 Box，字号基准 1.5rem + 副标 1.2rem）
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                maxHeight: "24rem",
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
                    borderRadius: "3rem",
                    margin: "0",
                    padding: "1rem 1.5rem",
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
                        gap: "0.2rem",
                        textAlign: "left"
                      }
                    },
                    [
                      m("span",
                        model.name
                      ),
                      m("span",
                        {
                          style: {
                            fontSize: "1.2rem",
                            opacity: 0.6
                          }
                        },
                        model.model
                      )
                    ]
                  ),
                  isSelected ?
                    m.trust(window.iconPark.getIcon("CheckOne", {
                      size: "1.8rem",
                      fill: getColor("main").front
                    })) : null
                ]
              )
            })
          ),

          // 选项控制区（经典 3rem 大圆角，带手画滑动开关胶囊）
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                marginTop: "0.5rem"
              }
            },
            [
              // 选项1：覆盖初始提示词
              m(Box,
                {
                  isBtn: true,
                  color: coverPrompt ? "main" : "gray_4",
                  style: {
                    borderRadius: "3rem",
                    margin: "0",
                    padding: "1rem 1.5rem",
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
                    trs("输入栏/选项/覆盖初始提示词", { cn: "覆盖初始提示词", en: "Override initial prompt" })
                  ),
                  m("",
                    {
                      style: {
                        width: "3.6rem",
                        height: "2rem",
                        borderRadius: "3rem",
                        background: coverPrompt ? getColor("main").front : `${getColor("gray_4").front}33`,
                        position: "relative",
                        transition: "background 0.3s"
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            width: "1.6rem",
                            height: "1.6rem",
                            borderRadius: "50%",
                            background: coverPrompt ? getColor("main").back : getColor("gray_4").front,
                            position: "absolute",
                            top: "0.2rem",
                            left: coverPrompt ? "1.8rem" : "0.2rem",
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
                    borderRadius: "3rem",
                    margin: "0",
                    padding: "1rem 1.5rem",
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
                    trs("输入栏/选项/清空上下文阅读历史", { cn: "清空上下文并插入历史阅读提示", en: "Clear temp context and insert read history prompt" })
                  ),
                  m("",
                    {
                      style: {
                        width: "3.6rem",
                        height: "2rem",
                        borderRadius: "3rem",
                        background: clearContext ? getColor("main").front : `${getColor("gray_4").front}33`,
                        position: "relative",
                        transition: "background 0.3s"
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            width: "1.6rem",
                            height: "1.6rem",
                            borderRadius: "50%",
                            background: clearContext ? getColor("main").back : getColor("gray_4").front,
                            position: "absolute",
                            top: "0.2rem",
                            left: clearContext ? "1.8rem" : "0.2rem",
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
