import m from "/@npm/mithril.js"
import Box from "./box.js"
import Notice from "./notice.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"
import Tip from "./tip.js"
import sysMenu from "./sysMenu.js"

export default () => {
  const isMac = /macintosh|mac os x/i.test(navigator.userAgent)
  const ctrlKey = isMac ? "Cmd" : "Ctrl"

  const zoomBy = (delta) => {
    const next = Math.round(((commonData.zoomFactor || 1) + delta) * 10) / 10
    commonData.zoomFactor = Math.min(2.0, Math.max(0.5, next))
    commonData.updateFontSize()
    Tip.launch(`缩放: ${Math.round(commonData.zoomFactor * 100)}%`, 1200)
    m.redraw()
  }

  const setZoom = (factor) => {
    commonData.zoomFactor = factor
    commonData.updateFontSize()
    Tip.launch(`缩放: ${Math.round(commonData.zoomFactor * 100)}%`, 1200)
    m.redraw()
  }

  const showViewMenu = (e) => {
    e.preventDefault()
    const rect = e.target.getBoundingClientRect()
    const x = rect.left
    const y = rect.bottom + 5

    const currentPercent = Math.round((commonData.zoomFactor || 1) * 100)

    Notice.launch({
      group: "viewMenu",
      win: { x, y },
      tip: trs("菜单栏/分类/视图", { cn: "视图", en: "View" }),
      content: {
        view: (v) => m(sysMenu, {
          menuItems: [
            {
              name: trs("菜单栏/视图/放大", { cn: "放大界面", en: "Zoom In" }),
              shortcut: `${ctrlKey} + =`,
              onclick: () => { v.attrs.delete(); zoomBy(0.1) }
            },
            {
              name: trs("菜单栏/视图/缩小", { cn: "缩小界面", en: "Zoom Out" }),
              shortcut: `${ctrlKey} + -`,
              onclick: () => { v.attrs.delete(); zoomBy(-0.1) }
            },
            {
              name: trs("菜单栏/视图/重置", { cn: "重置缩放 (100%)", en: "Reset Zoom" }),
              shortcut: `${ctrlKey} + 0`,
              onclick: () => { v.attrs.delete(); setZoom(1.0) }
            },
            "sep",
            ...[50, 75, 100, 125, 150, 200].map(pct => ({
              name: `${pct}%${currentPercent === pct ? " ✓" : ""}`,
              onclick: () => { v.attrs.delete(); setZoom(pct / 100) }
            }))
          ]
        })
      }
    })
  }

  return {
    view() {
      return m(Box, {
        tagName: "div",
        isBtn: true,
        color: "main",
        noValue: true,
        style: {
          padding: "0.4rem 1rem",
          borderRadius: "3rem",
          fontSize: "1.2rem",
          display: "inline-flex",
          alignItems: "center",
          cursor: "pointer",
          margin: "0 0.3rem",
          boxShadow: "0 0.2rem 0.6rem rgba(0, 0, 0, 0.15)",
          "-webkit-app-region": "no-drag",
          transition: "opacity 0.2s ease, box-shadow 0.2s ease"
        },
        ext: {
          onpointerenter: function () {
            this.style.opacity = "0.5"
          },
          onpointerleave: function () {
            this.style.opacity = "1"
          }
        },
        onclick: (_, e) => showViewMenu(e)
      }, trs("菜单栏/分类/视图", { cn: "视图", en: "View" }))
    }
  }
}
