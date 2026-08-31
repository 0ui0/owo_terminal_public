import settingData from "../view/setting/settingData.js"
import commonData from "../view/common/commonData.js"
import Tip from "../view/common/tip.js"

// 全局快捷键监听系统（独立文件，main.js 引入）
// 参考 svgEditor/svgEditor/events/paperOncreate.js 的快捷键监听方式：
//   1. document keydown → 维护全局按键状态 commonData.pressKeys（记录所有按下的键）
//   2. document keyup   → 从 pressKeys 移除抬起的键，延迟清理修饰键
//   3. window keydown   → 读取 pressKeys 排序后序列化比对，命中则触发业务
let inited = false

export default function initShortcut() {
  if (inited) return
  inited = true

  const pressKeys = commonData.pressKeys
  let checkPressTimer = null

  // ========== 1. 维护全局按键状态 (pressKeys) ==========
  document.addEventListener("keydown", (e) => {
    if (pressKeys.indexOf(e.key) === -1) {
      pressKeys.push(e.key)
    }
  })

  // ========== 2. keyup 清理按键状态（含修饰键延迟清理） ==========
  document.addEventListener("keyup", (e) => {
    const index = pressKeys.indexOf(e.key)
    if (index !== -1) {
      pressKeys.splice(index, 1)
    }
    if (!checkPressTimer) {
      checkPressTimer = setTimeout(() => {
        const activeKeys = []
        if (e.metaKey && pressKeys.indexOf("Meta") !== -1) activeKeys.push("Meta")
        if (e.ctrlKey && pressKeys.indexOf("Control") !== -1) activeKeys.push("Control")
        if (e.shiftKey && pressKeys.indexOf("Shift") !== -1) activeKeys.push("Shift")
        if (e.altKey && pressKeys.indexOf("Alt") !== -1) activeKeys.push("Alt")
        pressKeys.length = 0
        pressKeys.push(...activeKeys)
        checkPressTimer = null
      }, 100)
    }
  })

  // ========== 3. 快捷键业务触发 ==========
  window.addEventListener("keydown", (e) => {
    const tag = e.target?.tagName?.toLowerCase()
    if (tag === "textarea" || tag === "input") return

    const keys = pressKeys.map(k => k.toLowerCase())
    const keysStr = JSON.stringify(keys)

    // cmd+p (Mac) / ctrl+p (Win)：打开「快速打开」(quickOpen)
    if (keysStr === JSON.stringify(["meta", "p"]) || keysStr === JSON.stringify(["control", "p"])) {
      e.preventDefault() // 拦截浏览器默认打印
      settingData.fnCall("appLaunch", ["quickOpen"]).catch(err => {
        console.error("[快捷键] 启动 quickOpen 失败:", err)
      })
      return
    }

    // 缩放放大：cmd/ctrl + = 或 cmd/ctrl + +
    const isZoomIn = (
      keysStr === JSON.stringify(["meta", "="]) ||
      keysStr === JSON.stringify(["control", "="]) ||
      keysStr === JSON.stringify(["meta", "+"]) ||
      keysStr === JSON.stringify(["control", "+"]) ||
      keysStr === JSON.stringify(["meta", "shift", "+"]) ||
      keysStr === JSON.stringify(["control", "shift", "+"])
    )

    // 缩放缩小：cmd/ctrl + -
    const isZoomOut = (
      keysStr === JSON.stringify(["meta", "-"]) ||
      keysStr === JSON.stringify(["control", "-"])
    )

    // 缩放重置：cmd/ctrl + 0
    const isZoomReset = (
      keysStr === JSON.stringify(["meta", "0"]) ||
      keysStr === JSON.stringify(["control", "0"])
    )

    if (isZoomIn) {
      e.preventDefault()
      commonData.zoomFactor = Math.min(2.0, Math.round((commonData.zoomFactor + 0.1) * 10) / 10)
      commonData.updateFontSize()
      Tip.launch(`缩放: ${Math.round(commonData.zoomFactor * 100)}%`, 1200)
      m.redraw()
      return
    }

    if (isZoomOut) {
      e.preventDefault()
      commonData.zoomFactor = Math.max(0.5, Math.round((commonData.zoomFactor - 0.1) * 10) / 10)
      commonData.updateFontSize()
      Tip.launch(`缩放: ${Math.round(commonData.zoomFactor * 100)}%`, 1200)
      m.redraw()
      return
    }

    if (isZoomReset) {
      e.preventDefault()
      commonData.zoomFactor = 1.0
      commonData.updateFontSize()
      Tip.launch("缩放已重置: 100%", 1200)
      m.redraw()
      return
    }
  })
}
