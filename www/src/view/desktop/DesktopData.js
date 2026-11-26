import settingData from "../setting/settingData.js"
import comData from "../../comData/comData.js"
import { trs } from "../common/i18n.js"

// 可添加到桌面的内置小组件目录（后续可在此扩展更多小组件）
export const WIDGET_CATALOG = [
  {
    widgetType: "clock",
    defaultW: 2,
    defaultH: 2,
    sizes: [
      {
        w: 2,
        h: 2
      },
      {
        w: 4,
        h: 2
      }
    ],
    getName: () => trs("桌面/小组件/时钟名称", {
      cn: "时钟小组件",
      en: "Clock Widget"
    }),
    getDesc: () => trs("桌面/小组件/时钟简介", {
      cn: "实时显示当前时间、日期与星期，支持 2×2 与 4×2 规格",
      en: "Displays live time, date and weekday in 2×2 or 4×2 size"
    })
  }
]

const normalizeTile = (it) => {
  const isWidget = Boolean(it.isWidget)
  const isFolder = Boolean(it.isFolder)
  return {
    id: it.id || `tile_${it.appId || Date.now()}`,
    appId: it.appId || "",
    name: it.name || "App",
    icon: it.icon || "icon.svg",
    desc: it.desc || "",
    // 普通 App 与文件夹统一为 1x1；仅小组件保留多格尺寸
    w: isWidget ? (it.w || 2) : 1,
    h: isWidget ? (it.h || 2) : 1,
    isFolder,
    isWidget,
    widgetType: it.widgetType || "",
    children: isFolder && Array.isArray(it.children)
      ? it.children.map((child) => ({
        id: child.id || `tile_${child.appId || Date.now()}`,
        appId: child.appId || "",
        name: child.name || "App",
        icon: child.icon || "icon.svg",
        desc: child.desc || "",
        w: 1,
        h: 1,
        isFolder: false,
        isWidget: false,
        widgetType: "",
        children: []
      }))
      : []
  }
}

export default {
  apps: [],
  pages: [[]],
  flowDirection: "horizontal",
  currentPage: 0,
  isLoading: true,
  folderOpenId: null,
  editingMode: false,

  // 从 comData 读取并自动迁移至 v3 多页数据结构
  loadLayout() {
    try {
      const data = comData.data?.get ? comData.data.get() : {}
      const saved = data?.desktopLayout

      if (saved && saved.version === 3 && Array.isArray(saved.pages)) {
        this.flowDirection = saved.flowDirection === "vertical" ? "vertical" : "horizontal"
        return saved.pages.map((page) => (
          Array.isArray(page) ? page.map(normalizeTile) : []
        ))
      }

      // 从 v2 一维数组平滑迁移
      if (saved && saved.version === 2 && Array.isArray(saved.items)) {
        this.flowDirection = "horizontal"
        return [saved.items.map(normalizeTile)]
      }

      // 从 v1 坐标数组平滑迁移
      if (Array.isArray(saved) && saved.length > 0) {
        this.flowDirection = "horizontal"
        const sorted = [...saved].sort((a, b) => (a.y - b.y) || (a.x - b.x))
        return [sorted.map(normalizeTile)]
      }
    } catch (err) {
      console.error("[DesktopData] 读取/迁移桌面布局失败:", err)
    }
    return []
  },

  // 保存 v3 布局至 comData
  async saveLayout() {
    try {
      this.cleanupEmptyPages()
      const payload = {
        version: 3,
        flowDirection: this.flowDirection,
        pages: this.pages
      }
      await settingData.fnCall("updateDesktopLayout", [payload])
    } catch (err) {
      console.error("[DesktopData] 保存桌面布局失败:", err)
    }
  },

  // 清理空白页（始终至少保留 1 页）
  cleanupEmptyPages() {
    const nonEmpty = this.pages.filter((page) => Array.isArray(page) && page.length > 0)
    this.pages = nonEmpty.length > 0 ? nonEmpty : [[]]
  },

  // 在所有页中查找指定磁贴所在页索引与项索引
  findTileLocation(tileId) {
    for (let p = 0; p < this.pages.length; p++) {
      const idx = this.pages[p].findIndex((it) => it.id === tileId)
      if (idx !== -1) {
        return {
          pageIdx: p,
          itemIdx: idx,
          tile: this.pages[p][idx]
        }
      }
    }
    return null
  },

  // 移动磁贴到目标逻辑页（支持自动开辟新页）
  moveTileToLogicalPage(tileId, targetLogicalPage, targetIndex = -1) {
    const loc = this.findTileLocation(tileId)
    if (!loc) {
      return false
    }
    while (this.pages.length <= targetLogicalPage) {
      this.pages.push([])
    }
    const [moved] = this.pages[loc.pageIdx].splice(loc.itemIdx, 1)
    const destPage = this.pages[targetLogicalPage]
    if (targetIndex >= 0 && targetIndex <= destPage.length) {
      destPage.splice(targetIndex, 0, moved)
    } else {
      destPage.push(moved)
    }
    return true
  },

  // 切换排列方向（横向 iOS / 竖向 Windows）
  async toggleFlowDirection() {
    try {
      this.flowDirection = this.flowDirection === "horizontal" ? "vertical" : "horizontal"
      await this.saveLayout()
      if (typeof m !== "undefined") {
        m.redraw()
      }
    } catch (err) {
      console.error("[DesktopData] 切换排列方向失败:", err)
    }
  },

  // 添加小组件到当前逻辑页
  async addWidget(widgetType, logicalPageIdx = 0) {
    try {
      const def = WIDGET_CATALOG.find((w) => w.widgetType === widgetType)
      if (!def) {
        return
      }
      const targetPage = Math.max(0, Math.min(logicalPageIdx, this.pages.length - 1))
      const newWidget = {
        id: `widget_${widgetType}_${Date.now()}`,
        appId: "",
        name: def.getName(),
        icon: "",
        desc: def.getDesc(),
        w: def.defaultW,
        h: def.defaultH,
        isFolder: false,
        isWidget: true,
        widgetType: def.widgetType,
        children: []
      }
      this.pages[targetPage].unshift(newWidget)
      await this.saveLayout()
      if (typeof m !== "undefined") {
        m.redraw()
      }
    } catch (err) {
      console.error("[DesktopData] 添加小组件失败:", err)
    }
  },

  // 移除小组件（普通 App 不可删除）
  async removeWidget(tileId) {
    try {
      const loc = this.findTileLocation(tileId)
      if (!loc || !loc.tile.isWidget) {
        return
      }
      this.pages[loc.pageIdx].splice(loc.itemIdx, 1)
      await this.saveLayout()
      if (typeof m !== "undefined") {
        m.redraw()
      }
    } catch (err) {
      console.error("[DesktopData] 移除小组件失败:", err)
    }
  },

  // 切换小组件规格尺寸（仅对小组件生效）
  async toggleWidgetSize(tileId, maxCols) {
    try {
      const loc = this.findTileLocation(tileId)
      if (!loc || !loc.tile.isWidget) {
        return
      }
      const tile = loc.tile
      const def = WIDGET_CATALOG.find((w) => w.widgetType === tile.widgetType)
      if (!def || !Array.isArray(def.sizes) || def.sizes.length < 2) {
        return
      }
      const currentIdx = def.sizes.findIndex((s) => s.w === tile.w && s.h === tile.h)
      const nextSize = def.sizes[(currentIdx + 1) % def.sizes.length]
      tile.w = Math.min(nextSize.w, Math.max(2, maxCols || 4))
      tile.h = nextSize.h
      await this.saveLayout()
      if (typeof m !== "undefined") {
        m.redraw()
      }
    } catch (err) {
      console.error("[DesktopData] 切换小组件尺寸失败:", err)
    }
  },

  // 加载系统 App 列表
  async loadApps() {
    try {
      this.isLoading = true
      const res = await settingData.fnCall("appGetTypes", [])
      this.apps = res?.data || []
      return this.apps
    } catch (err) {
      console.error("[DesktopData] 加载 App 列表失败:", err)
      return []
    } finally {
      this.isLoading = false
      if (typeof m !== "undefined") {
        m.redraw()
      }
    }
  },

  // 一键复位：默认放置 2x2 时钟小组件 + 全量 1x1 应用
  async resetLayout() {
    try {
      if (this.apps.length === 0) {
        await this.loadApps()
      }
      const clockDef = WIDGET_CATALOG[0]
      this.pages = [
        [
          {
            id: "widget_clock",
            appId: "",
            name: clockDef.getName(),
            icon: "",
            desc: clockDef.getDesc(),
            w: 2,
            h: 2,
            isFolder: false,
            isWidget: true,
            widgetType: "clock",
            children: []
          },
          ...this.apps.map((app) => ({
            id: `tile_${app.id}`,
            appId: app.id,
            name: app.name,
            icon: app.icon,
            desc: app.description || "",
            w: 1,
            h: 1,
            isFolder: false,
            isWidget: false,
            widgetType: "",
            children: []
          }))
        ]
      ]
      this.currentPage = 0
      this.folderOpenId = null
      this.editingMode = false
      await this.saveLayout()
      if (typeof m !== "undefined") {
        m.redraw()
      }
    } catch (err) {
      console.error("[DesktopData] 复位桌面布局失败:", err)
    }
  }
}
