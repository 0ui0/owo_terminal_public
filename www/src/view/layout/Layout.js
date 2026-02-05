import Css from "../css/Css.js"
import Notice from "../common/notice.js"
import Nav from "../common/nav.js"
import TitleBar from "../common/TitleBar.js"

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
        m(TitleBar),

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