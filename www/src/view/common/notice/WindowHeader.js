import Box from "../box.js"
import getColor from "../getColor.js"
import getAppIconUrl from "../getAppIconUrl.js"
import materialize from "./materialize.js"
import PinBtn from "./PinBtn.js"
import WebWindowBtn from "./WebWindowBtn.js"
import HeaderButtons from "./HeaderButtons.js"
import ConfirmBtn from "./ConfirmBtn.js"
import MinimizeBtn from "./MinimizeBtn.js"
import MaximizeBtn from "./MaximizeBtn.js"
import CloseBtn from "./CloseBtn.js"

// ---------------- 可复用窗口头部：标题栏 + 菜单栏（正常窗口与悬浮球迷你控制窗共用） ----------------
// 只负责「画」，不负责「算」；所有动作由外部注入，不依赖某个渲染上下文
export default function () {
  // 标题栏 / 悬浮球胶囊拖拽（两种模式互斥，共用一份状态不会冲突）
  let isMoving = false
  let moveStartX, moveStartY, moveStartWinX, moveStartWinY
  let lastTitleTap = null

  const handleTitleDown = (e, win, attrs, isHostWindow) => {
    if (e.target.closest(".win-btn") || e.target.closest(".tab-item")) return

    const now = Date.now()
    if (lastTitleTap) {
      const elapsed = now - lastTitleTap.time
      const dist = Math.hypot(e.clientX - lastTitleTap.x, e.clientY - lastTitleTap.y)
      if (elapsed < 300 && dist < 15) {
        lastTitleTap = null
        e.preventDefault()
        if (attrs.onMaximize) attrs.onMaximize(e)
        return
      }
    }
    lastTitleTap = { time: now, x: e.clientX, y: e.clientY }

    if (isHostWindow || attrs.disableTitleDrag) return

    e.preventDefault()
    if (attrs.onActivate) attrs.onActivate()

    const target = e.currentTarget
    const winDom = e.target.closest(".window-box")
    const titleDom = target.getBoundingClientRect()

    target.setPointerCapture(e.pointerId)
    if (!win.isMaximized) materialize(winDom, win)

    isMoving = true
    moveStartX = e.clientX
    moveStartY = e.clientY
    moveStartWinX = win.x
    moveStartWinY = win.y

    // Win 模型：最大化窗口单击不还原，拖动超过阈值才还原成原尺寸并按抓取比例跟随光标
    // maximized：本次拖动的待还原标记（还原后置 false）；ratio/top：指针在标题栏内的相对位置
    const maxState = {
      maximized: win.isMaximized,
      ratio: (e.clientX - titleDom.left) / titleDom.width,
      top: e.clientY - titleDom.top
    }

    const onMove = (ev) => {
      if (!isMoving) return
      const dx = ev.clientX - moveStartX
      const dy = ev.clientY - moveStartY

      if (Math.abs(dx) >= 4 || Math.abs(dy) >= 4) {
        lastTitleTap = null
      }

      if (maxState.maximized) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
        lastTitleTap = null
        const { ratio, top } = maxState
        maxState.maximized = false
        win.isMaximized = false
        win.x = Math.round(ev.clientX - win.width * ratio)
        win.y = Math.round(ev.clientY - top)
        moveStartX = ev.clientX
        moveStartY = ev.clientY
        moveStartWinX = win.x
        moveStartWinY = win.y
        if (attrs.onWindowUpdate) attrs.onWindowUpdate(win)
        m.redraw()
        return
      }

      let newX = moveStartWinX + dx
      let newY = moveStartWinY + dy

      const screenW = window.innerWidth
      const screenH = window.innerHeight
      const winW = win.width || 200
      const winH = win.height || 150

      const minVisibleW = 100
      const minVisibleH = 30

      if (newX < minVisibleW - winW) {
        newX = minVisibleW - winW
      } else if (newX > screenW - minVisibleW) {
        newX = screenW - minVisibleW
      }

      if (newY < 0) {
        newY = 0
      } else if (newY > screenH - minVisibleH) {
        newY = screenH - minVisibleH
      }

      win.x = newX
      win.y = newY
      m.redraw()
    }

    const onUp = (ev) => {
      isMoving = false
      target.releasePointerCapture(ev.pointerId)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      if (Date.now() - (lastTitleTap?.time || 0) > 300) {
        lastTitleTap = null
      }
      if (attrs.onWindowUpdate) attrs.onWindowUpdate(win)
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  return {
    view({ attrs }) {
      const win = attrs.windowData
      const realTabs = attrs.tabs || []
      const activeTab = attrs.activeTab || realTabs.find(t => t.sign === win.activeSign) || realTabs[0]
      if (!activeTab) return null

      const isHostWindow = win.isMain || m.route.param("winId") === win.id
      const hideBtn = activeTab.hideBtn || 0
      const isMini = attrs.isMini !== undefined ? attrs.isMini : !!activeTab.isMini
      const isActiveWindow = attrs.isActiveWindow
      const isWide = isHostWindow ? window.innerWidth >= 700 : (win.width === 0 || win.width >= 700)

      return m("", {
        style: {
          touchAction: "none",
          background: getColor('main').back,
          borderRadius: win.isMaximized ? "0" : "3rem",
          opacity: isActiveWindow === false ? 0.6 : 1,
          transition: "opacity 0.3s",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          userSelect: "none",
          padding: isMini ? "0.2rem 0.5rem" : "0.4rem 1rem",
          minHeight: isMini ? "1.7rem" : "3.3rem",
          "-webkit-app-region": isActiveWindow ? (isHostWindow ? "drag" : "no-drag") : "none",
          position: "relative",
          zIndex: 5
        },
        onpointerdown: (e) => handleTitleDown(e, win, attrs, isHostWindow)
      }, [
        // macOS 原生红绿灯专属毛玻璃避让底座（左侧正圆严格契合容器，右侧圆角隐入 mask 逸散区实现纯平直阴影散开）
        (!attrs.hideTrafficLight && isHostWindow && /macintosh|mac os x/i.test(navigator.userAgent)) ? m("", {
          style: {
            position: "absolute",
            left: "0",
            top: "0",
            height: isMini ? "2.1rem" : "4.1rem",
            width: isMini ? "88px" : "108px",
            background: "linear-gradient(to right, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.2) 50%, rgba(0, 0, 0, 0) 100%)",
            borderRadius: win.isMaximized ? "0" : "3rem",
            backdropFilter: "blur(12px)",
            "-webkit-backdrop-filter": "blur(12px)",
            maskImage: "linear-gradient(to right, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 95%)",
            "-webkit-mask-image": "linear-gradient(to right, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 95%)",
            pointerEvents: "none",
            zIndex: 1
          }
        }) : null,

        // 第一行：标题 + Pin + (宽屏时 titleBar) + 右侧按钮组（右侧按钮绝对靠右）
        m("", {
          style: {
            display: "flex",
            alignItems: "center",
            width: "100%",
            height: "100%",
            gap: isMini ? "0.2rem" : "0.25rem",
            position: "relative",
            zIndex: 2
          }
        }, [
          // 红绿灯透明占位（在 flex 布局中让出左上角底座宽度，使标题自然避让）
          (!attrs.hideTrafficLight && isHostWindow && /macintosh|mac os x/i.test(navigator.userAgent)) ? m("", {
            style: {
              width: isMini ? "66px" : "74px",
              flexShrink: 0,
              pointerEvents: "none"
            }
          }) : null,

          // 标题
          m(Box, {
            style: {
              background: "transparent",
              fontWeight: "bold",
              color: getColor('gray_6').front,
              margin: "0",
              borderRadius: "0",
              userSelect: "none",
              maxWidth: "50%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "unset",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              minWidth: isMini ? "2rem" : "4rem",
              fontSize: isMini ? "1.1rem" : undefined,
              cursor: "default",
              "-webkit-app-region": isActiveWindow ? (isHostWindow ? "drag" : "no-drag") : "none"
            }
          }, [
            (activeTab.icon || activeTab.appType) ? m("img", {
              src: getAppIconUrl(activeTab.appType, activeTab.icon),
              onerror: (e) => { e.target.src = "/statics/navbar/program.svg" },
              style: {
                width: isMini ? "1.1rem" : "1.6rem",
                height: isMini ? "1.1rem" : "1.6rem",
                borderRadius: "22%",
                flexShrink: 0,
                objectFit: "cover",
                marginRight: isMini ? "0.3rem" : "0.5rem",
                verticalAlign: "middle",
                pointerEvents: "none"
              }
            }) : null,
            activeTab.tip || "提示"
          ]),

          m(PinBtn, { win, isMini, onPin: attrs.onPin }),
          m(WebWindowBtn, { win, activeTab, isMini, onWebWindowOpen: attrs.onWebWindowOpen }),

          // 宽屏时：标题栏内的菜单栏占位
          m("", {
            style: {
              flex: 1,
              display: "flex",
              alignItems: "center",
              minWidth: 0,
              height: "100%"
            }
          }, [
            (activeTab.titleBar && !isMini && isWide) ? m(activeTab.titleBar) : null
          ]),

          m(HeaderButtons, { activeTab, isMini }),
          m(ConfirmBtn, { activeTab, isMini, hideBtn, onConfirm: attrs.onConfirm }),
          m(MinimizeBtn, { activeTab, isMini, onMinimize: attrs.onMinimize }),
          m(MaximizeBtn, { activeTab, isMini, onMaximize: attrs.onMaximize }),
          m(CloseBtn, { activeTab, isMini, hideBtn, onClose: attrs.onCancel })
        ]),

        // 第二行（在标题栏胶囊内部）：窄窗时用有颜色的独立圆角胶囊容器包裹菜单栏
        (activeTab.titleBar && (isMini || !isWide)) ? m(Box, {
          isBlock: true,
          style: {
            display: "block",
            margin: "0.5rem",
            borderRadius: "3rem",
            boxSizing: "border-box",
            background: "rgba(0,0,0,0.1)",
          }
        }, [
          m(activeTab.titleBar)
        ]) : null
      ])
    }
  }
}
