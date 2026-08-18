// 子智能体独立窗口组件
// 用于在 Notice 窗口中显示子智能体的聊天列表和输入栏
import ChatList from "./ChatList.js"
import InputBar from "./ChatInputBar.js"
import comData from "../../comData/comData.js"
import chatData from "./chatData.js"

export default ({ listId, agentName }) => {
  return {
    view() {
      const targetId = chatData.getSessionState(listId).lockedListId || listId;
      const chatList = comData.getChatList(targetId) || comData.getChatList(listId);
      
      if (!chatList) {
        return m("", {
          style: {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            color: "#888"
          }
        }, `子智能体会话 (ID: ${listId}) 不存在或已被清除`)
      }

      return m("", {
        style: {
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          boxSizing: "border-box",
        }
      }, [
        // 聊天列表
        m("", {
          style: {
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }
        }, [
          m(ChatList, { chatList, listId: listId })
        ]),
        // 输入栏
        m(InputBar, { listId: listId })
      ])
    }
  }
}
