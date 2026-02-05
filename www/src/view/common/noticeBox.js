import Box from "./box.js";
import Tag from "./tag.js";
import getColor from "./getColor.js"

export default function () {
  let isResizing = false
  let resizeDir = ""
  let startX, startY, startW, startH, startWinX, startWinY

  let isMoving = false
  let moveStartX, moveStartY, moveStartWinX, moveStartWinY

  let preMaxState = null
  let domRect = null
  let currentAttrs = null // Fix: Capture attrs in closure

  // 注入隐藏滚动条的样式
  const injectStyle = () => {
    if (document.getElementById("notice-box-style")) return
    const style = document.createElement("style")
    style.id = "notice-box-style"
    style.innerHTML = `
      .hide-scrollbar::-webkit-scrollbar { display: none; }
      .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    `
    document.head.appendChild(style)
  }
  injectStyle()

  // 固化尺寸函数
  const materialize = (dom, win) => {
    const isAuto = (win.width === 0 || win.height === 0)
    if (isAuto && dom) {
      const rect = dom.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      win.width = rect.width
      win.height = rect.height
      win.x = rect.left
      win.y = rect.top
    }
  }

  // ---------------- 事件处理 ----------------

  const handlePointerDown = (e, dir, win) => {
    e.stopPropagation(); e.preventDefault()

    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const rootDom = e.target.closest(".window-box")
    materialize(rootDom, win)

    isResizing = true; resizeDir = dir
    startX = e.clientX; startY = e.clientY
    startW = win.width; startH = win.height
    startWinX = win.x; startWinY = win.y

    const onMove = (e) => {
      if (!isResizing) return
      const dx = e.clientX - startX; const dy = e.clientY - startY
      const minW = 200; const minH = 150

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
    const onUp = (e) => {
      isResizing = false
      target.releasePointerCapture(e.pointerId)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      if (currentAttrs && currentAttrs.onWindowUpdate) currentAttrs.onWindowUpdate(win)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  const handleTitleDown = (e, win, onActivate) => {
    if (e.target.closest(".win-btn") || e.target.closest(".tab-item")) return
    e.preventDefault()
    onActivate()
    if (win.isMaximized) return

    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const rootDom = e.target.closest(".window-box")
    materialize(rootDom, win)

    isMoving = true
    moveStartX = e.clientX; moveStartY = e.clientY
    moveStartWinX = win.x; moveStartWinY = win.y

    const onMove = (e) => {
      if (!isMoving) return
      const dx = e.clientX - moveStartX; const dy = e.clientY - moveStartY
      win.x = moveStartWinX + dx
      win.y = moveStartWinY + dy
      m.redraw()
    }
    const onUp = (e) => {
      isMoving = false
      target.releasePointerCapture(e.pointerId)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      if (currentAttrs && currentAttrs.onWindowUpdate) currentAttrs.onWindowUpdate(win)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  const toggleMaximize = (e, win) => {
    const rootDom = e.target.closest(".window-box")
    materialize(rootDom, win)

    if (win.isMaximized) {
      if (preMaxState) {
        win.x = preMaxState.x; win.y = preMaxState.y
        win.width = preMaxState.width; win.height = preMaxState.height
      }
      win.isMaximized = false
    } else {
      preMaxState = { x: win.x, y: win.y, width: win.width, height: win.height }
      win.isMaximized = true
    }
    if (currentAttrs && currentAttrs.onWindowUpdate) currentAttrs.onWindowUpdate(win)
    m.redraw()
  }

  const handleConfirm = async (box, e, win, activeTab, onCloseTab) => {
    if (e && e.stopPropagation) e.stopPropagation()
    const confirmFn = activeTab.confirm || function () { }
    // 兼容旧版：第一个参数是 DOM，第二个是删除函数，第三个是 Tab 数据
    const shouldClose = await confirmFn(box, () => onCloseTab(activeTab), activeTab, e)
    if (shouldClose === undefined) {
      onCloseTab(activeTab)
    }
  }

  const handleCancel = async (box, e, win, activeTab, onCloseTab) => {
    if (e && e.stopPropagation) e.stopPropagation()
    const cancelFn = activeTab.cancel || function () { }
    // 兼容旧版：第一个参数是 DOM，第二个是删除函数，第三个是 Tab 数据
    const shouldClose = await cancelFn(box, () => onCloseTab(activeTab), activeTab, e)
    if (shouldClose === undefined) {
      onCloseTab(activeTab)
    }
  }

  const handleMinimize = (box, e, win) => {
    if (e && e.stopPropagation) e.stopPropagation()
    win.minimized = true
    m.redraw()
  }

  // ---------------- Tab 拖拽逻辑 ----------------
  // 本地拖拽状态 (Closure for component instance)
  let draggingState = {
    isDragging: false,
    dragTabSign: null,
    visualTabs: [], // 拖拽时的临时列表
    startX: 0,
    dragTarget: null, // 被拖拽的 DOM 引用
    offsetX: 0 // 手指相对于 DOM 左侧的偏移
  }

  let stablePhysicalTabs = [] // 物理 DOM 顺序列表，一旦确定就不再因排序而改变，除非 Tab 关闭
  let physicalMidPoints = []  // 用于拖拽计算的稳定中点

  const handleTabDown = (e, tab, tabs, onSetTabOrder) => {
    e.preventDefault(); e.stopPropagation()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    // 初始化状态
    draggingState.isDragging = true
    draggingState.dragTabSign = tab.sign
    draggingState.visualTabs = [...tabs]
    draggingState.dragTarget = target

    // 缓存当前的物理中点 (基于不带 transform 的位置)
    const parent = target.parentElement
    const children = Array.from(parent.children)
    physicalMidPoints = children.map(child => {
      const rect = child.getBoundingClientRect()
      // 去除当前可能存在的 transform 影响
      const style = window.getComputedStyle(child)
      const matrix = new WebKitCSSMatrix(style.transform)
      const currentTx = matrix.m41
      return rect.left - currentTx + rect.width / 2
    })

    // 记录初始位置信息
    const rect = target.getBoundingClientRect()
    draggingState.startX = e.clientX
    draggingState.offsetX = e.clientX - rect.left

    // 视觉反馈：设置样式让元素看起来"浮起"
    // 注意：这里的 target 是列表中的某一项。在重绘后，这个 DOM 可能会被 Mithril 回收或重用
    // 但因为我们用了 key，所以应该能对应上。
    // 不过，为了实现纯粹的 Ghost 效果，我们通常会创建一个 clone。
    // 但这里为了方便，我们直接把被拖拽的那个 tab 设置为 position: fixed/absolute
    // 而原位置放一个透明占位符。

    // 简化方案：只做列表重排，不做脱离文档流。
    // 用户提到的“右边往左边拖左边会交换，但是反过来却不会”是因为之前的逻辑不够对称。
    // 现在改用基于索引的完全重排。

    // 提升且透明一点点
    target.style.zIndex = 1000
    target.style.opacity = 0.9
    target.style.position = "relative" // 保持 relative 以便 translate
    target.style.transition = "none" // 拖拽时无过渡

    const onMove = (e) => {
      // 1. 被拖拽元素跟随手指 (物理 DOM 不动，改 transform)
      const currentLayoutLeft = target.offsetLeft + target.offsetParent.getBoundingClientRect().left
      const desiredLeft = e.clientX - draggingState.offsetX
      let tx = desiredLeft - currentLayoutLeft
      target.style.transform = `translate3d(${tx}px, 0, 0)`

      // 2. 计算当前拖拽到的“槽位” (Slot)
      const draggingCenter = e.clientX // 使用鼠标位置

      // 基于缓存的物理中点判断 Slot
      let newVisualIndex = -1
      for (let i = 0; i < physicalMidPoints.length; i++) {
        if (draggingCenter < physicalMidPoints[i]) {
          newVisualIndex = i
          break
        }
      }
      if (newVisualIndex === -1) newVisualIndex = physicalMidPoints.length - 1

      // 3. 构建当前的视觉顺序 (Visual Index Map)
      const physicalIndex = tabs.findIndex(t => t.sign === draggingState.dragTabSign)

      // 生成一个新的视觉索引数组，表示物理位置上的 Tab 应该映射到哪个视觉槽位
      // 比如 physical tabs [A, B, C], 我们拖 B 到 0。 visualOrder = [1, 0, 2]
      // A(0)->Slot1, B(1)->Slot0, C(2)->Slot2

      const newOrderSign = []
      for (let i = 0; i < tabs.length; i++) {
        if (i === physicalIndex) continue
        newOrderSign.push(tabs[i].sign)
      }
      newOrderSign.splice(newVisualIndex, 0, draggingState.dragTabSign)

      // 如果顺序没变，不触发重绘
      const currentOrderSigns = draggingState.visualTabs.map(t => t.sign)
      if (JSON.stringify(newOrderSign) === JSON.stringify(currentOrderSigns)) {
        return
      }

      // 更新视觉列表并重绘
      draggingState.visualTabs = newOrderSign.map(sign => tabs.find(t => t.sign === sign))
      m.redraw()
    }

    const onUp = (e) => {
      target.releasePointerCapture(e.pointerId)
      // target.removeEventListener("pointermove", onMove) // 注意: 这里的 target 必须是同一个 DOM
      // 但实际上我们监听的是 document
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)

      // 恢复样式
      target.style.zIndex = ""
      target.style.opacity = ""
      target.style.position = ""
      target.style.transform = ""
      target.style.transition = ""

      // 提交最终结果
      if (onSetTabOrder && draggingState.isDragging) {
        const finalOrder = draggingState.visualTabs.map(t => t.sign)
        // 检查是否有变动
        const originalOrder = tabs.map(t => t.sign)
        if (JSON.stringify(finalOrder) !== JSON.stringify(originalOrder)) {
          onSetTabOrder(finalOrder)
        }
      }

      // Reset State
      draggingState.isDragging = false
      draggingState.dragTabSign = null
      draggingState.visualTabs = []
      draggingState.dragTarget = null

      m.redraw()
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  return {
    oncreate: (vnode) => {
      domRect = vnode.dom
    },
    view: function ({ attrs }) {
      currentAttrs = attrs; // Update current attrs
      const win = attrs.windowData
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

      const tabs = (draggingState.isDragging && draggingState.visualTabs.length > 0)
        ? draggingState.visualTabs
        : realTabs

      // 根据 activeSign 查找当前激活的 tab
      let activeTab = tabs.find(t => t.sign === win.activeSign)
      // 如果没找到（可能被删了？理论上 Notice.js handle 了），默认第一个
      if (!activeTab && tabs.length > 0) {
        activeTab = tabs[0]
        // 回写（但在 view 里不建议直接修改 state，除非是 correction）
        // win.activeSign = activeTab.sign 
      }
      if (!activeTab) return null

      const ContentComp = activeTab.content
      const hideBtn = activeTab.hideBtn || 0
      const useMinus = activeTab.useMinus ?? true

      const isAuto = (win.width === 0 || win.height === 0)

      const resizeHandles = !win.isMaximized ? ["n", "s", "w", "e", "nw", "ne", "sw", "se"].map(dir => {
        return m("", {
          style: {
            position: "absolute", zIndex: 10, cursor: dir + "-resize",
            ...(dir === "n" ? { top: "-10px", left: "10px", right: "10px", height: "20px" } : {}),
            ...(dir === "s" ? { bottom: "-10px", left: "10px", right: "10px", height: "20px" } : {}),
            ...(dir === "w" ? { left: "-10px", top: "10px", bottom: "10px", width: "20px" } : {}),
            ...(dir === "e" ? { right: "-10px", top: "10px", bottom: "10px", width: "20px" } : {}),
            ...(dir === "nw" ? { top: "-10px", left: "-10px", width: "30px", height: "30px" } : {}),
            ...(dir === "ne" ? { top: "-10px", right: "-10px", width: "30px", height: "30px" } : {}),
            ...(dir === "sw" ? { bottom: "-10px", left: "-10px", width: "30px", height: "30px" } : {}),
            ...(dir === "se" ? { bottom: "-10px", right: "-10px", width: "30px", height: "30px" } : {}),
          },
          onpointerdown: (e) => handlePointerDown(e, dir, win)
        })
      }) : []

      return m(".animated.zoomIn.window-box", {
        style: {
          position: "fixed",
          zIndex: win.zIndex,
          display: win.minimized ? "none" : "flex",
          flexDirection: "column",
          background: "#393432",
          borderRadius: win.isMaximized ? "0" : "3rem",
          boxShadow: "0 0 2rem rgba(0,0,0,0.3)",
          backdropFilter: "blur(10px)",
          "-webkit-backdrop-filter": "blur(10px)",
          overflow: "hidden",
          border: win.isMaximized ? "none" : "0.1rem solid #755d5c",
          transition: isResizing || isMoving ? "none" : "display 0.3s, opacity 0.3s",

          ...(win.isMaximized ? {
            left: "0px", top: "0px", width: "100%", height: "100%"
          } : {
            left: (win.x === 0 && win.y === 0 && isAuto) ? "50%" : (win.x + "px"),
            top: (win.x === 0 && win.y === 0 && isAuto) ? "50%" : (win.y + "px"),
            transform: (win.x === 0 && win.y === 0 && isAuto) ? "translate(-50%, -50%)" : "none",
            width: win.width === 0 ? "auto" : (win.width + "px"),
            height: win.height === 0 ? "auto" : (win.height + "px"),
            maxWidth: "95vw", maxHeight: "95vh"
          })
        },
        onpointerdown: () => attrs.onActivate()
      }, [
        // ---------------- Header ----------------
        m("", {
          style: {
            width: "100%",
            touchAction: "none",
            background: "#755d5c",
            display: "flex",
            alignItems: "center",
            padding: "0.5rem",
            flexShrink: 0,
            userSelect: "none"
          },
          onpointerdown: (e) => handleTitleDown(e, win, attrs.onActivate),
          ondblclick: (e) => toggleMaximize(e, win)
        }, [
          m("", { style: { width: "0.5rem" } }),

          // 标题
          m(Box, {
            style: {
              background: "transparent",
              fontWeight: "bold",
              color: "#333",
              margin: "0",
              userSelect: "none",
              maxWidth: "50%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }
          }, activeTab.tip || "提示"),

          m("", { style: { marginLeft: "auto" } }),

          // Custom Header Buttons (User added)
          (activeTab.headerButtons || []).map(btn => m(Box, {
            class: "win-btn",
            isBtn: true,
            style: {
              background: btn.color || "#5e6c79",
              color: "#eee",
              border: "0.1rem solid #393432",
              borderRadius: "50%",
              display: "inline-flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "0",
              width: "2.5rem", height: "2.5rem",
              marginRight: "0.5rem"
            },
            onclick: (dom, e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              btn.onclick(e);
            }
          }, [
            typeof btn.icon === 'string' && btn.icon.startsWith("<")
              ? m.trust(btn.icon)
              : (btn.icon || "⚓")
          ])),

          // Confirm Check
          (hideBtn === 0 || hideBtn === 3) ? m(Box, {
            class: "win-btn",
            isBtn: true,
            style: {
              background: "#a75e5e",
              color: "#463838",
              border: "0.1rem solid #393432",
              borderRadius: "50%",
              display: "inline-flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "0",
              width: "2.5rem", height: "2.5rem",
              marginRight: "0.5rem"
            },
            // 确认按钮
            onclick: function (e) { handleConfirm(this, e, win, activeTab, attrs.onCloseTab) }
          }, [
            activeTab.confirmWords ? activeTab.confirmWords : m.trust(iconPark.getIcon("Check", { fill: "#463838", size: "12px" }))
          ]) : null,

          // Close / Cancel
          (hideBtn === 0 || hideBtn === 2) ? m(Box, {
            class: "win-btn",
            isBtn: true,
            style: {
              background: "#636363",
              color: "#333",
              border: "0.1rem solid #393432",
              borderRadius: "50%",
              display: "inline-flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "0",
              width: "2.5rem", height: "2.5rem",
              marginRight: "0.5rem"
            },
            // 关闭/取消按钮
            onclick: function (e) { handleCancel(this, e, win, activeTab, attrs.onCloseTab) }
          }, [
            activeTab.cancelWords ? activeTab.cancelWords : m.trust(iconPark.getIcon("Close", { fill: "#333", size: "12px" }))
          ]) : null,

          // Minimize
          useMinus ? m(Box, {
            class: "win-btn",
            isBtn: true,
            style: {
              background: "#6c6379",
              color: "#333",
              border: "0.1rem solid #393432",
              borderRadius: "50%",
              display: "inline-flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "0",
              width: "2.5rem", height: "2.5rem"
            },
            onclick: function (e) { handleMinimize(this, e, win) }
          }, [
            m.trust(iconPark.getIcon("Minus", { fill: "#333", size: "12px" }))
          ]) : null

        ]),

        tabs.length > 1 ? m("", {
          style: {
            height: "3.5rem",
            background: "#332f2c",
            display: "flex",
            flexWrap: "nowrap",
            alignItems: "center",
            padding: "0 0.5rem",
            gap: "0.2rem",
            overflowX: "auto",
            scrollbarWidth: "thin", // 改为极细滚动条，或者完全依赖滚轮
            flexShrink: 0,
            borderBottom: "0.1rem solid #555",
            scrollBehavior: "smooth"
          },
          // 监听滚轮，将垂直滚动转换为水平滚动
          onwheel: (e) => {
            e.currentTarget.scrollLeft += e.deltaY;
            e.preventDefault();
          }
        }, realTabs.map((tab, physicalIndex) => {
          const isActive = tab.sign === win.activeSign
          const isDraggingThis = draggingState.isDragging && tab.sign === draggingState.dragTabSign

          // 计算视觉偏移
          let translateX = 0
          if (draggingState.isDragging && draggingState.visualTabs.length === realTabs.length) {
            const visualIndex = draggingState.visualTabs.findIndex(t => t.sign === tab.sign)
            if (visualIndex !== -1 && visualIndex !== physicalIndex && !isDraggingThis) {
              // 计算每一项的宽度。由于 Tab 宽度可能不等，这比较复杂。
              // 简单做法：假设所有 Tab 宽度相等，或者直接读取 DOM。
              // 这里我们读取最近一次记录的 rect。
              const parent = draggingState.dragTarget?.parentElement
              if (parent) {
                const children = Array.from(parent.children)
                const targetChild = children[visualIndex]
                const currentChild = children[physicalIndex]
                if (targetChild && currentChild) {
                  translateX = targetChild.offsetLeft - currentChild.offsetLeft
                }
              }
            }
          }

          return m("", {
            key: tab.sign, // 必须添加 key，否则重排后 DOM 状态丢失
            class: "tab-item",
            style: {
              display: "flex", alignItems: "center",
              padding: "0 12px", gap: "6px",
              height: "100%", cursor: "pointer",
              fontSize: "12px", color: isActive ? "#eee" : "#999",
              background: isActive ? "#2d2d2d" : "transparent",
              borderRight: "1px solid #333",
              userSelect: "none", touchAction: "none",

              flex: "0 1 180px",   // 允许压缩，最大 180px
              minWidth: "60px",   // 最小宽度
              maxWidth: "180px",

              transform: isDraggingThis ? undefined : `translate3d(${translateX}px, 0, 0)`,
              transition: isDraggingThis ? "none" : "transform 0.2s cubic-bezier(0.2, 0, 0, 1), background 0.2s",
              zIndex: isDraggingThis ? 1000 : 1
            },
            onpointerdown: (e) => {
              e.stopPropagation()
              attrs.onSwitchTab(tab)
              handleTabDown(e, tab, realTabs, attrs.onSetTabOrder)
            }
          }, [
            m("span", {
              style: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1
              }
            }, tab.tip || "Tab"),
            m("span", {
              style: {
                marginLeft: "0.8rem",
                cursor: "pointer",
                opacity: 0.7,
                padding: "0.2rem 0.5rem",
                fontSize: "1.3rem",
                borderRadius: "50%",
                transition: "background 0.2s"
              },
              onpointerdown: (e) => { e.stopPropagation() }, // 防止触发拖拽
              onclick: function (e) {
                e.stopPropagation()
                handleCancel(this, e, win, tab, attrs.onCloseTab)
              }
            }, "×")
          ])
        })) : null,

        // ---------------- 内容区 ----------------
        m("", {
          style: {
            flex: 1,
            position: "relative",
            overflow: "auto",
            background: "#5e5653",
            margin: "0.5rem",
            borderRadius: "2rem",
            display: "flex", flexDirection: "column"
          }
        }, stablePhysicalTabs.map(tab => { // 绝对物理稳定渲染，保证 webview 不重连
          const isActive = tab.sign === win.activeSign
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
              delete: () => attrs.onCloseTab(tab),
              closeLayer: () => attrs.onCloseWindow()
            })
          ])
        })),

        ...resizeHandles
      ])
    }
  }
}
