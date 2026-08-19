import m from "mithril"
import commonData from "./commonData.js"
import Notice from "./notice.js"
import { trs } from "./i18n.js"
import getColor from "./getColor.js"
import ioSocket from "../../comData/ioSocket.js"

export default () => {
  return {
    view: () => {
      const now = Date.now()
      const flashMsg = commonData.messages.find(msg => now - msg.timestamp < 5000)
      const unreadMsgs = commonData.messages.filter(msg => !msg.isRead)
      const unreadCount = unreadMsgs.length

      const getBadgeColor = (type) => {
        switch(type) {
          case "error": return "#ff5252"
          case "success": return "#4caf50"
          case "warning": return "#ff9800"
          case "downloading": return "#2196f3"
          case "info": return "#2196f3"
          default: return "#ff5252"
        }
      }
      const badgeColor = unreadCount > 0 ? getBadgeColor(unreadMsgs[unreadMsgs.length - 1].type) : "#ff5252"

      const openInbox = () => {
        Notice.launch({
          sign: "message-inbox-panel",
          tip: trs("系统/消息/收纳盒", { cn: "消息中心", en: "Message Center" }),
          content: {
            view: () => {
              if (commonData.messages.length === 0) {
                return m("", {
                  style: {
                    textAlign: "center",
                    padding: "2rem",
                    color: getColor("gray_4").front
                  }
                }, trs("系统/消息/暂无", { cn: "暂无消息", en: "No messages" }))
              }

              return m("", {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  padding: "1rem"
                }
              }, commonData.messages.map((msg, index) => {
                const getIconName = () => {
                  switch(msg.type) {
                    case "error": return "Attention"
                    case "success": return "Success"
                    case "warning": return "Caution"
                    case "downloading": return "Loading"
                    default: return "Info"
                  }
                }
                const getIconColor = () => {
                  switch(msg.type) {
                    case "error": return "#ff5252"
                    case "success": return "#4caf50"
                    case "warning": return "#ff9800"
                    case "downloading": return "#2196f3"
                    default: return getColor("main").back
                  }
                }

                const formatTime = (ts) => {
                  if (!ts) return "刚刚"
                  const diff = Date.now() - ts;
                  if (diff < 60000) return "刚刚"
                  if (diff < 3600000) return Math.floor(diff/60000) + "分钟前"
                  if (diff < 86400000) return Math.floor(diff/3600000) + "小时前"
                  return new Date(ts).toLocaleDateString()
                }

                const getTypeName = () => {
                  switch(msg.type) {
                    case "error": return "错误提醒"
                    case "success": return "成功提示"
                    case "warning": return "系统警告"
                    case "downloading": return "系统更新"
                    default: return "系统通知"
                  }
                }

                return m("", {
                  key: msg.id,
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.8rem",
                    padding: "1.2rem 2rem",
                    background: "rgba(0,0,0,0.05)",
                    borderRadius: "3rem",
                    cursor: "pointer",
                    position: "relative"
                  },
                  onpointerup: (e) => {
                    e.stopPropagation()
                    msg.isRead = true
                    if (msg.action && msg.action.type === "emit") {
                       ioSocket.socket.emit(msg.action.event, msg.action.args)
                    } else if (msg.action && msg.action.type === "notice") {
                       Notice.launch(msg.action.args)
                    }
                  }
                }, [
                  // Header Row
                  m("", {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }
                  }, [
                    m("", { style: { display: "flex", alignItems: "center", gap: "0.5rem" } }, [
                      m.trust(window.iconPark.getIcon(getIconName(), { fill: getIconColor(), size: "1.2rem" })),
                      m("span", { style: { fontSize: "1.1rem", color: getColor("gray_1").front, opacity: 0.6 } }, getTypeName()),
                      !msg.isRead ? m("", {
                        style: {
                          width: "0.6rem",
                          height: "0.6rem",
                          borderRadius: "50%",
                          background: getIconColor()
                        }
                      }) : null
                    ]),
                    m("", { style: { display: "flex", alignItems: "center", gap: "0.8rem" } }, [
                      m("span", { style: { fontSize: "1.1rem", color: getColor("gray_1").front, opacity: 0.4 } }, formatTime(msg.timestamp)),
                      m("", {
                        style: { cursor: "pointer", display: "flex", alignItems: "center" },
                        onpointerup: (e) => {
                          e.stopPropagation()
                          commonData.messages.splice(index, 1)
                        }
                      }, m.trust(window.iconPark.getIcon("Close", { fill: getColor("gray_1").front, size: "1.1rem", opacity: 0.5 })))
                    ])
                  ]),
                  // Body Row
                  m("", {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.3rem",
                      paddingLeft: "0.2rem"
                    }
                  }, [
                     m("", { style: { fontWeight: "bold", fontSize: "1.3rem", color: getColor("gray_1").front, lineHeight: "1.4" } }, msg.title),
                     msg.content ? m("", { style: { fontSize: "1.2rem", color: getColor("gray_1").front, opacity: 0.8, lineHeight: "1.4" } }, msg.content) : null,
                     msg.meta && msg.meta.progress !== undefined ? m("", {
                       style: {
                         width: "100%",
                         height: "0.4rem",
                         background: "rgba(0,0,0,0.1)",
                         borderRadius: "0.2rem",
                         marginTop: "0.5rem",
                         overflow: "hidden"
                       }
                     }, m("", {
                       style: {
                         width: `${msg.meta.progress}%`,
                         height: "100%",
                         background: getColor("main").back,
                         transition: "width 0.3s ease"
                       }
                     })) : null
                  ])
                ])
              }))
            }
          }
        })
      }

      if (flashMsg) {
        const getIconName = () => {
          switch(flashMsg.type) {
            case "error": return "Attention"
            case "success": return "Success"
            case "warning": return "Caution"
            case "downloading": return "Loading"
            default: return "Info"
          }
        }
        const getIconColor = () => {
          switch(flashMsg.type) {
            case "error": return "#ff5252"
            case "success": return "#4caf50"
            case "warning": return "#ff9800"
            case "downloading": return "#2196f3"
            default: return getColor("main").back
          }
        }

        return m("", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.2rem 0.8rem",
            background: "rgba(0,0,0,0.1)",
            borderRadius: "1.2rem",
            cursor: "pointer",
            "-webkit-app-region": "no-drag"
          },
          onpointerup: openInbox
        }, [
           m.trust(window.iconPark.getIcon(getIconName(), { fill: getIconColor(), size: "1.2rem" })),
           m("span", { style: { fontSize: "1.2rem", color: getIconColor() } }, flashMsg.title)
        ])
      }

      return m("", {
        style: {
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.4rem",
          height: "2.4rem",
          borderRadius: "0.5rem",
          cursor: "pointer",
          "-webkit-app-region": "no-drag",
          background: "rgba(0,0,0,0.05)"
        },
        onpointerup: openInbox
      }, [
        m.trust(window.iconPark.getIcon("Mail", { fill: getColor("main").front, size: "1.4rem" })),
        unreadCount > 0 ? m("", {
          style: {
            position: "absolute",
            top: "-0.4rem",
            right: "-0.4rem",
            background: badgeColor,
            color: "#fff",
            fontSize: "1rem",
            padding: "0 0.4rem",
            borderRadius: "1rem",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "1.4rem"
          }
        }, unreadCount) : null
      ])
    }
  }
}
