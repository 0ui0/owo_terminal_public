import Box from "./box.js";
import getColor from "./getColor.js";
import commonData from "./commonData.js";
import settingData from "../setting/settingData.js";
import materialize from "./notice/materialize.js";
import WindowHeader from "./notice/WindowHeader.js";
import TabBar from "./notice/TabBar.js";
import FloatBall from "./notice/FloatBall.js";

export default function () {
  let isResizing = false
  let resizeDir = ""
  let startX, startY, startW, startH, startWinX, startWinY
  let domRect = null

  // ---------------- 事件处理 ----------------
  const handlePointerDown = (e, dir, win, onWindowUpdate) => {
    e.stopPropagation()
    e.preventDefault()

    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const rootDom = e.target.closest(".window-box")
    materialize(rootDom, win)

    isResizing = true
    resizeDir = dir
    startX = e.clientX
    startY = e.clientY
    startW = win.width
    startH = win.height
    startWinX = win.x
    startWinY = win.y

    const onMove = (ev) => {
      if (!isResizing) return
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const minW = 200
      const minH = 150

      if (resizeDir.includes("e")) win.width = Math.max(minW, startW + dx)
      if (resizeDir.includes("s")) win.height = Math.max(minH, startH + dy)
      if (resizeDir.includes("w")) {
        const newW = Math.max(minW, startW - dx)
        win.width = newW
        win.x = startWinX + (startW - newW)
      }
      if (resizeDir.includes("n")) {
        const newH = Math.max(minH, startH - dy)
        win.height = newH
        win.y = startWinY + (startH - newH)
      }
      m.redraw()
    }

    const onUp = (ev) => {
      isResizing = false
      target.releasePointerCapture(ev.pointerId)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      if (onWindowUpdate) onWindowUpdate(win)
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  let stablePhysicalTabs = [] // 物理 DOM 顺序列表，一旦确定就不再因排序而改变，除非 Tab 关闭

  return {
    oncreate: (vnode) => {
      domRect = vnode.dom
    },
    view: function ({ attrs }) {
      // 外层已经给窗口 vnode 指定了 key，不能随 {...attrs} 传给子组件（Mithril 要求同级 children 全 key 或全无 key）
      const { key: _winVnodeKey, ...childAttrs } = attrs
      const win = attrs.windowData
      const isHostWindow = win.isMain || m.route.param("winId") === win.id
      const realTabs = attrs.tabs || []

      // 同步稳定物理列表
      // 1. 移除已关闭的
      stablePhysicalTabs = stablePhysicalTabs.filter(s => realTabs.find(r => r.sign === s.sign))
      // 2. 添加新打开的（追加到末尾）
      realTabs.forEach(r => {
        if (!stablePhysicalTabs.find(s => s.sign === r.sign)) {
          stablePhysicalTabs.push(r)
        }
      })
      // 3. 更新引用（确保 data 始终是最新的）
      stablePhysicalTabs = stablePhysicalTabs.map(s => realTabs.find(r => r.sign === s.sign))

      // 根据 activeSign 查找当前激活的 tab
      let activeTab = realTabs.find(t => t.sign === win.activeSign)
      // 如果没找到（可能被删了？理论上 Notice.js handle 了），默认第一个
      if (!activeTab && realTabs.length > 0) {
        activeTab = realTabs[0]
      }
      if (!activeTab) return null

      const isMini = !!activeTab.isMini
      const useFloatBall = !!activeTab.useFloatBall
      const isAuto = (win.width === 0 || win.height === 0)

      const resizeHandles = (!win.isMaximized && !isHostWindow) ? ["n", "s", "w", "e", "nw", "ne", "sw", "se"].map(dir => {
        const isCorner = dir.length === 2
        return m("", {
          style: {
            touchAction: "none",
            position: "absolute",
            zIndex: isCorner ? 2 : 1,
            cursor: dir + "-resize",
            ...(dir === "n" ? { top: "-8px", left: "20px", right: "20px", height: "14px" } : {}),
            ...(dir === "s" ? { bottom: "-8px", left: "20px", right: "20px", height: "14px" } : {}),
            ...(dir === "w" ? { left: "-8px", top: "20px", bottom: "20px", width: "14px" } : {}),
            ...(dir === "e" ? { right: "-8px", top: "20px", bottom: "20px", width: "14px" } : {}),
            ...(dir === "nw" ? { top: "-8px", left: "-8px", width: "28px", height: "28px" } : {}),
            ...(dir === "ne" ? { top: "-8px", right: "-8px", width: "28px", height: "28px" } : {}),
            ...(dir === "sw" ? { bottom: "-8px", left: "-8px", width: "28px", height: "28px" } : {}),
            ...(dir === "se" ? { bottom: "-8px", right: "-8px", width: "28px", height: "28px" } : {}),
          },
          onpointerdown: (e) => handlePointerDown(e, dir, win, attrs.onWindowUpdate)
        })
      }) : []

      return m(".animated.zoomIn.window-box", {
        "data-win-id": win.id,
        style: {
          position: "fixed",
          zIndex: (win.isPinned && !win.isWindow ? 900000 : 0) + (win.zIndex || 0),
          display: (win.minimized && !isHostWindow) ? "none" : "flex",
          "-webkit-app-region": "no-drag",
          flexDirection: "column",
          background: getColor('gray_1').back,
          borderRadius: win.isMaximized ? "0" : "3rem",
          boxShadow: isHostWindow ? "0 0 0.5rem rgba(0,0,0,0.5)" : "0 0 2rem rgba(0,0,0,0.3)",
          // 已移除 backdrop-filter: blur(10px)：窗口底色不透明，模糊根本看不见，纯粹是每帧重绘的额外开销
          //overflow: "hidden",
          border: win.isMaximized ? "none" : `0.1rem solid ${getColor('main').back}`,
          boxSizing: "border-box",
          transition: isResizing ? "none" : "display 0.3s, opacity 0.3s",
          minWidth: isMini ? "8rem" : "max(20rem, fit-content)",

          ...(isHostWindow ? {
            left: "0.5rem",
            top: "0.5rem",
            width: "calc(100% - 1rem)",
            height: `calc(100% - 1rem - ${commonData.navInset || 0}px)`
          } : win.isMaximized ? {
            // 底部避让导航栏：Nav 已是独立于窗口层的高层级覆盖层，全屏窗口不能压住它
            left: "0px",
            top: "2.5rem",
            width: "100%",
            height: `calc(100% - 2.5rem - ${commonData.navInset || 0}px)`
          } : {
            // 位置统一交给 transform：改 x/y 只触发合成层位移，不再触发重排（left/top 恒为 0）
            left: (win.x === 0 && win.y === 0 && isAuto) ? "50%" : "0px",
            top: (win.x === 0 && win.y === 0 && isAuto) ? `calc(50% + (2.5rem - ${commonData.navInset || 0}px) / 2)` : "0px",
            transform: (win.x === 0 && win.y === 0 && isAuto) ? "translate(-50%, -50%)" : `translate3d(${win.x}px, ${win.y}px, 0)`,
            width: win.width === 0 ? "auto" : (win.width + "px"),
            height: win.height === 0 ? "auto" : (win.height + "px"),
            maxWidth: isAuto ? "95vw" : "none",
            maxHeight: isAuto ? `calc(100vh - 2.5rem - ${commonData.navInset || 0}px - 2rem)` : "none"
          }),
          // 透明内容模式：窗口外壳同步去底，使内容整体悬浮
          ...(activeTab.transparentContent ? {
            background: "transparent",
            border: "none",
            boxShadow: "none"
          } : {})
        },
        onpointerdown: () => {
          attrs.onActivate()
        },
      }, [
        // ---------------- Header ----------------
        useFloatBall ? m(FloatBall, childAttrs) : m(WindowHeader, childAttrs),

        !useFloatBall ? m(TabBar, childAttrs) : null,

        // ---------------- 内容区 ----------------
        m("", {
          style: {
            flex: 1,
            position: "relative",
            overflow: "auto",
            background: activeTab.transparentContent
              ? "transparent"
              : getColor('brown_2').back,
            margin: "0.5rem",
            borderRadius: "3rem",
            display: "flex",
            flexDirection: "column",
          }
        }, stablePhysicalTabs.map(tab => { // 绝对物理稳定渲染，保证 webview 不重连
          const isActive = tab.sign === win.activeSign

          // 主窗口渲染外部独立窗口时：无 style 的 Box 呈现 SVG 占位图标，点击激活外部视窗
          if (!isHostWindow && win.isWindow) {
            return m("div", {
              key: tab.sign,
              style: {
                display: isActive ? "flex" : "none",
                flex: 1,
                alignItems: "center",
                justifyContent: "center"
              }
            }, [
              m(Box, {
                isBtn: true,
                ext: {
                  onclick: () => {
                    if (win.childWin && !win.childWin.closed) win.childWin.focus()
                    settingData.fnCall("sysWinControl", ["focus", win.id])
                  }
                }
              }, [
                m.trust(iconPark.getIcon("OffScreenOne", { size: "48px" }))
              ])
            ])
          }

          const ContentComp = tab.content
          if (!ContentComp) return null

          return m("div", {
            key: tab.sign,
            style: {
              display: isActive ? "flex" : "none",
              flex: 1,
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }
          }, [
            m(ContentComp, {
              noticeConfig: tab,
              key: tab.sign + "_content",
              ...tab.contentAttrs,
              delete: () => attrs.onCloseTab(tab.sign),
              // 备注：closeLayer 为旧版“遮罩层弹窗”的遗留接口，当前无任何 App 使用（仅保留兼容）
              closeLayer: () => attrs.onCloseWindow()
            })
          ])
        })),

        ...resizeHandles
      ])
    }
  }
}
