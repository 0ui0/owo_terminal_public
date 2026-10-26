import Box from "../box.js"
import getColor from "../getColor.js"
import materialize from "./materialize.js"

// 2. 独立窗口脱壳按钮
// 独立窗口打开按钮 (在非主底座时始终显示，用于状态切换)
export default function () {
  return {
    view({ attrs }) {
      const { win, activeTab, isMini, onWebWindowOpen } = attrs
      if (win.isMain || typeof activeTab?.contentPath !== 'string') return null
      return m(Box, {
        class: "win-btn",
        isBtn: true,
        title: win.childWin && !win.childWin.closed ? "还原回虚拟窗口" : "独立窗口打开",
        style: {
          background: getColor('gray_2').back,
          color: getColor('gray_2').front,
          border: `0.1rem solid ${getColor('gray_1').back}`,
          borderRadius: "50%",
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0",
          width: isMini ? "1.3rem" : "2.2rem",
          height: isMini ? "1.3rem" : "2.2rem",
          flexShrink: 0,
          "-webkit-app-region": "no-drag"
        },
        ext: {
          onpointerdown: (e) => e.stopPropagation(),
          onclick: (e) => {
            const rootDom = e.target.closest(".window-box")
            materialize(rootDom, win)
            if (onWebWindowOpen) onWebWindowOpen(e)
          }
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
          m.trust((typeof iconPark !== 'undefined' ? iconPark : window.iconPark)?.getIcon("OffScreenOne", {
            fill: getColor('gray_6').front,
            size: isMini ? "8px" : "12px"
          }))
        ])
      ])
    }
  }
}
