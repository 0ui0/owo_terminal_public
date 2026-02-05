import Box from "./box.js"
import NBox from "./noticeBox.js"

export default {
  data: {
    dataArr: [], // 扁平化的一维数组，存储所有 Tab 实例
    zIndexBase: 1000,
    activeWindowId: null
  },

  // 启动/激活窗口
  launch: function (obj) {
    const _this = this

    // 1. 生成唯一标识
    if (!obj.sign) {
      obj.sign = Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    }

    // 默认显示属性
    obj.show = true

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
    let targetConfig = null

    if (!obj.newWindow && obj.group) {
      const groupMate = this.data.dataArr.find(item => item.group === obj.group)
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
      const newWinId = "win_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5)
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
        zIndex: this.data.zIndexBase + 1, // 初始层级
        activeSign: obj.sign, // 默认激活当前新增的 tab
        isInit: true
      }
      this.data.zIndexBase++
    }

    // 绑定配置
    obj._winConfig = targetConfig

    // 如果是合并到现有窗口，切换激活状态
    targetConfig.activeSign = obj.sign
    this.data.dataArr.push(obj)

    // Trigger initial update
    if (obj.onWindowUpdate) obj.onWindowUpdate(targetConfig)

    this.activateWindow(obj._winConfig.id)
    m.redraw()
  },

  // 激活窗口
  activateWindow: function (winId) {
    // 找到对应配置的对象
    const item = this.data.dataArr.find(i => i._winConfig.id === winId)
    if (item) {
      const config = item._winConfig
      if (config.minimized) {
        config.minimized = false
        this.handleWindowUpdate(config)
      }
      this.data.zIndexBase++
      config.zIndex = this.data.zIndexBase
      this.data.activeWindowId = winId
      m.redraw()
    }
  },

  // 关闭 Tab
  closeTab: function (item) {
    const idx = this.data.dataArr.indexOf(item)
    if (idx !== -1) {
      const config = item._winConfig

      // 如果关闭的是当前激活的 Tab，需要尝试切换到同窗口下的其他 Tab
      if (config.activeSign === item.sign) {
        // 获取该窗口所有 Tab
        const siblings = this.data.dataArr.filter(i => i._winConfig === config)
        const myIndexInGroup = siblings.indexOf(item)

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

  // 最小化窗口
  minimizeWindow: function (winId) {
    const win = this.data.dataArr.find(item => item._winConfig && item._winConfig.id === winId)?._winConfig
    if (win) {
      win.minimized = true
      this.handleWindowUpdate(win)
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

        onActivate: () => this.activateWindow(config.id),
        onCloseWindow: () => {
          this.closeWindow(config.id)
          this.activateTopWindow()
        },
        onCloseTab: (tabItem) => {
          const winId = tabItem._winConfig.id
          this.closeTab(tabItem)
          const stillExists = this.data.dataArr.some(i => i._winConfig.id === winId)
          if (!stillExists) {
            this.activateTopWindow()
          }
        },
        onSwitchTab: (tabItem) => { config.activeSign = tabItem.sign },
        onMinimize: () => this.minimizeWindow(config.id),
        onReorder: (fromSign, toSign) => this.reorderTab(fromSign, toSign),
        onSetTabOrder: (newOrder) => this.setTabOrder(config.id, newOrder),
        onWindowUpdate: (win) => this.handleWindowUpdate(win)
      })
    }))
  }
}
