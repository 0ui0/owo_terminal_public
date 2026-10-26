import Box from "../box.js"
import getColor from "../getColor.js"

// 3. 自定义按钮组
// 第三方自定义按钮
export default function () {
  return {
    view({ attrs }) {
      const { activeTab, isMini } = attrs
      const list = activeTab.headerButtons || []
      return list.map(btn => m(Box, {
        class: "win-btn",
        isBtn: true,
        title: btn.title || "",
        style: {
          background: btn.color || getColor('blue_1').back,
          color: getColor('gray_8').front,
          border: `0.1rem solid ${getColor('gray_1').back}`,
          borderRadius: "50%",
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0",
          width: isMini ? "1.4rem" : "2.5rem",
          height: isMini ? "1.4rem" : "2.5rem",
          flexShrink: 0,
          "-webkit-app-region": "no-drag"
        },
        ext: {
          onpointerdown: (e) => e.stopPropagation(),
          onclick: btn.onclick
        }
      }, [
        m("", {
          style: {
            pointerEvents: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center"
          }
        }, [
          typeof btn.icon === 'string' && btn.icon.startsWith("<")
            ? m.trust(btn.icon)
            : (typeof btn.icon === 'function' ? m.trust(btn.icon()) : (btn.icon || "⚓"))
        ])
      ]))
    }
  }
}
