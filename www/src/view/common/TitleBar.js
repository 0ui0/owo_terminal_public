import m from "/@npm/mithril.js"
import FileMenu from "./FileMenu.js"
import ViewMenu from "./ViewMenu.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"
import MessageInbox from "./MessageInbox.js"
import getColor from "./getColor.js"
import getSize from "./getSize.js"
import Tag from "./tag.js"

export default () => {
  return {
    view: () => {
      return m("div", {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          fontSize: `${getSize(3)}rem`,
          fontWeight: "500",
          color: getColor('gray_6').front,
          userSelect: "none"
        }
      }, [
        // 单层容器：四边等距 k1，所有元素间距统一由 gap 提供
        m("div", {
          style: {
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: `${getSize(1)}rem`,
            margin: `${getSize(1)}rem`
          }
        }, [
          m(FileMenu),
          m(ViewMenu),
          m("div", {
            style: {
              marginLeft: "auto",
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
              margin: 0
            }
          }, [
            m("", {
              style: {
                display: "inline-block",
                width: `${getSize(2)}rem`,
                height: `${getSize(2)}rem`,
                borderRadius: "50%",
                background: getColor("green_1").back,
                marginRight: `${getSize(1)}rem`
              }
            }),
            typeof commonData.currentProject === "string" ? commonData.currentProject.split(/[/\\]/).pop() : ""
          ]) : null
        ])
      ])
    }
  }
}
