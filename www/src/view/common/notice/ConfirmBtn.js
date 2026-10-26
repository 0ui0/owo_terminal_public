import Box from "../box.js"
import getColor from "../getColor.js"

// 4. 确认按钮
// Confirm Check
export default function () {
  return {
    view({ attrs }) {
      const { activeTab, isMini, hideBtn, onConfirm } = attrs
      if (hideBtn !== 0 && hideBtn !== 3) return null
      return m(Box, {
        class: "win-btn",
        isBtn: true,
        style: {
          background: getColor('pink_1').back,
          color: getColor('pink_1').front,
          border: `0.1rem solid ${getColor('gray_1').back}`,
          borderRadius: activeTab.confirmWords ? "3rem" : "50%",
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          padding: activeTab.confirmWords ? (isMini ? "0 0.4rem" : "0 0.8rem") : "0",
          minWidth: isMini ? "1.4rem" : "2.5rem",
          width: activeTab.confirmWords ? "auto" : (isMini ? "1.4rem" : "2.5rem"),
          height: isMini ? "1.4rem" : "2.5rem",
          fontSize: isMini ? "0.9rem" : "1.2rem",
          whiteSpace: "nowrap",
          flexShrink: 0,
          "-webkit-app-region": "no-drag"
        },
        ext: {
          onpointerdown: (e) => e.stopPropagation(),
          onclick: onConfirm
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
          activeTab.confirmWords
            ? activeTab.confirmWords
            : m.trust((typeof iconPark !== 'undefined' ? iconPark : window.iconPark)?.getIcon("Check", {
                fill: getColor('pink_1').front,
                size: isMini ? "8px" : "12px"
              }))
        ])
      ])
    }
  }
}
