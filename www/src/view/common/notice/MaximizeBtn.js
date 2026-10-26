import Box from "../box.js"
import getColor from "../getColor.js"

// 6. 最大化按钮
// Maximize
export default function () {
  return {
    view({ attrs }) {
      const { activeTab, isMini, onMaximize } = attrs
      if (!activeTab.useMaximize) return null
      return m(Box, {
        class: "win-btn",
        isBtn: true,
        style: {
          background: getColor('green_1').back,
          color: getColor('gray_6').front,
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
          onclick: onMaximize
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
          m.trust((typeof iconPark !== 'undefined' ? iconPark : window.iconPark)?.getIcon("Square", {
            fill: getColor('gray_6').front,
            size: isMini ? "8px" : "12px"
          }))
        ])
      ])
    }
  }
}
