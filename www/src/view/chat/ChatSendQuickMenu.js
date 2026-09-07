import m from "mithril"
import Tag from "../common/tag.js"
import { trs } from "../common/i18n.js"
import chatData from "./chatData.js"
import getColor from "../common/getColor.js"

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
            margin: "1rem 1rem 0 1rem",
            flexWrap: "wrap",
            alignItems: "center",
            //justifyContent: "center",
            gap: "0.5rem",
            paddingBottom: "1rem",
            borderBottom: `0.1rem solid ${getColor("main").back}`
          }
        },
        [
          // 模式选择分段槽 (工具读写 / 仅聊天)
          m(Tag,
            {
              color: "gray_4",
              styleExt: {
                margin: 0
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
                margin: 0
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
                            await updateListSession(targetChatListId, { workStage: opt.value })
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


