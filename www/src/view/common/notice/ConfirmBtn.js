import Box from "../box.js"
import getColor from "../getColor.js"
import getSize from "../getSize.js"

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
          border: `${getSize(0.25)}rem solid ${getColor('gray_1').back}`,
          borderRadius: activeTab.confirmWords ? `${getSize(8)}rem` : "50%",
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          padding: activeTab.confirmWords ? (isMini ? `0 ${getSize(1)}rem` : `0 ${getSize(2)}rem`) : "0",
          minWidth: isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`,
          width: activeTab.confirmWords ? "auto" : (isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`),
          height: isMini ? `${getSize(3)}rem` : `${getSize(6)}rem`,
          fontSize: isMini ? `${getSize(2)}rem` : `${getSize(3)}rem`,
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
                size: isMini ? `${getSize(2)}rem` : `${getSize(3)}rem`
              }))
        ])
      ])
    }
  }
}
