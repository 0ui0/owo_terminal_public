import Box from "../common/box.js"
import comData from "../../comData/comData.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import format from "../common/format.js"
import settingData from "../setting/settingData.js"
import ChatBatchReview from "./ChatBatchReview.js"
import chatData from "./chatData.js"

export default () => {
  let localComment = ""
  let lastAutoScrollTime = 0

  return {
    oninit(vnode) {
      localComment = vnode.attrs.confirmCmd.comment || ""
    },
    view({ attrs, children }) {
      let confirmCmd = attrs.confirmCmd
      let chatList = attrs.chatList

      // 💡 批量文件审查模式分流
      if (Array.isArray(confirmCmd?.ext?.files) && confirmCmd.ext.files.length > 0) {
        return m(ChatBatchReview, { confirmCmd, chatList })
      }

      const isEditorConfirm = confirmCmd?.ext?.identifier === "app:editor"

      return m("", {
        oncreate(vnode) {
          if (chatData.chatListScrollAtBottom(chatList?.id)) {
            chatData.scrollChatListTobottom(chatList?.id)
          }
        },
        onupdate(vnode) {
          if (chatData.chatListScrollAtBottom(chatList?.id)) {
            const now = Date.now()
            if (now - lastAutoScrollTime > 500) {
              lastAutoScrollTime = now
              chatData.scrollChatListTobottom(chatList?.id)
            }
          }
        },
        style: {
          display: "flex",
          flexDirection: "column",
          borderRadius: `${getSize(1)}rem ${getSize(8)}rem ${getSize(8)}rem ${getSize(1)}rem`,
          margin: `${getSize(3)}rem`,
          padding: `${getSize(3)}rem`,
          boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem ${getColor("确认框背景") === "#ffffffee" ? "#ccc" : "#333"}`,
          background: getColor("确认框背景"),
          color: getColor("确认框文字"),
          //maxHeight: "40%",
          //maxWidth: "60rem",
          zIndex: "100",
          position: "relative",
          borderLeft: `${getSize(1)}rem solid ${getColor("确认框标题边框")}`
        }
      }, [
        m("span", {
          style: {
            fontWeight: "bold",
            marginBottom: `${getSize(3)}rem`,
            color: getColor("确认框标题"),
            overflowWrap: "break-word",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
            lineHeight: "1.5"
          }
        }, confirmCmd.title || "是否执行操作？"),
        m(Box, {
          style: {
            margin: `${getSize(3)}rem 0`,
            borderRadius: `${getSize(3)}rem`,
            background: getColor("确认框内容背景"),
            overflowWrap: "break-word",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
            display: "flex",
            flexDirection: "column"
          }
        }, [

          confirmCmd?.type === "tip"
            ? confirmCmd.content
            : null,
          confirmCmd?.type === "text"
            ? m(Box, {
              isBlock: true,
              style: {
                maxHeight: `${getSize(75)}rem`,
                overflowY: "auto",
                // 如果有说明，认为这是个带说明的命令，内容区域用等宽字体
                ...(confirmCmd.argsDesc ? {
                  fontFamily: "monospace",
                  background: getColor("确认框内容背景"),
                  padding: `${getSize(3)}rem`,
                  borderRadius: `${getSize(2)}rem`,
                  border: `${getSize(0.25)}rem solid ${getColor("确认框输入边框")}`
                } : {})
              }
            }, confirmCmd.content)
            : null,
          confirmCmd?.argsDesc ? m(Box, {
            class: "article",
            isBlock: true,
            style: {
              marginTop: `${getSize(3)}rem`,
              padding: `${getSize(3)}rem`,
              background: getColor("确认框内容背景"),
              borderRadius: `${getSize(2)}rem`,
              border: `${getSize(0.25)}rem solid ${getColor("确认框输入边框")}`,
              fontSize: `${getSize(2)}rem`,
              maxHeight: `${getSize(50)}rem`,
              overflowY: "auto"
            }
          }, [
            m.trust(format(confirmCmd.argsDesc, "markdown", {}))
          ]) : null,
          m("textarea", {
            placeholder: "输入备注（可选，例如拒绝原因）...",
            value: localComment,
            oninput: (e) => localComment = e.target.value,
            style: {
              width: "100%",
              padding: `${getSize(1)}rem`,
              margin: `${getSize(3)}rem ${getSize(1)}rem ${getSize(1)}rem`,
              background: getColor("确认框输入背景"),
              border: `${getSize(0.25)}rem solid ${getColor("确认框输入边框")}`,
              borderRadius: `${getSize(2)}rem`,
              color: getColor("确认框输入文字"),
              outline: "none",
              minHeight: `${getSize(15)}rem`,
              resize: "vertical",
              width: "auto"
            }
          })
        ]),
        m("", {
          style: {
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: `${getSize(1)}rem`
          }
        }, [
          isEditorConfirm ? m(Box, {
            style: {
              marginRight: "auto",
              background: getColor("main").back,
              color: getColor("main").front
            },
            isBtn: true,
            async onclick() {
              if (settingData?.fnCall) {
                const appType = confirmCmd.ext?.identifier?.split(":")[1] || "editor"
                await settingData.fnCall("appLaunch", [appType, {
                  data: confirmCmd.ext
                }])
              }
            }
          }, "打开编辑器") : null,
          m(Box, {
            style: {
              marginRight: "0",
              background: getColor("确认框按钮执行背景"),
              color: getColor("确认框按钮执行文字")
            },
            isBtn: true,
            async onclick() {
              await comData.data.edit((data) => {
                const list = data.chatLists?.find(l => l.id === chatList.id)
                if (list?.confirmCmds) {
                  let _confirmCmd = list.confirmCmds.find(c => c.id === confirmCmd.id)
                  if (_confirmCmd) {
                    _confirmCmd.comment = localComment
                    _confirmCmd.confirm = "yes"
                  }
                }
              })
            }
          }, "执行"),
          m(Box, {
            style: {
              marginRight: "0",
              background: getColor("确认框按钮拒绝背景"),
              color: getColor("确认框按钮拒绝文字")
            },
            isBtn: true,
            async onclick() {
              await comData.data.edit((data) => {
                const list = data.chatLists?.find(l => l.id === chatList.id)
                if (list?.confirmCmds) {
                  let _confirmCmd = list.confirmCmds.find(c => c.id === confirmCmd.id)
                  if (_confirmCmd) {
                    _confirmCmd.comment = localComment
                    _confirmCmd.confirm = "no"
                  }
                }
              })
            }
          }, "拒绝")
        ])

      ])
    }
  }
}