import m from "/@npm/mithril.js"
import Tag from "../common/tag.js"
import { trs } from "../common/i18n.js"
import chatData from "./chatData.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"

export default () => {
  return {
    view({ attrs }) {
      const { targetChatListId, targetSession, updateListSession } = attrs
      if (!targetSession) return null

      const currentMode = targetSession.toolAccessMode || "readWrite"
      const currentStage = targetSession.workStage || "无附加"

      return m("",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: `${getSize(2)}rem`,
            ...attrs.style
          }
        },
        [
          // 模式选择分段槽 (工具读写 / 仅聊天)
          m(Tag,
            {
              color: "gray_4",
              styleExt: {
                margin: 0,
                padding: `${getSize(1)}rem`,
                height: "unset",
                display: "inline-flex",
                alignItems: "center"
              },
            },
            [
              m(Tag,
                {
                  isBtn: true,
                  color: currentMode === "readWrite" ? "main" : "gray_4",
                  styleExt: {
                    margin: 0
                  },
                  ext: {
                    onclick: async () => {
                      try {
                        if (updateListSession) {
                          await updateListSession(targetChatListId, { toolAccessMode: "readWrite" })
                        }
                      } catch (err) {
                        console.error("[ChatSendQuickMenu]", err)
                      }
                    }
                  }
                },
                trs("下拉栏/读写模式", { cn: "工具读写", en: "Read/Write" })
              ),

              m(Tag,
                {
                  isBtn: true,
                  color: currentMode === "readOnly" ? "main" : "gray_4",
                  styleExt: {
                    margin: 0
                  },
                  ext: {
                    onclick: async () => {
                      try {
                        if (updateListSession) {
                          await updateListSession(targetChatListId, { toolAccessMode: "readOnly" })
                        }
                      } catch (err) {
                        console.error("[ChatSendQuickMenu]", err)
                      }
                    }
                  }
                },
                trs("下拉栏/只读模式", { cn: "只读", en: "Read Only" })
              ),

              m(Tag,
                {
                  isBtn: true,
                  color: currentMode === "chatOnly" ? "main" : "gray_4",
                  styleExt: {
                    margin: 0
                  },
                  ext: {
                    onclick: async () => {
                      try {
                        if (updateListSession) {
                          await updateListSession(targetChatListId, { toolAccessMode: "chatOnly" })
                        }
                      } catch (err) {
                        console.error("[ChatSendQuickMenu]", err)
                      }
                    }
                  }
                },
                trs("下拉栏/仅聊天", { cn: "仅聊天", en: "Chat Only" })
              )
            ]
          ),

          // 附加阶段指令分段槽 (无附加 / 调查并讨论 / 规划任务 / 执行任务)
          m(Tag,
            {
              color: "gray_4",
              styleExt: {
                margin: 0,
                padding: `${getSize(1)}rem`,
                height: "unset",
                display: "inline-flex",
                alignItems: "center"
              },
            },
            [
              chatData.getStageOptions().map(opt => {
                const isSelected = currentStage === opt.value
                return m(Tag,
                  {
                    key: opt.value,
                    isBtn: true,
                    color: isSelected ? "pink_1" : "gray_4",
                    styleExt: {
                      margin: 0
                    },
                    ext: {
                      onclick: async () => {
                        try {
                          if (updateListSession) {
                            const updateData = { workStage: opt.value }
                            if (opt.value === "调查并讨论") {
                              updateData.toolAccessMode = "readOnly"
                            } else {
                              updateData.toolAccessMode = "readWrite"
                            }
                            await updateListSession(targetChatListId, updateData)
                          }
                        } catch (err) {
                          console.error("[ChatSendQuickMenu]", err)
                        }
                      }
                    }
                  },
                  opt.label
                )
              })
            ]
          )
        ]
      )
    }
  }
}


