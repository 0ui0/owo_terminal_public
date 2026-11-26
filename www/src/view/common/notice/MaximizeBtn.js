import Box from "../box.js"
import getColor from "../getColor.js"
import getSize from "../getSize.js"

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
          border: `${getSize(0.25)}rem solid ${getColor('gray_1').back}`,
          borderRadius: "50%",
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0",
          width: isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`,
          height: isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`,
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
            size: isMini ? `${getSize(2)}rem` : `${getSize(3)}rem`
          }))
        ])
      ])
    }
  }
}
