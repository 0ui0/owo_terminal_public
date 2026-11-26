import Box from "../box.js"
import getColor from "../getColor.js"
import getSize from "../getSize.js"

// 7. 关闭/取消按钮
// Close / Cancel
export default function () {
  return {
    view({ attrs }) {
      const { activeTab, isMini, hideBtn, onClose } = attrs
      if (hideBtn !== 0 && hideBtn !== 2) return null
      return m(Box, {
        class: "win-btn",
        isBtn: true,
        style: {
          background: getColor('gray_2').back,
          color: getColor('gray_6').front,
          border: `${getSize(0.25)}rem solid ${getColor('gray_1').back}`,
          borderRadius: activeTab.cancelWords ? `${getSize(8)}rem` : "50%",
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          padding: activeTab.cancelWords ? (isMini ? `0 ${getSize(1)}rem` : `0 ${getSize(2)}rem`) : "0",
          minWidth: isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`,
          width: activeTab.cancelWords ? "auto" : (isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`),
          height: isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`,
          fontSize: isMini ? `${getSize(2)}rem` : `${getSize(3)}rem`,
          whiteSpace: "nowrap",
          flexShrink: 0,
          "-webkit-app-region": "no-drag"
        },
        ext: {
          onpointerdown: (e) => e.stopPropagation(),
          onclick: onClose
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
          activeTab.cancelWords
            ? activeTab.cancelWords
            : m.trust((typeof iconPark !== 'undefined' ? iconPark : window.iconPark)?.getIcon("Close", {
                fill: getColor('gray_6').front,
                size: isMini ? `${getSize(2)}rem` : `${getSize(3)}rem`
              }))
        ])
      ])
    }
  }
}
