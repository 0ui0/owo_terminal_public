import m from "/@npm/mithril.js"
import FileMenu from "./FileMenu.js"
import ViewMenu from "./ViewMenu.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"
import MessageInbox from "./MessageInbox.js"
import getColor from "./getColor.js"
import Tag from "./tag.js"

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
            gap: "0.2rem"
          }
        }, [
          m(FileMenu),
          m(ViewMenu)
        ]),
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

          commonData.currentProject ? m(Tag, {
            isBtn: false,
            styleExt: {
              background: "rgba(0, 0, 0, 0.05)",
              color: getColor("main").front,
            }
          }, [
            m("", {
              style: {
                display: "inline-block",
                width: "0.6rem",
                height: "0.6rem",
                borderRadius: "50%",
                background: getColor("green_1").back,
                marginRight: "0.4rem"
              }
            }),
            typeof commonData.currentProject === "string" ? commonData.currentProject.split(/[/\\]/).pop() : ""
          ]) : null
        ])
      ])
    }
  }
}
