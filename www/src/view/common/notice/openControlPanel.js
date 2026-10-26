import Notice from "../notice.js"
import WindowHeader from "./WindowHeader.js"
import TabBar from "./TabBar.js"

// ---------------- 多 Tab 遥控控制面板 ----------------
// 长官定调：遥控小窗与正常窗口的唯一区别是「只显示内容」，即只剔除正文 content，
// 完整复用目标窗口的 WindowHeader 与 TabBar，保持当前 Tab 状态与双向联动。
// 双层关闭按钮权责：外层 Notice 关闭按钮负责收起遥控面板；内层 WindowHeader 关闭按钮负责真正关闭目标窗口。
export default function openControlPanel({ anchorDom, winId, x, y } = {}) {
  if (!winId) return

  const menuSign = "control_panel_" + winId

  // Toggle：若该窗口的遥控面板已打开，再点一次收起
  const isOpened = Notice.data.dataArr.some(t => t.sign === menuSign)
  if (isOpened) {
    Notice.closeTab(menuSign)
    return
  }

  let posX = x
  let posY = y

  if ((posX === undefined || posY === undefined) && anchorDom) {
    const rect = anchorDom.getBoundingClientRect()
    const isBottomNav = rect.top > window.innerHeight / 2
    posX = Math.max(10, Math.min(window.innerWidth - 300, rect.left))
    posY = isBottomNav ? Math.max(10, rect.top - 150) : rect.bottom + 6
  }

  Notice.launch({
    sign: menuSign,
    tip: "遥控面板",
    isMini: true, // 外层迷你 Notice
    useFloatBall: false, // 严格防自身套娃
    width: 0, // 宽度自适应
    closeOnClickOutside: true, // 点击外部自动收起
    win: {
      x: posX === undefined ? 20 : posX,
      y: posY === undefined ? 20 : posY
    },
    hideBtn: 2, // 外层仅保留关闭按钮
    content: {
      view: () => {
        // 实时抓取宿主窗口与其 Tabs，保证 100% 双向联动
        const tabs = Notice.data.dataArr.filter(t => t._winConfig && t._winConfig.id === winId)
        if (tabs.length === 0) {
          // 宿主窗口已全部关闭，遥控面板自愈销毁
          Notice.closeTab(menuSign)
          return null
        }

        const win = tabs[0]._winConfig
        const activeTab = tabs.find(t => t.sign === win.activeSign) || tabs[0]

        const hostAttrs = {
          windowData: win,
          tabs,
          activeTab,
          isMini: false, // 遥控器内部按钮使用标准尺寸
          isActiveWindow: true,
          hideTrafficLight: true, // 遥控面板模式下关闭红绿灯避让
          disableTitleDrag: true, // 遥控器内标题栏不拖动宿主窗口
          onPin: (e) => Notice.pinWindow(winId, e),
          onWebWindowOpen: (e) => Notice.openWebWindow(winId, e),
          onMinimize: (e) => Notice.minimizeWindow(winId, e),
          onMaximize: (e) => Notice.maximizeWindow(winId, e),
          onConfirm: (e) => Notice.confirmWindow(winId, e),
          onCancel: (e) => Notice.cancelWindow(winId, e),
          onCloseTab: (sign, e) => Notice.requestCloseTab(sign, e),
          onSwitchTab: (sign) => {
            win.activeSign = sign
            m.redraw()
          },
          onSetTabOrder: (newSignOrder) => Notice.setTabOrder(winId, newSignOrder),
          onWindowUpdate: (win) => Notice.handleWindowUpdate(win)
        }

        return m(".control-panel-box", {
          style: {
            display: "flex",
            flexDirection: "column",
            minWidth: "16rem"
          }
        }, [
          // 完整复用标准标题栏
          m(WindowHeader, hostAttrs),
          // 多 Tab 时展示标签栏；单 Tab 时自适应隐藏
          tabs.length > 1 ? m(TabBar, hostAttrs) : null
        ])
      }
    }
  })
}
