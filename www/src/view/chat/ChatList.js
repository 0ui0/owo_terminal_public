import data from "./chatData.js"
import ChatItem from "./ChatItem.js"
import comData from "../../comData/comData.js"
import chatData from "./chatData.js"
import Box from "../common/box.js"
import ChatConfirm from "./ChatConfirm.js"
import ChatTerm from "./ChatTerm.js"
import ToolCallGroup from "./ToolCallGroup.js"

export default () => {
  return {
    view({ attrs }) {
      let chatList = attrs.chatList

      // 按 toolCallGroupId 分组消息
      let chatGroups = []
      let currentToolCallGroup = null
      chatList?.data?.forEach((chat) => {
        const toolCallGroupId = chat.ask?.toolCallGroupId
        if (toolCallGroupId) {
          if (!currentToolCallGroup || currentToolCallGroup.toolCallGroupId !== toolCallGroupId) {
            currentToolCallGroup = { toolCallGroupId: toolCallGroupId, chats: [chat] }
            chatGroups.push(currentToolCallGroup)
          } else {
            currentToolCallGroup.chats.push(chat)
          }
        } else {
          currentToolCallGroup = null
          chatGroups.push({ toolCallGroupId: null, chats: [chat] })
        }
      })

      return m("", {
        style: {
          flex: 1,
          marginBottom: "1rem",
          borderRadius: "3rem",
          background: "#47464e99",
          border: "0.1rem solid #755d5c",
          height: "100%",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr",
          overflow: "hidden",
        }
      }, [


        m(`#chatList_${chatList?.id || 0}.chatList`, {
          style: {
            height: "100%",
            overflowY: "auto",
            position: "relative",
          }
        }, [
          // Header with Back Button logic
          m(Box, {
            style: {
              position: "sticky",
              top: "0",
              zIndex: 10,
              background: "#4f4f5a", // Opaque background to cover scrolling content
              marginTop: "0",
            },
            async onclick() {
              if (chatList?.id && chatList.id !== 0) {
                // Back to Parent
                // If linkid is undefined, fallback to 0. If linkid exists, go to it.
                // Note: linkid 0 is Main.
                await comData.data.edit(d => d.targetChatListId = chatList.linkid || 0);
              } else {
                // Debug / Refresh
                await comData.data.edit(() => { })
                await comData.pullData()
                console.log("chatLists", comData.data.get().chatLists)
              }
            },
          }, chatList?.id === 0 ? "消息列表" : `⬅ 返回上一级 (子会话 ${chatList?.id})`),

          // 渲染分组后的消息
          chatGroups.map(chatGroup => {
            if (chatGroup.toolCallGroupId) {
              // 工具调用组 - 折叠显示
              return m(ToolCallGroup, { key: chatGroup.toolCallGroupId, chats: chatGroup.chats })
            } else {
              // 普通消息
              const chat = chatGroup.chats[0]
              return m(ChatItem, {
                key: chat.uuid,
                chat,
              })
            }
          }),

          chatList?.replying ?
            m(ChatItem, {
              chat: {
                group: "preparing",
                content: chatList?.streamChunks,
                timestamp: Date.now(),
              }
            }) : null,

          chatList?.confirmCmds?.filter(confirmCmd => confirmCmd.confirm === "pending").map((confirmCmd) => {
            return m(ChatConfirm, {
              confirmCmd,
              chatList
            })
          })
        ]),


      ])
    }
  }
}