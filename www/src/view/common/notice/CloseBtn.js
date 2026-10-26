import Box from "../box.js"
import getColor from "../getColor.js"

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
          border: `0.1rem solid ${getColor('gray_1').back}`,
          borderRadius: activeTab.cancelWords ? "3rem" : "50%",
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          padding: activeTab.cancelWords ? (isMini ? "0 0.4rem" : "0 0.8rem") : "0",
          minWidth: isMini ? "1.4rem" : "2.5rem",
          width: activeTab.cancelWords ? "auto" : (isMini ? "1.4rem" : "2.5rem"),
          height: isMini ? "1.4rem" : "2.5rem",
          fontSize: isMini ? "0.9rem" : "1.2rem",
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
                size: isMini ? "8px" : "12px"
              }))
        ])
      ])
    }
  }
}
