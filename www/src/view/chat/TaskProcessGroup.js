import ToolCallGroup from "./ToolCallGroup.js"
import ChatItem from "./ChatItem.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"

export default () => {
  let userToggled = false
  let userExpanded = false

  return {
    view({ attrs }) {
      const groups = attrs.groups || []
      const isReplying = !!attrs.isReplying
      const listId = attrs.listId

      // 状态判断：若用户手动点击过，遵从用户意图；否则执行中默认展开，结束后默认折叠
      const expanded = userToggled ? userExpanded : isReplying

      // 统计工具数量与总用时
      let toolCount = 0
      let startTime = Infinity
      let endTime = -Infinity
      let hasError = false

      groups.forEach(group => {
        if (group.toolCallGroupId) {
          // 工具清单口径与 ToolCallGroup.js 保持一致：完成看 sysReturns，执行中看 sysCalls，二者只会有一个
          const prepareChat = group.chats.find(c => c.ask?.toolCallStage === "prepare")
          const doneChat = group.chats.find(c => c.ask?.toolCallStage === "done")
          const callList = doneChat?.ask?.sysReturns || prepareChat?.ask?.sysCalls || []
          toolCount += Math.max(1, callList.length)
        }
        group.chats.forEach(chat => {
          if (chat.timestamp) {
            startTime = Math.min(startTime, chat.timestamp)
            endTime = Math.max(endTime, chat.timestamp)
          }
          if (chat.group === "error" || chat.ask?.toolCallSuccess === false) {
            hasError = true
          }
        })
      })

      // 确保至少计 1 次操作
      if (toolCount === 0) toolCount = groups.length

      const durationSec = (startTime < Infinity && endTime > -Infinity && endTime >= startTime)
        ? Math.max(0.1, ((endTime - startTime) / 1000)).toFixed(1)
        : "0.0"

      // 纯文字摘要标签（严格遵守《样式设计指南.md》，杜绝 emoji/字符小图标）
      let statusText = ""
      if (isReplying) {
        statusText = trs("聊天/任务/执行中", {
          cn: `任务执行中 · ${toolCount}项工具 · 正在处理...`,
          en: `Task Executing · ${toolCount} tools · Processing...`
        })
      } else if (hasError) {
        statusText = trs("聊天/任务/执行异常", {
          cn: `任务异常中断 · ${toolCount}项操作 · ${durationSec}s · ${expanded ? "点击收起" : "点击展开"}`,
          en: `Task Interrupted · ${toolCount} ops · ${durationSec}s · ${expanded ? "Collapse" : "Expand"}`
        })
      } else {
        statusText = trs("聊天/任务/执行完成", {
          cn: `任务执行完成 · ${toolCount}项工具 · ${durationSec}s · ${expanded ? "点击收起" : "点击展开"}`,
          en: `Task Completed · ${toolCount} tools · ${durationSec}s · ${expanded ? "Collapse" : "Expand"}`
        })
      }

      return m("", {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          boxSizing: "border-box",
          margin: "0.6rem 0"
        }
      }, [
        // 居中折叠细线与胶囊文字
        m("", {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            margin: "0.8rem 0"
          }
        }, [
          // 左侧渐隐线
          m("", {
            style: {
              flex: 1,
              height: "0.1rem",
              background: `linear-gradient(90deg, transparent, ${getColor('gray_4').front}33)`
            }
          }),
          // 中间纯文字胶囊
          m("", {
            style: {
              margin: "0 1.2rem",
              padding: "0.35rem 1.2rem",
              borderRadius: "3rem",
              background: getColor('gray_4').back,
              color: getColor('gray_4').front,
              fontSize: "1.2rem",
              cursor: "pointer",
              userSelect: "none",
              transition: "opacity 0.2s, transform 0.15s",
              whiteSpace: "nowrap"
            },
            onmouseover(e) {
              e.currentTarget.style.opacity = "0.75"
            },
            onmouseout(e) {
              e.currentTarget.style.opacity = "1"
            },
            onclick() {
              userToggled = true
              userExpanded = !expanded
            }
          }, statusText),
          // 右侧渐隐线
          m("", {
            style: {
              flex: 1,
              height: "0.1rem",
              background: `linear-gradient(90deg, ${getColor('gray_4').front}33, transparent)`
            }
          })
        ]),

        // 展开时：原汁原味平铺渲染原有的 ToolCallGroup 与 ChatItem
        expanded ? m("", {
          style: {
            display: "flex",
            flexDirection: "column",
            width: "100%",
            padding: "0 0.5rem",
            boxSizing: "border-box"
          }
        }, groups.flatMap((group, gIdx) => {
          if (group.toolCallGroupId) {
            return m(ToolCallGroup, {
              key: `${group.toolCallGroupId}_${group.chats[0]?.uuid || gIdx}`,
              chats: group.chats
            })
          }
          return group.chats.map((chat, cIdx) => m(ChatItem, {
            key: chat.uuid || `task_chat_${gIdx}_${cIdx}`,
            chat,
            listId
          }))
        })) : null
      ])
    }
  }
}
