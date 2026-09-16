import Css from "../css/Css.js"
import Notice from "../common/notice.js"
// Nav 已上移到 main.js 的 Run 视图：必须渲染在 .window-box（position:fixed 自成层叠上下文）之外
import TitleBar from "../common/TitleBar.js"
import getColor from "../common/getColor.js"
import Tip from "../common/tip.js"

export default () => {
  return {
    view({ attrs, children }) {
      return m("", {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: getColor('gray_1').back,
          color: getColor('gray_1').front,
        }
      }, [
        m(Css),
        // Custom Title Bar
        //m(TitleBar),

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

        // 导航栏已上移到 main.js 的 Run 视图（否则层叠上下文被困在 .window-box 内，永远压不过 Notice）
        //m(Notice),
        m(Tip)
      ])
    }
  }
}