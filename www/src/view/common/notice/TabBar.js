import getColor from "../getColor.js"

// ---------------- Tab 拖拽逻辑 ----------------
export default function () {
  let physicalMidPoints = []  // 用于拖拽计算的稳定中点
  // 本地拖拽状态 (Closure for component instance)
  let draggingState = {
    isDragging: false,
    dragTabSign: null,
    visualTabs: [], // 拖拽时的临时列表
    startX: 0,
    dragTarget: null, // 被拖拽的 DOM 引用
    offsetX: 0 // 手指相对于 DOM 左侧的偏移
  }

  const handleTabDown = (e, tab, tabs, onSetTabOrder) => {
    e.preventDefault()
    e.stopPropagation()
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

    // 提升且透明一点点
    target.style.zIndex = 1000
    target.style.opacity = 0.9
    target.style.position = "relative" // 保持 relative 以便 translate
    target.style.transition = "none" // 拖拽时无过渡

    const onMove = (ev) => {
      // 1. 被拖拽元素跟随手指 (物理 DOM 不动，改 transform)
      const currentLayoutLeft = target.offsetLeft + target.offsetParent.getBoundingClientRect().left
      const desiredLeft = ev.clientX - draggingState.offsetX
      let tx = desiredLeft - currentLayoutLeft
      target.style.transform = `translate3d(${tx}px, 0, 0)`

      // 2. 计算当前拖拽到的“槽位” (Slot)
      const draggingCenter = ev.clientX // 使用鼠标位置
      let newVisualIndex = -1
      // 基于缓存的物理中点判断 Slot
      for (let i = 0; i < physicalMidPoints.length; i++) {
        if (draggingCenter < physicalMidPoints[i]) {
          newVisualIndex = i
          break
        }
      }
      if (newVisualIndex === -1) newVisualIndex = physicalMidPoints.length - 1

      // 3. 构建当前的视觉顺序 (Visual Index Map)
      const physicalIndex = tabs.findIndex(t => t.sign === draggingState.dragTabSign)
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

    const onUp = (ev) => {
      target.releasePointerCapture(ev.pointerId)
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
        const originalOrder = tabs.map(t => t.sign)
        // 检查是否有变动
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
    view({ attrs }) {
      const win = attrs.windowData
      const realTabs = attrs.tabs || []
      if (!(realTabs.length > 1)) return null

      return m("", {
        style: {
          height: "3.5rem",
          background: getColor('brown_1').back,
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "center",
          padding: "0 0.5rem",
          overflowX: "auto",
          scrollbarWidth: "thin", // 改为极细滚动条，或者完全依赖滚轮
          flexShrink: 0,
          borderBottom: `0.1rem solid ${getColor('main').back}`,
          scrollBehavior: "smooth"
        },
        // 监听滚轮，将垂直滚动转换为水平滚动
        onwheel: (e) => {
          e.currentTarget.scrollLeft += e.deltaY
          e.preventDefault()
        }
      }, realTabs.map((tab, physicalIndex) => {
        const isActive = tab.sign === win.activeSign
        const isDraggingThis = draggingState.isDragging && tab.sign === draggingState.dragTabSign

        // 计算视觉偏移
        let translateX = 0
        if (draggingState.isDragging && draggingState.visualTabs.length === realTabs.length) {
          const visualIndex = draggingState.visualTabs.findIndex(t => t.sign === tab.sign)
          if (visualIndex !== -1 && visualIndex !== physicalIndex && !isDraggingThis) {
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
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            height: "100%",
            cursor: "pointer",
            fontSize: "12px",
            background: isActive ? getColor('blue_2').back : getColor('gray_1').back,
            color: isActive ? getColor('blue_2').front : getColor('gray_1').front,
            borderRight: `1px solid ${getColor('main').back}`,
            userSelect: "none",
            touchAction: "none",
            flex: "0 1 180px", // 允许压缩，最大 180px
            minWidth: "60px", // 最小宽度
            maxWidth: "180px",
            transform: `translate3d(${translateX}px, 0, 0)`,
            transition: isDraggingThis ? "none" : "transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
            zIndex: isDraggingThis ? 1000 : 1
          },
          onpointerdown: (e) => {
            handleTabDown(e, tab, realTabs, attrs.onSetTabOrder)
          },
          onclick: () => {
            if (!draggingState.isDragging) {
              attrs.onSwitchTab(tab.sign)
            }
          }
        }, [
          m("span", {
            style: {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              pointerEvents: "none"
            }
          }, tab.tip || "未命名"),
          m("span", {
            class: "tab-close-btn",
            style: {
              marginLeft: "8px",
              padding: "2px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.6
            },
            onpointerdown: (e) => e.stopPropagation(),
            onclick: (e) => {
              e.stopPropagation()
              attrs.onCloseTab(tab.sign)
            }
          }, "✕")
        ])
      }))
    }
  }
}
