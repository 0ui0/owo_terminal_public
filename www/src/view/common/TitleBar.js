import m from "mithril"
import FileMenu from "./FileMenu.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"
import UpdateIndicator from "./UpdateIndicator.js"

export default () => {
  return {
    view: () => {
      return m("div", {
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
          // Update status indicator
          m(UpdateIndicator),

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
      ])
    }
  }
}
