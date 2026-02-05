import Box from "../common/box.js"
import comData from "../../comData/comData.js"
export default () => {
  return {
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
          boxShadow: "0.1rem 0.1rem 1rem #333",
          background: "#2b292aee",
          color: "#eeeeee55",
          maxHeight: "40%",
          maxWidth: "60rem",
          zIndex: "100",
          position: "relative",
          borderLeft: "0.4rem solid #97598f"
        }
      }, [
        m("span", {
          style: {
            fontWeight: "bold",
            marginBottom: "1rem"
          }
        }, confirmCmd.title || "是否执行操作？"),
        m(Box, {
          style: {
            margin: "1rem 0",
            borderRadius: "1rem",
            background: "#47464f66",
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
              style: {
                maxHeight: "30rem",
                overflowY: "auto",
              }
            }, confirmCmd.content)
            : null,
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
              background: "#97598f",
              color: "#463838"
            },
            isBtn: true,
            async onclick() {
              await comData.data.edit((data) => {
                const list = data.chatLists?.find(l => l.id === chatList.id)
                if (list?.confirmCmds) {
                  let _confirmCmd = list.confirmCmds.find(c => c.id === confirmCmd.id)
                  if (_confirmCmd) _confirmCmd.confirm = "yes"
                }
              })
            }
          }, "执行"),
          m(Box, {
            style: {
              marginRight: "0"
            },
            isBtn: true,
            async onclick() {
              await comData.data.edit((data) => {
                const list = data.chatLists?.find(l => l.id === chatList.id)
                if (list?.confirmCmds) {
                  let _confirmCmd = list.confirmCmds.find(c => c.id === confirmCmd.id)
                  if (_confirmCmd) _confirmCmd.confirm = "no"
                }
              })
            }
          }, "拒绝")
        ])

      ])
    }
  }
}