import Box from "../box.js"
import getColor from "../getColor.js"
import getAppIconUrl from "../getAppIconUrl.js"
import Notice from "../notice.js"
import openControlPanel from "./openControlPanel.js"

export default function () {
  let isMoving = false
  let moveStartX, moveStartY, moveStartWinX, moveStartWinY
  let capsuleDom = null

  // 胶囊自身拖拽手势 (脱壳走 OS drag，虚拟浮窗走 Pointer 监听)
  const handleCapsuleDown = (e, win, attrs, isHostWindow) => {
    if (e.target.closest(".win-btn")) return
    if (isHostWindow) return

    e.preventDefault()
    if (attrs.onActivate) attrs.onActivate()

    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    isMoving = true
    moveStartX = e.clientX
    moveStartY = e.clientY
    moveStartWinX = win.x
    moveStartWinY = win.y

    const onMove = (ev) => {
      if (!isMoving) return
      win.x = moveStartWinX + (ev.clientX - moveStartX)
      win.y = moveStartWinY + (ev.clientY - moveStartY)
      m.redraw()
    }

    const onUp = (ev) => {
      isMoving = false
      target.releasePointerCapture(ev.pointerId)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      if (attrs.onWindowUpdate) attrs.onWindowUpdate(win)
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  // 悬浮球控制气泡时空模型：轻点（<4px）弹控制菜单，按住拖拽（>=4px）移动窗口（同时支持原生脱壳窗口与虚拟浮窗）
  const handleMenuBtnDown = (e, win, attrs) => {
    e.preventDefault()
    e.stopPropagation()
    if (attrs.onActivate) attrs.onActivate()

    let hasMoved = false
    const startX = e.clientX
    const startY = e.clientY
    const startWinX = win.x
    const startWinY = win.y
    let lastScreenX = e.screenX
    let lastScreenY = e.screenY

    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.hypot(dx, dy) >= 4) {
        hasMoved = true
      }
      if (hasMoved) {
        if (window.opener) {
          // 原生脱壳窗口：直接通过标准 W3C window.moveBy 物理移动窗口
          window.moveBy(ev.screenX - lastScreenX, ev.screenY - lastScreenY)
          lastScreenX = ev.screenX
          lastScreenY = ev.screenY
        } else {
          // 虚拟窗口：修改坐标响应式重绘
          win.x = startWinX + dx
          win.y = startWinY + dy
          m.redraw()
        }
      }
    }

    const onUp = (ev) => {
      target.releasePointerCapture(ev.pointerId)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)

      if (!hasMoved) {
        // 轻点（位移 < 4px）：触发菜单弹出（直接使用正统 capsuleDom 引用，零传统 DOM 查找）
        openFloatBallMenu(win)
      } else {
        // 拖拽移动：提交窗口位置更新
        if (attrs.onWindowUpdate) attrs.onWindowUpdate(win)
      }
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  // 悬浮球微型 Notice 菜单：统一转接通用多 Tab 遥控控制面板
  // 贯彻长官 chat_fxp917 指示：点击悬浮球，弹出的微型窗口直接显示该窗口的上半部分（WindowHeader + TabBar）
  const openFloatBallMenu = (hostWin) => {
    openControlPanel({
      anchorDom: capsuleDom,
      winId: hostWin.id
    })
  }

  return {
    view({ attrs }) {
      const win = attrs.windowData
      const realTabs = attrs.tabs || []
      const activeTab = realTabs.find(t => t.sign === win.activeSign) || realTabs[0]
      if (!activeTab) return null
      const isHostWindow = win.isMain || m.route.param("winId") === win.id

      return m(".float-ball-capsule", {
        oncreate({ dom }) {
          capsuleDom = dom
        },
        onupdate({ dom }) {
          capsuleDom = dom
        },
        style: {
          touchAction: "none",
          background: getColor('main').back,
          borderRadius: "20px",
          opacity: attrs.isActiveWindow === false ? 0.8 : 1,
          transition: "opacity 0.3s",
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          userSelect: "none",
          padding: "3px 6px 3px 4px",
          height: "26px",
          boxSizing: "border-box",
          position: "absolute",
          top: "0px",
          left: "0px",
          zIndex: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          "-webkit-app-region": isHostWindow ? "drag" : "no-drag"
        },
        onpointerdown: (e) => handleCapsuleDown(e, win, attrs, isHostWindow)
      }, [
        // 左侧：包裹 macOS 原生红绿灯（严格固定 px 物理尺寸）
        (isHostWindow && /macintosh|mac os x/i.test(navigator.userAgent)) ? m("", {
          style: {
            width: "70px",
            height: "20px",
            background: "#00000033",
            borderRadius: "20px",
            marginRight: "6px",
            flexShrink: 0,
            pointerEvents: "none"
          }
        }) : null,

        m(Box, {
          class: "win-btn",
          isBtn: true,
          title: "控制菜单",
          style: {
            background: "rgba(0,0,0,0.15)",
            color: getColor('gray_8').front,
            borderRadius: "14px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 6px",
            height: "20px",
            gap: "3px",
            cursor: "pointer",
            userSelect: "none",
            flexShrink: 0,
            "-webkit-app-region": "no-drag"
          },
          ext: {
            onpointerdown: (e) => handleMenuBtnDown(e, win, attrs)
          }
        }, [
          m("", {
            style: {
              pointerEvents: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              lineHeight: 1
            }
          }, [
            (activeTab.icon || activeTab.appType) ? m("img", {
              src: getAppIconUrl(activeTab.appType, activeTab.icon),
              onerror: (ev) => { ev.target.src = "/statics/navbar/program.svg" },
              style: {
                width: "12px",
                height: "12px",
                borderRadius: "22%",
                flexShrink: 0,
                objectFit: "contain",
                pointerEvents: "none"
              }
            }) : m.trust((typeof iconPark !== 'undefined' ? iconPark : window.iconPark)?.getIcon("More", { size: "12px", fill: getColor('gray_6').front }) || "⋯")
          ])
        ])
      ])
    }
  }
}
