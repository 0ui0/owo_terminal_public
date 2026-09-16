// 窗口切换器（常驻面板式）
// - Ctrl+Tab：只负责拉起常驻面板（面板已开时横向循环切换高亮）
// - 面板存活期间（内部逻辑）：←/→ 切窗口组，↑/↓ 切当前组内的标签，仅移动高亮
// - 回车 / 鼠标点击 / 面板确认按钮 → 应用当前选择并关闭面板
// - 面板不会自动关闭（没有松手/超时逻辑）
// - 键盘监听：oncreate 注册（注册前先摘掉旧监听）/ onremove 清理，不会重复注册
import Box from "./box.js"
import getColor from "./getColor"
import Notice from "./notice"
import getAppIconUrl from "./getAppIconUrl.js"
import { trs } from "./i18n.js"

// 切换器面板的固定 sign（多次触发只会拉起同一个窗口）
const SWITCHER_SIGN = "owo_window_switcher"

export default {
  data: {
    items: [],      // 窗口组（MRU 排序），每项含 tabs
    index: 0,       // 当前选中的窗口组
    tabIndex: -1,   // 当前选中的标签（-1 = 未进入标签选择，即切窗口自身的激活标签）
    mru: []         // 窗口 winId 的最近使用顺序（越靠前越新）
  },

  // 取切换器面板自身的 Tab
  switcherTab: function () {
    return (Notice.data.dataArr || []).find(i => i.sign === SWITCHER_SIGN)
  },

  // 清空选择状态
  reset: function () {
    this.data.items = []
    this.data.index = 0
    this.data.tabIndex = -1
    m.redraw()
  },

  // 聚合窗口组并按 MRU 排序（窗口口径与任务栏 nav.js 同源）
  buildItems: function () {
    const windows = new Map()

    ;(Notice.data.dataArr || []).forEach(item => {
      const config = item._winConfig
      if (!config || config.isMainWindow) return
      if (item.sign === SWITCHER_SIGN) return // 切换器自身不参与
      if (!windows.has(config)) windows.set(config, [])
      windows.get(config).push(item)
    })

    const list = Array.from(windows.entries()).map(([config, tabs]) => {
      const activeIndex = tabs.findIndex(t => t.sign === config.activeSign)
      const activeTab = tabs[activeIndex] || tabs[0]
      return {
        winId: config.id,
        zIndex: config.zIndex || 0,
        minimized: !!config.minimized,
        isTop: Notice.data.activeWindowId === config.id,
        tabCount: tabs.length,
        activeIndex,
        // 组内标签（顺序＝dataArr 顺序＝标签栏顺序）
        tabs: tabs.map(t => ({
          sign: t.sign,
          tip: t.tip || trs("导航栏/项目/程序"),
          icon: t.icon,
          appType: t.appType || t.group
        })),
        tip: activeTab?.tip || trs("导航栏/项目/程序"),
        icon: activeTab?.icon,
        appType: activeTab?.appType || activeTab?.group,
        configRef: config
      }
    })

    // MRU 首次初始化：用 zIndex 降序近似“最近使用”（zIndex 越大越新）
    if (this.data.mru.length === 0) {
      this.data.mru = [...list].sort((a, b) => b.zIndex - a.zIndex).map(it => it.winId)
    }

    // 已记录过使用时间的按 MRU 排前，其余保持任务栏顺序
    return list.sort((a, b) => {
      const ia = this.data.mru.indexOf(a.winId)
      const ib = this.data.mru.indexOf(b.winId)
      if (ia === -1 && ib === -1) return 0
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  },

  // 横向：切换窗口组（换组会退出标签选择）
  stepWin: function (dir = 1) {
    if (this.data.items.length > 1) {
      this.data.index = ((this.data.index + dir) % this.data.items.length + this.data.items.length) % this.data.items.length
    }
    this.data.tabIndex = -1
    m.redraw()
  },

  // 纵向：在当前组的标签间切换（首次进入时从激活标签出发移动一格）
  stepTab: function (dir = 1) {
    const win = this.data.items[this.data.index]
    if (!win || win.tabs.length <= 1) return

    const len = win.tabs.length
    if (this.data.tabIndex < 0) {
      this.data.tabIndex = (((win.activeIndex >= 0 ? win.activeIndex : 0) + dir) % len + len) % len
    } else {
      this.data.tabIndex = ((this.data.tabIndex + dir) % len + len) % len
    }

    m.redraw()
  },

  // 应用当前选择：指定了标签则先改 activeSign，再激活所在窗口
  applySelection: function () {
    const win = this.data.items[this.data.index]
    if (!win) return

    const tab = (this.data.tabIndex >= 0) ? (win.tabs[this.data.tabIndex] || null) : null

    if (tab) {
      win.configRef.activeSign = tab.sign
    }

    // 刚用过的排最前
    this.data.mru = [win.winId, ...this.data.mru.filter(id => id !== win.winId)]

    if (!(win.isTop && !win.minimized)) {
      Notice.activateWindow(win.winId)
    }

    m.redraw()
  },

  // 确认：应用当前选择并关闭面板（回车 / 鼠标点击 / 面板确认按钮）
  commit: function () {
    this.applySelection()

    const panel = this.switcherTab()
    if (panel) Notice.closeTab(panel)

    this.reset()
  },

  // 快捷键入口（Ctrl+Tab）：未打开则拉起常驻面板，已打开则横向循环高亮
  toggle: function (dir = 1) {
    if (this.switcherTab()) {
      this.stepWin(dir)
      return
    }

    this.data.items = this.buildItems()
    if (this.data.items.length === 0) return // 没有任何可切换的窗口
    this.data.index = this.data.items.length > 1 ? 1 : 0 // VSCode 语义：默认选中最近使用的前一个窗口
    this.data.tabIndex = -1

    Notice.launch({
      sign: SWITCHER_SIGN,
      tip: trs("窗口切换/标题", { cn: "窗口切换", en: "Switch Window" }),
      isPinned: true, // 默认置顶，常驻不被遮挡
      cancel: async () => { this.reset() },
      confirm: async () => { this.commit() },
      content: this
    })

    m.redraw()
  },

  // 关闭面板（仅清状态，Tab 由 Notice 自己关）
  cancel: function () {
    const panel = this.switcherTab()
    if (panel) Notice.closeTab(panel)

    this.reset()
  },

  // 面板存活期间的方向键内部逻辑（仅无修饰键的纯方向键）
  oncreate: function () {
    // 防御：若 oncreate 被重复调用，先摘掉旧监听，避免重复注册
    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler, true)
      this.keyHandler = null
    }

    this.keyHandler = (e) => {
      if (!this.data.items.length) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      switch (e.key) {
        case "ArrowRight":
          this.stepWin(1)
          break
        case "ArrowLeft":
          this.stepWin(-1)
          break
        case "ArrowDown":
          this.stepTab(1)
          break
        case "ArrowUp":
          this.stepTab(-1)
          break
        case "Enter":
          this.commit()
          break
        default:
          return
      }

      e.preventDefault()
      e.stopPropagation()
    }

    // 捕获阶段抢占，避免页面滚动与其它监听干扰
    document.addEventListener("keydown", this.keyHandler, true)
  },

  onremove: function () {
    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler, true)
      this.keyHandler = null
    }
  },

  view: function () {
    if (!this.data.items.length) return null

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          margin: "0.5rem"
        }
      },
      [
        // 第一层：窗口组（横向，一切皆是 Box，颜色靠 Box 的 color 保证 back/front 同色系）
        m("",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              maxWidth: "70vw"
            }
          },
          this.data.items.map((item, i) =>
            m(Box,
              {
                isBtn: true,
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "9rem",
                  margin: "0.5rem",
                  padding: "1rem 1.2rem",
                  borderRadius: "2rem",
                  background: i === this.data.index ? getColor("main").back : getColor("gray_1").back + "80",
                  color: i === this.data.index ? getColor("main").front : getColor("gray_6").front,
                  boxShadow: i === this.data.index ? "0 0 1rem rgba(0,0,0,0.12)" : "none",
                  transform: i === this.data.index ? "translateY(-0.2rem)" : "none",
                  transition: "all 0.15s ease"
                },
                onclick: () => {
                  this.data.index = i
                  this.data.tabIndex = -1
                  this.commit()
                }
              },
              [
                m("img",
                  {
                    src: getAppIconUrl(item.appType, item.icon),
                    onerror: (e) => { e.target.src = "/statics/navbar/program.svg" },
                    style: {
                      width: "4rem",
                      height: "4rem",
                      borderRadius: "1rem",
                      objectFit: "cover",
                      marginBottom: "0.5rem"
                    }
                  }
                ),
                m("span", item.tip),
                item.minimized
                  ? m("span",
                    {
                      style: {
                        fontSize: "1.2rem",
                        opacity: 0.7
                      }
                    },
                    trs("窗口切换/已最小化", { cn: "已最小化", en: "Minimized" })
                  )
                  : null
              ]
            )
          )
        ),

        // 第二层：当前组的标签（竖排，仅多标签时展开）
        this.data.items[this.data.index]?.tabs?.length > 1
          ? m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                maxHeight: "40vh",
                overflowY: "auto"
              }
            },
            this.data.items[this.data.index].tabs.map((tab, ti) =>
              m(Box,
                {
                  isBtn: true,
                  isBlock: true,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    margin: "0.2rem 0.5rem",
                    padding: "0.6rem 1rem",
                    borderRadius: "1.5rem",
                    background: ti === this.data.tabIndex ? getColor("main").back : getColor("gray_1").back + "66",
                    color: ti === this.data.tabIndex ? getColor("main").front : getColor("gray_6").front,
                    transition: "all 0.15s ease"
                  },
                  onclick: () => {
                    this.data.tabIndex = ti
                    this.commit()
                  }
                },
                [
                  m("img",
                    {
                      src: getAppIconUrl(tab.appType, tab.icon),
                      onerror: (e) => { e.target.src = "/statics/navbar/program.svg" },
                      style: {
                        width: "2rem",
                        height: "2rem",
                        borderRadius: "0.5rem",
                        objectFit: "cover",
                        flexShrink: 0,
                        marginRight: "0.5rem"
                      }
                    }
                  ),
                  m("span", tab.tip)
                ]
              )
            )
          )
          : null
      ]
    )
  }
}
