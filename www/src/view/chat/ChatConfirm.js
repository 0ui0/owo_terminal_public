import Box from "../common/box.js"
import comData from "../../comData/comData.js"
import getColor from "../common/getColor.js"
import format from "../common/format.js"

export default () => {
  let localComment = ""

  return {
    oninit(vnode) {
      localComment = vnode.attrs.confirmCmd.comment || ""
    },
    view({ attrs, children }) {
      let confirmCmd = attrs.confirmCmd
      let chatList = attrs.chatList
      return m("", {
        style: {
          display: "flex",
          flexDirection: "column",
          borderRadius: "0.5rem 2rem 2rem 0.5rem",
          margin: "1rem",
          padding: "1rem",
          boxShadow: `0.1rem 0.1rem 1rem ${getColor("确认框背景") === "#ffffffee" ? "#ccc" : "#333"}`,
          background: getColor("确认框背景"),
          color: getColor("确认框文字"),
          //maxHeight: "40%",
          maxWidth: "60rem",
          zIndex: "100",
          position: "relative",
          borderLeft: `0.4rem solid ${getColor("确认框标题边框")}`
        }
      }, [
        m("span", {
          style: {
            fontWeight: "bold",
            marginBottom: "1rem",
            color: getColor("确认框标题")
          }
        }, confirmCmd.title || "是否执行操作？"),
        m(Box, {
          style: {
            margin: "1rem 0",
            borderRadius: "1rem",
            background: getColor("确认框内容背景"),
            overflowWrap: "break-word",
            wordBreak: "break-all",
            whiteSpace: "wrap",
          }
        }, [

          confirmCmd?.type === "tip"
            ? confirmCmd.content
            : null,
          confirmCmd?.type === "text"
            ? m(Box, {
              isBlock: true,
              style: {
                maxHeight: "30rem",
                overflowY: "auto",
                // 如果有说明，认为这是个带说明的命令，内容区域用等宽字体
                ...(confirmCmd.argsDesc ? {
                  fontFamily: "monospace",
                  background: getColor("确认框内容背景"),
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  border: `1px solid ${getColor("确认框输入边框")}`
                } : {})
              }
            }, confirmCmd.content)
            : null,
          confirmCmd?.argsDesc ? m(Box, {
            class: "article",
            isBlock: true,
            style: {
              marginTop: "1rem",
              padding: "1rem",
              background: getColor("确认框内容背景"),
              borderRadius: "0.5rem",
              border: `1px solid ${getColor("确认框输入边框")}`,
              fontSize: "0.9rem",
              maxHeight: "20rem",
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
              padding: "0.5rem",
              marginTop: "1rem",
              background: getColor("确认框输入背景"),
              border: `1px solid ${getColor("确认框输入边框")}`,
              borderRadius: "0.3rem",
              color: getColor("确认框输入文字"),
              outline: "none",
              minHeight: "4rem",
              resize: "vertical"
            }
          })
        ]),
        m("", {
          style: {
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center"
          }
        }, [
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