import Box from "./box.js"
import NBox from "./noticeBox.js"
import settingData from "../setting/settingData.js"

function clampWindow(config) {
  const isAuto = config.width === 0 || config.height === 0
  if (config.x === 0 && config.y === 0 && isAuto) {
    return
  }

  const screenW = window.innerWidth
  const screenH = window.innerHeight
  const winW = config.width || 200
  const winH = config.height || 150

  const minVisibleW = 100
  const minVisibleH = 30

  if (config.x < minVisibleW - winW) {
    config.x = minVisibleW - winW
  } else if (config.x > screenW - minVisibleW) {
    config.x = screenW - minVisibleW
  }

  if (config.y < 0) {
    config.y = 0
  } else if (config.y > screenH - minVisibleH) {
    config.y = screenH - minVisibleH
  }
}

export default {
  data: {
    dataArr: [], // 扁平化的一维数组，存储所有 Tab 实例
    zIndexBase: 1000,
    activeWindowId: null
  },

  // 启动/激活窗口
  launch: function (rawObj = {}) {
    const _this = this

    // 💡 标准 Tab 默认配置表（对齐 aiDocs/Notice说明.md「完整参数字典」+ noticeBox.js 实际读取的全部字段）
    // 约定：undefined 表示“无默认值”，由对应的 UI 分支自行兜底（例如 confirmWords 缺省时渲染对勾图标）
    const defaultTabConfig = {
      // ---- 窗口标识 / 分组 ----
      sign: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
                                  // 唯一标识；缺省随机生成，调用方传入的 sign 优先级最高（同 sign 再次 launch 会直接激活置顶）
      group: undefined,           // 窗口分组名，同组 Tab 自动合并到同一个多标签窗口
      newWindow: false,           // 是否强制在新窗口打开（即使指定了 group）
      // ---- 标题栏 ----
      tip: "提示",                 // 标题文字（多标签时作为 Tab 名）
      icon: undefined,            // 标题图标（优先于 appType）
      appType: undefined,         // App 类型，用于 getAppIconUrl 取图标
      isMini: false,              // 迷你模式：窄窗紧凑排版（标题栏上下两行）
      titleBar: undefined,        // 标题栏中部的自定义菜单栏组件
      headerButtons: [],          // 标题栏自定义按钮数组 [{ icon, color, onclick }]
      // ---- 内容区 ----
      msg: undefined,             // 简易通知文本：未提供 content 时自动用 Box 渲染该文字
      content: undefined,         // 窗口内容区主体 Mithril 组件
      contentAttrs: undefined,    // 透传给 content 组件的初始化属性
      transparentContent: false,  // 内容区是否透明（true 不铺 brown_2 底色）
      // ---- 窗口初始化（几何 / 窗口状态：优先取 win，其次取 x/y/width/height 兼容写法）----
      win: undefined,             // 推荐写法：{ x, y, width, height, isPinned }；不传则自动居中 + 内容自适应
      x: 0,                       // 兼容写法：窗口初始 X（win.x 优先；0 = 自动居中）
      y: 0,                       // 兼容写法：窗口初始 Y（win.y 优先；0 = 自动居中）
      width: 0,                   // 兼容写法：窗口初始宽（win.width 优先；0 = 宽度自适应）
      height: 0,                  // 兼容写法：窗口初始高（win.height 优先；0 = 高度自适应）
      isPinned: false,            // 是否置顶窗口（win.isPinned 优先）
      isWindow: false,            // 是否独立系统窗口（不参与层级自增，也不参与任务栏最小化切换）
      isMain: false,              // 是否为主程序主窗口底座（主底座在任务栏不响应最小化切换）

      useWebWindowOpen: false,    // 是否使用 window.open 打开独立原生辅助窗口
      //useElectronWindowOpen: false, // 是否使用独立 Electron BrowserWindow 打开窗口，尚未实现
      childWin:undefined,         //启动子窗口后存储的子窗口window
      minimized: false,           // 初始化时是否默认最小化
      closeOnClickOutside: false, // 点击窗口外部是否自动关闭本 Tab
      // ---- 三大系统按钮 ----
      hideBtn: 0,                 // 0=确认+取消都显示；1=都隐藏；2=仅取消；3=仅确认
      useMinus: true,             // 是否显示最小化按钮
      useMaximize: false,         // 是否显示最大化按钮
      confirmWords: undefined,    // 确认按钮文案，缺省渲染粉色对勾图标
      cancelWords: undefined,     // 取消按钮文案，缺省渲染灰色叉号图标
      // ---- 事件钩子（默认提供标准基类实现，支持外部覆盖与 super 调用）----
      confirm: async (dom, closeFn, tabData, event) => {
        if (tabData.isMain) {
          settingData.fnCall("sysWinControl", ["close", tabData._winConfig.id])
          return "不是undefined不关窗"
        }
        closeFn()
        return "不是undefined不关窗"
      },
      cancel: async (dom, closeFn, tabData, event) => {
        if (tabData.isMain) {
          settingData.fnCall("sysWinControl", ["close", tabData._winConfig.id])
          return "不是undefined不关窗"
        }
        closeFn()
        return "不是undefined不关窗"
      },
      minimize: async (dom, closeFn, tabData, event) => {
        const win = tabData?._winConfig
        if (win) {
          win.minimized = true
          _this.handleWindowUpdate(win)
        }
        if (tabData.isWindow) {
          settingData.fnCall("sysWinControl", ["minimize", tabData._winConfig.id])
          if (window.opener?.__Notice) {
            const parentItem = window.opener.__Notice.data.dataArr.find(i => i.sign === tabData.sign)
            if (parentItem?._winConfig) {
              parentItem._winConfig.minimized = true
              window.opener.m?.redraw()
            }
          }
        }
        m.redraw()
      },
      maximize: async (dom, closeFn, tabData, event) => {
        if (tabData.isWindow) {
          settingData.fnCall("sysWinControl", ["maximize", tabData._winConfig.id])
        } else {
          const win = tabData?._winConfig
          if (!win) return
          const targetDom = event?.currentTarget || event?.target
          const rect = (targetDom?.closest?.(".window-box") || document.querySelector(`[data-win-id="${win.id}"]`))?.getBoundingClientRect()
          if (rect && (!win.width || !win.height)) Object.assign(win, { width: rect.width, height: rect.height, x: rect.left, y: rect.top })

          if (win.isMaximized) Object.assign(win, win._preMaxState, { isMaximized: false })
          else { win._preMaxState = { x: win.x, y: win.y, width: win.width, height: win.height }; win.isMaximized = true }

          _this.handleWindowUpdate(win)
        }
        m.redraw()
      },
      pin: async (dom, closeFn, tabData, event) => {
        const win = tabData?._winConfig
        if (!win) return
        win.isPinned = !win.isPinned
        _this.handleWindowUpdate(win)
        m.redraw()
      },
      openWebWindow: async (dom, closeFn, tabData, event) => {
        const win = tabData?._winConfig
        if (!win) return

        const isCurrentlyOuter = Boolean(win.childWin && !win.childWin.closed)
        const promptMsg = isCurrentlyOuter
          ? "确定要将此独立窗口还原收回至主界面吗？此操作可能会清除应用内部运行状态。"
          : "确定要将此窗口以独立原生窗口打开吗？此操作可能会清除应用内部运行状态。"

        _this.launch({
          tip: "窗口切换提示",
          msg: promptMsg,
          confirm: async () => {
            if (isCurrentlyOuter) {
              // 💡 还原回虚拟窗口
              const outerWin = win.childWin
              win.childWin = null
              const siblings = _this.data.dataArr.filter(i => i._winConfig === win)
              siblings.forEach(tab => {
                tab.useWebWindowOpen = false
                tab.isWindow = false
              })
              win.isWindow = false
              if (outerWin && !outerWin.closed) {
                outerWin.close()
              }
              _this.activateWindow(win.id)
            } else {
              // 💡 独立窗口打开
              const siblings = _this.data.dataArr.filter(i => i._winConfig === win)
              siblings.forEach(tab => {
                tab.useWebWindowOpen = true
                tab.isWindow = true
              })
              win.isWindow = true

              const winW = Math.ceil(win.width || 800)
              const winH = Math.ceil(win.height || 600)
              const screenBaseX = window.screenX !== undefined ? window.screenX : (window.screenLeft || 0)
              const screenBaseY = window.screenY !== undefined ? window.screenY : (window.screenTop || 0)
              const winX = win.x !== undefined ? Math.ceil(screenBaseX + win.x) : 0
              const winY = win.y !== undefined ? Math.ceil(screenBaseY + win.y) : 0
              const features = `width=${winW},height=${winH},left=${winX},top=${winY}`
              win.childWin = window.open(
                `${location.protocol}//${location.host}/#!/window?winId=${encodeURIComponent(win.id)}`,
                '_blank',
                features
              )
            }
            m.redraw()
          }
        })
      },
      onWindowUpdate: undefined,  // (winConfig) => {}  窗口移动/缩放/最小化状态变化回调
      // ---- 运行时字段（由 launch 内部写入，调用方无需传入）----
      show: true,                 // 是否为显示状态（调用方可覆盖）
      _winConfig: undefined       // 窗口配置对象引用（id/x/y/width/height/minimized/zIndex/activeSign…），launch 内部分配；App 窗口（ioSocket 拉起）会在 launch 之后读它做最小化/还原
    }

    // 💡 用户的配置优先级最高：...rawObj 放在最后，可覆盖全部默认值（含 sign / show）
    // 用 Object.assign 原地写入，保持调用方传入对象引用不变
    const obj = Object.assign(rawObj, { ...defaultTabConfig, ...rawObj })

    if (obj.useWebWindowOpen) {
      obj.isWindow = true
    }



    // 如果只有 msg 没有 content，自动挂载一个简易消息组件
    if (!obj.content && obj.msg) {
      obj.content = {
        view: (vnode) => {
          return m(Box, vnode.attrs.noticeConfig.msg)
        }
      }
      // 不设置固定宽高，让 quitBox 处理居中 (width=0, height=0 triggers auto-center)
      // if (!obj.width) obj.width = 400
      // if (!obj.height) obj.height = 250
    }

    // 2. 检查全局唯一性 (Sign)
    // 如果已存在，直接激活该 Window 并切换到该 Tab
    const existingItem = this.data.dataArr.find(item => item.sign === obj.sign)
    if (existingItem) {
      this.activateWindow(existingItem._winConfig.id)
      existingItem._winConfig.activeSign = existingItem.sign
      m.redraw()
      return
    }

    // 3. 确定窗口配置 (_winConfig)
    // 逻辑：如果 obj.group 存在，寻找现有同组 item，共享其 _winConfig
    // 否则，创建新的 _winConfig
    let targetConfig = obj._winConfig || null

    if (!obj.newWindow && obj.group) {
      const groupMate = this.data.dataArr.find(item => item.group === obj.group && Boolean(item.useWebWindowOpen) === Boolean(obj.useWebWindowOpen))
      if (groupMate) {
        targetConfig = groupMate._winConfig
        // 如果提供了 win 参数，强制更新窗口位置/大小
        if (obj.win) {
          if (obj.win.x !== undefined) targetConfig.x = obj.win.x
          if (obj.win.y !== undefined) targetConfig.y = obj.win.y
          if (obj.win.width !== undefined) targetConfig.width = obj.win.width
          if (obj.win.height !== undefined) targetConfig.height = obj.win.height
        }
      }
    }

    if (!targetConfig) {
      // 创建新窗口配置
      const newWinId = obj.isMain ? "main" : ("win_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5))
      // 优先使用 obj.win 中的配置，其次是 obj 直接属性
      const win = obj.win || {}
      targetConfig = {
        id: newWinId,
        x: win.x !== undefined ? win.x : (obj.x || 0),
        y: win.y !== undefined ? win.y : (obj.y || 0),
        width: win.width !== undefined ? win.width : (obj.width || 0),
        height: win.height !== undefined ? win.height : (obj.height || 0),
        isMaximized: false,
        minimized: obj.minimized || false,
        isPinned: win.isPinned !== undefined ? win.isPinned : (obj.isPinned || false),
        zIndex: (obj.isPinned || win.isPinned ? 900000 : 0) + this.data.zIndexBase + 1, // 初始层级
        activeSign: obj.sign, // 默认激活当前新增的 tab
        isWindow: obj.isWindow || false,
        isMain: obj.isMain || false,
        isInit: true,
        toJSON() {
          const { childWin, ...rest } = this
          return rest
        }
      }
      this.data.zIndexBase++
    }

    // 绑定配置
    obj._winConfig = targetConfig

    // 如果是合并到现有窗口，切换激活状态
    targetConfig.activeSign = obj.sign

    this.data.dataArr.push(obj)

    // 限制在可视区域
    clampWindow(targetConfig)

    // Trigger initial update
    if (obj.onWindowUpdate) obj.onWindowUpdate(targetConfig)


    this.activateWindow(obj._winConfig.id)

    // 绑定全局点击监听器（单例，只绑定一次）：当点击窗口外部时，关闭所有开启了 closeOnClickOutside 开关的 Tab
    if (!this._hasCloseOnClickOutsideListener) {
      this._hasCloseOnClickOutsideListener = true
      document.addEventListener("pointerdown", (e) => {
        const closeItems = this.data.dataArr.filter(item => item.closeOnClickOutside)
        if (closeItems.length > 0) {
          closeItems.forEach(item => {
            const winDom = document.querySelector(`[data-win-id="${item._winConfig?.id}"]`)
            if (winDom && !winDom.contains(e.target)) {
              this.requestCloseTab(item.sign, e)
            }
          })
        }
      })
    }

    // 支持 useWebWindowOpen 模式：在独立窗口中打开
    if (obj.useWebWindowOpen) {

      if (!targetConfig.childWin || targetConfig.childWin.closed) {
        this.openWebWindow(targetConfig.id)
      } else {
        if (!window.opener) {
          targetConfig.childWin.Notice.launch(obj)
          targetConfig.childWin.focus()
        }
      }

    }


    m.redraw()

    return obj
  },

  // 独立原生窗口打开/脱壳
  openWebWindow: async function (winId, e) {
    try {
      const win = this.data.dataArr.find(item => item._winConfig && item._winConfig.id === winId)?._winConfig
      if (!win) return
      const activeTab = this.data.dataArr.find(item => item.sign === win.activeSign)
      if (!activeTab) return

      const closeFn = this.createCloseFn(activeTab.sign)

      await activeTab.openWebWindow(e?.currentTarget || e?.target, closeFn, activeTab, e)
    } catch (err) {
      console.log(err)
      throw err
    }
  },

  // 激活窗口
  activateWindow: function (winId) {
    // 找到对应配置的对象
    const item = this.data.dataArr.find(i => i._winConfig.id === winId)
    if (item) {
      const config = item._winConfig

      // 💡 激活防抖守卫：如果当前窗口已经是激活前台窗口且未最小化，直接跳过，绝不打断内部绘图与高频指针流！
      if (this.data.activeWindowId === winId && !config.minimized) {
        return
      }

      let needsUpdate = false
      if (config.minimized) {
        config.minimized = false
        needsUpdate = true
      }

      const oldX = config.x
      const oldY = config.y
      clampWindow(config)
      if (config.x !== oldX || config.y !== oldY) {
        needsUpdate = true
      }

      if (needsUpdate) {
        this.handleWindowUpdate(config)
      }

      this.data.zIndexBase++
      config.zIndex = (config.isPinned ? 900000 : 0) + this.data.zIndexBase
      this.data.activeWindowId = winId

      m.redraw()


    }
  },

  // 关闭 Tab
  closeTab: function (sign) {
    const idx = this.data.dataArr.findIndex((tab) => tab.sign === sign)
    if (idx !== -1) {
      const targetItem = this.data.dataArr[idx]
      const config = targetItem._winConfig

      // 如果关闭的是当前激活的 Tab，需要尝试切换到同窗口下的其他 Tab
      if (config.activeSign === sign) {
        // 获取该窗口所有 Tab
        const siblings = this.data.dataArr.filter(i => i._winConfig === config)
        const myIndexInGroup = siblings.findIndex((tab) => tab.sign === sign)

        // 尝试找下一个，或者上一个
        let nextActive = null
        if (myIndexInGroup < siblings.length - 1) {
          nextActive = siblings[myIndexInGroup + 1]
        } else if (myIndexInGroup > 0) {
          nextActive = siblings[myIndexInGroup - 1]
        }

        if (nextActive) {
          config.activeSign = nextActive.sign
        }
      }

      // 物理删除
      this.data.dataArr.splice(idx, 1)

      // 关闭窗口
      if (config && !this.data.dataArr.some(i => i._winConfig === config)) {
        // 💡 只有当这个窗口的最后一个 Tab 都被删光、窗口彻底空了时：
        if (config.isWindow) {
          settingData.fnCall("sysWinControl", ["close", config.id])
        }
      }

      // 自动激活下一个顶层窗口
      if (config && !this.data.dataArr.some(i => i._winConfig === config)) {
        this.activateTopWindow()
      } else {
        m.redraw()
      }


    }
  },

  // 提供快速关闭的快捷函数
  createCloseFn(sign) {
    return () => {
      this.closeTab(sign)
    }
  },

  // 请求关闭单个 Tab：先走该 Tab 的 cancel 钩子（App 借此拦截未保存数据提示、通知后端销毁等），
  // 钩子返回 undefined 时才真正关闭；返回其它值表示 App 拦截了本次关闭
  requestCloseTab: async function (sign, e) {
    try {
      const item = this.data.dataArr.find(tab => tab.sign === sign)
      if (!item) return
      const closeFn = this.createCloseFn(sign)

      if ((await item.cancel(e?.target, closeFn, item, e)) === undefined) {
        closeFn()
      }
    } catch (err) {
      console.error("[Notice] 关闭 Tab 出错:", err)
    }
  },

  // 关闭窗口 (关闭该配置关联的所有 Item)
  closeWindow: function (winId) {
    // 逆序遍历删除，防止索引错位
    for (let i = this.data.dataArr.length - 1; i >= 0; i--) {
      if (this.data.dataArr[i]._winConfig.id === winId) {
        this.data.dataArr.splice(i, 1)
      }
    }
    this.activateTopWindow()
    m.redraw()
  },

  // 自动激活最上层的可见窗口
  activateTopWindow: function () {
    const configs = new Set()
    this.data.dataArr.forEach(item => configs.add(item._winConfig))

    let topWin = null
    let maxZ = -1

    configs.forEach(config => {
      if (!config.minimized && config.zIndex > maxZ) {
        maxZ = config.zIndex
        topWin = config
      }
    })

    if (topWin) {
      this.activateWindow(topWin.id)
    } else {
      this.data.activeWindowId = null
      m.redraw()
    }
  },

  // 确认按钮处理
  confirmWindow: async function (winId, e) {
    try {
      const win = this.data.dataArr.find(item => item._winConfig && item._winConfig.id === winId)?._winConfig
      if (!win) return
      const activeTab = this.data.dataArr.find(item => item.sign === win.activeSign)
      if (!activeTab) return

      const closeFn = this.createCloseFn(activeTab.sign)

      if ((await activeTab.confirm(e?.currentTarget || e?.target, closeFn, activeTab, e)) === undefined) {
        closeFn()
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  },

  // 取消/关闭按钮处理
  cancelWindow: async function (winId, e) {
    try {
      const win = this.data.dataArr.find(item => item._winConfig && item._winConfig.id === winId)?._winConfig
      if (!win) return
      const activeTab = this.data.dataArr.find(item => item.sign === win.activeSign)
      if (!activeTab) return

      const closeFn = this.createCloseFn(activeTab.sign)

      if ((await activeTab.cancel(e?.currentTarget || e?.target, closeFn, activeTab, e)) === undefined) {
        closeFn()
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  },

  // 最小化窗口
  minimizeWindow: async function (winId, e) {
    try {
      const win = this.data.dataArr.find(item => item._winConfig && item._winConfig.id === winId)?._winConfig
      if (!win) return
      const activeTab = this.data.dataArr.find(item => item.sign === win.activeSign)
      if (!activeTab) return

      const closeFn = this.createCloseFn(activeTab.sign)

      await activeTab.minimize(e?.currentTarget || e?.target, closeFn, activeTab, e)
    } catch (err) {
      console.log(err)
      throw err
    }
  },

  // 最大化/还原窗口
  maximizeWindow: async function (winId, e) {
    try {
      const win = this.data.dataArr.find(item => item._winConfig && item._winConfig.id === winId)?._winConfig
      if (!win) return
      const activeTab = this.data.dataArr.find(item => item.sign === win.activeSign)
      if (!activeTab) return

      const closeFn = this.createCloseFn(activeTab.sign)
      
      await activeTab.maximize(e?.currentTarget || e?.target, closeFn, activeTab, e)
    } catch (err) {
      console.log(err)
      throw err
    }
  },

  // 置顶/取消置顶窗口
  pinWindow: async function (winId, e) {
    try {
      const win = this.data.dataArr.find(item => item._winConfig && item._winConfig.id === winId)?._winConfig
      if (!win) return
      const activeTab = this.data.dataArr.find(item => item.sign === win.activeSign)
      if (!activeTab) return

      const closeFn = this.createCloseFn(activeTab.sign)

      await activeTab.pin(e?.currentTarget || e?.target, closeFn, activeTab, e)
    } catch (err) {
      console.log(err)
      throw err
    }
  },

  // 切换所有窗口的最小化与还原状态（并同步后端）
  toggleMinimizeAll: function () {
    const configs = new Set()
    this.data.dataArr.forEach(item => {
      if (item._winConfig && !item._winConfig.isWindow) configs.add(item._winConfig)
    })

    if (configs.size === 0) return

    // 检查是否至少有一个窗口当前可见（未最小化）
    const hasVisible = Array.from(configs).some(config => !config.minimized)

    configs.forEach(config => {
      config.minimized = hasVisible
      this.handleWindowUpdate(config)
    })

    if (!hasVisible) {
      this.activateTopWindow()
    } else {
      this.data.activeWindowId = null
      m.redraw()
    }
  },

  // 重新排序 Tab
  reorderTab: function (fromSign, toSign) {
    const fromIndex = this.data.dataArr.findIndex(i => i.sign === fromSign)
    const toIndex = this.data.dataArr.findIndex(i => i.sign === toSign)

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      // 移动元素: 删除 from，插入到 to 的位置
      // 注意：这里是对整个 dataArr 操作，所以会改变全局顺序
      // 但由于 NBox 是 filter(_winConfig) 出来的，且 filter 保持顺序，所以有效
      const [item] = this.data.dataArr.splice(fromIndex, 1)

      // 这里的 toIndex 可能因为 splice 发生了变化，需要重新获取吗？
      // splice(fromIndex, 1) 后，如果 fromIndex < toIndex，那么原来的 toIndex 对应的元素索引减一了
      // 我们重新查找目标元素的当前索引最为稳妥
      const newToIndex = this.data.dataArr.findIndex(i => i.sign === toSign)

      // 插入到目标后面还是前面？
      // 通常逻辑：如果从左往右拖(from < to)，插到 to 后面？ 或者统一插到 to 前面？
      // 简单起见，统一插到 current target index 位置（即挤占该位置，原元素后移）
      this.data.dataArr.splice(newToIndex, 0, item)

      m.redraw()
    }
  },

  // 批量更新 Tab 顺序
  setTabOrder: function (winId, newSignOrder) {
    // 1. 找到该窗口所有 Tabs 并保留引用
    const winTabs = this.data.dataArr.filter(i => i._winConfig.id === winId)
    // 2. 从 dataArr 中移除这些 Tabs
    // 逆序移除防止索引错乱
    for (let i = this.data.dataArr.length - 1; i >= 0; i--) {
      if (this.data.dataArr[i]._winConfig.id === winId) {
        this.data.dataArr.splice(i, 1)
      }
    }

    // 3. 按照 newSignOrder 排序 winTabs
    const sortedWinTabs = []
    newSignOrder.forEach(sign => {
      const t = winTabs.find(tab => tab.sign === sign)
      if (t) sortedWinTabs.push(t)
    })

    // 把没在 order 里的剩下的也加进去（防卫）
    winTabs.forEach(t => {
      if (!newSignOrder.includes(t.sign)) sortedWinTabs.push(t)
    })

    // 4. 将排序后的 Tabs 推回 dataArr
    // (为了简单直接 push，这意味着该窗口的 Tabs 会跑到所有 Tabs 的最后)
    // (如果不希望改变窗口间的层级/顺序，这可能有点问题，但通常 Notice 数据顺序只影响渲染顺序)
    // 更好的做法是记录原来的插入点？这里简单 push 应该够用，只要 zIndex 正确。
    this.data.dataArr.push(...sortedWinTabs)

    m.redraw()
  },

  // 窗口状态更新回调
  handleWindowUpdate: function (config) {
    const tabs = this.data.dataArr.filter(item => item._winConfig === config)
    tabs.forEach(tab => {
      if (tab.onWindowUpdate) {
        tab.onWindowUpdate(config)
      }
    })
  },

  oncreate: function () {
    this.pointerdownHandler = (e) => {
      if (this.data.activeWindowId !== null) {
        if (!e.target.closest(".owo-notice-box") && !e.target.closest(".window-box") && !e.target.closest(".owo-nav-bar")) {
          this.data.activeWindowId = null
          m.redraw()
        }
      }
    }
    document.addEventListener("pointerdown", this.pointerdownHandler)
  },

  onremove: function () {
    if (this.pointerdownHandler) {
      document.removeEventListener("pointerdown", this.pointerdownHandler)
    }
  },

  view: function () {
    // 动态聚合：将扁平的 dataArr 按照 _winConfig 聚合成虚拟窗口进行渲染

    // 1. 提取所有唯一的 _winConfig
    const configs = []
    const configSet = new Set()

    // 按照 dataArr 顺序遍历，但为了层级正确，其实应该按照 config.zIndex 排序渲染
    // 不过 NBox 是 fixed 的，DOM 顺序 + zIndex 决定显示。
    // 我们先收集所有有效的 config
    this.data.dataArr.forEach(item => {
      if (!configSet.has(item._winConfig)) {
        configSet.add(item._winConfig)
        configs.push(item._winConfig)
      }
    })

    return m("", {
      style: {
        position: "fixed",
        top: 0, left: 0, width: 0, height: 0,
        zIndex: 999999
      }
    }, configs.map(config => {
      // 2. 为每个窗口收集属于它的 tabs
      const tabs = this.data.dataArr.filter(item => item._winConfig === config)

      return m(NBox, {
        key: config.id,
        windowData: config,
        tabs: tabs, // 将 tabs 传递给 NBox
        isActiveWindow: config.id === this.data.activeWindowId,

        onActivate: () => this.activateWindow(config.id),
        onCloseWindow: () => {
          this.closeWindow(config.id)
          this.activateTopWindow()
        },
        onCloseTab: (sign, e) => this.requestCloseTab(sign, e),
        onSwitchTab: (sign) => { config.activeSign = sign },
        onConfirm: (e) => this.confirmWindow(config.id, e),
        onCancel: (e) => this.cancelWindow(config.id, e),
        onMinimize: (e) => this.minimizeWindow(config.id, e),
        onMaximize: (e) => this.maximizeWindow(config.id, e),
        onPin: (e) => this.pinWindow(config.id, e),
        onWebWindowOpen: (e) => this.openWebWindow(config.id, e),
        onReorder: (fromSign, toSign) => this.reorderTab(fromSign, toSign),
        onSetTabOrder: (newOrder) => this.setTabOrder(config.id, newOrder),
        onWindowUpdate: (win) => this.handleWindowUpdate(win)



      })
    }))
  }
}
