import Box from "../box.js"
import getColor from "../getColor.js"
import getSize from "../getSize.js"
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
        title: (win.childWin && !win.childWin.closed) || m.route.param("winId") === win.id ? "还原回虚拟窗口" : "独立窗口打开",
        style: {
          background: getColor('gray_2').back,
          color: getColor('gray_2').front,
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
            size: isMini ? `${getSize(2)}rem` : `${getSize(3)}rem`
          }))
        ])
      ])
    }
  }
}
