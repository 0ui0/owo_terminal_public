import m from "mithril"
import FileMenu from "./FileMenu.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"
import MessageInbox from "./MessageInbox.js"
import getColor from "./getColor.js"

export default () => {
  return {
    view: () => {
      return m("div", {
        style: {
          width: "100%",
          height: "2.5rem",
          maxHeight: "2.5rem",
          display: "flex",
          alignItems: "center",
          paddingLeft: "6px",
          paddingRight: "6px",
          fontSize: "12px",
          fontWeight: "500",
          color: getColor('gray_6').front,
          userSelect: "none"
        }
      }, [
        m("div", {
          style: {
            display: "inline-flex",
            alignItems: "center",
            transform: "scale(0.85)",
            transformOrigin: "left center"
          }
        }, m(FileMenu)),
        m("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" } }, [
          // Message Inbox
          m("div", {
            style: {
              display: "inline-flex",
              alignItems: "center",
              transform: "scale(0.9)",
              transformOrigin: "center center"
            }
          }, m(MessageInbox)),

          commonData.currentProject ? m("div", {
            style: {
              display: "flex", alignItems: "center", gap: "6px",
              background: "rgba(0,0,0,0.1)", padding: "1px 6px", borderRadius: "4px",
              fontSize: "11px", color: "#ddd"
            }
          }, [
            m("div", { style: { width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50", boxShadow: "0 0 5px #4caf50" } }),
            m("span", typeof commonData.currentProject === 'string' ? commonData.currentProject.split(/[/\\]/).pop() : "")
          ]) : null
        ])
      ])
    }
  }
}
