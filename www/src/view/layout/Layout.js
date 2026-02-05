import Css from "../css/Css.js"
import Notice from "../common/notice.js"
import Nav from "../common/nav.js"
import FileMenu from "../common/FileMenu.js"
import commonData from "../common/commonData.js"
import { trs } from "../common/i18n.js"

export default () => {
  return {
    view({ attrs, children }) {
      return m("", {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#393432", // Match Notice body background
          color: "#eee",
        }
      }, [
        m(Css),
        // Custom Title Bar
        m("div", {
          style: {
            height: "38px",
            background: "#755d5c",
            display: "flex",
            alignItems: "center",
            paddingLeft: /Electron/.test(navigator.userAgent) ? "80px" : "10px", // Space for macOS traffic lights
            paddingRight: "10px",
            fontSize: "14px",
            fontWeight: "bold",
            color: "#333",
            "-webkit-app-region": "drag",
            borderBottom: "1px solid rgba(0,0,0,0.1)",
            flexShrink: 0,
            userSelect: "none"
          }
        }, [
          m("span", trs("聊天界面/标题/宅喵终端")),
          m(FileMenu),
          m("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" } }, [
            commonData.currentProject ? m("div", {
              style: {
                display: "flex", alignItems: "center", gap: "6px",
                background: "rgba(0,0,0,0.1)", padding: "2px 8px", borderRadius: "4px",
                fontSize: "12px", color: "#ddd"
              }
            }, [
              m("div", { style: { width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50", boxShadow: "0 0 5px #4caf50" } }),
              m("span", commonData.currentProject.split(/[/\\]/).pop())
            ]) : null
          ])
        ]),

        // Content Area
        m("div", {
          style: {
            flex: 1,
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            overflow: "hidden"
          }
        }, children),

        m(Nav),
        m(Notice)
      ])
    }
  }
}