import Box from "../box.js"
import getColor from "../getColor.js"

// ---------------- 标题栏原子按钮组件 ----------------

// 1. 置顶按钮
// Pin / 置顶按钮 (跟随在 Tip 标题右侧)
export default function () {
  return {
    view({ attrs }) {
      const { win, isMini, onPin } = attrs
      return m(Box, {
        class: "win-btn",
        isBtn: true,
        title: win.isPinned ? "取消置顶" : "窗口置顶",
        style: {
          background: win.isPinned ? getColor('yellow_1').back : getColor('gray_2').back,
          color: win.isPinned ? getColor('yellow_1').front : getColor('gray_2').front,
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
          onclick: onPin
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
          m.trust((typeof iconPark !== 'undefined' ? iconPark : window.iconPark)?.getIcon("Pin", {
            fill: win.isPinned ? getColor('yellow_1').front : getColor('gray_6').front,
            size: isMini ? "8px" : "12px"
          }))
        ])
      ])
    }
  }
}
