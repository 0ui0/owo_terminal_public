import m from "/@npm/mithril.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import IconTag from "../common/iconTag.js"
import Notice from "../common/notice.js"
import Box from "../common/box.js"
import sysMenu from "../common/sysMenu.js"
import commonData from "../common/commonData.js"
import settingData from "../setting/settingData.js"
import getAppIconUrl from "../common/getAppIconUrl.js"
import { trs } from "../common/i18n.js"
import desktopData, { WIDGET_CATALOG } from "./DesktopData.js"
import DesktopIcon from "./DesktopIcon.js"
import { computeDesktopLayout, findTileAtCell, reorderPageItems } from "./GridEngine.js"

export default () => {
  let deskDom = null
  let swiperDom = null
  let searchInputDom = null
  let resizeObserver = null
  const pageGridDoms = new Map()

  let searchQuery = ""
  let containerW = window.innerWidth
  let containerH = window.innerHeight
  let cols = 8
  let rows = 4
  let unitSize = 96

  // 指针交互状态机
  let activePointerId = null
  let pointerMode = "idle" // "idle" | "pending_tile" | "dragging_tile" | "swiping_page" | "pending_blank"
  let draggingTile = null
  let dragOffset = {
    x: 0,
    y: 0
  }
  let pointerPixel = {
    x: 0,
    y: 0
  }
  let startPixel = {
    x: 0,
    y: 0
  }
  let swipeDeltaX = 0
  let longPressTimer = null
  let shadowSlot = null
  let hoverFolderTarget = null
  let lastSwapKey = ""
  let edgeFlipTimer = null
  let edgeFlipDir = 0
  let rafPending = false

  // 自适应容器网格维度计算（基于实际内容区宽高，精确算满可用行列）
  const calcGridDimensions = (w, h) => {
    const safeW = Math.max(240, w || window.innerWidth)
    const safeH = Math.max(200, h || window.innerHeight)

    const usableW = Math.max(200, safeW - 32)
    const targetCell = safeW < 520 ? 84 : 96
    cols = Math.max(2, Math.min(12, Math.floor(usableW / targetCell)))
    unitSize = Math.max(68, Math.min(Math.floor(usableW / cols), 100))

    const usableH = Math.max(unitSize * 2, safeH - 12)
    rows = Math.max(2, Math.floor(usableH / unitSize))
  }

  const syncContainerSize = () => {
    const targetDom = swiperDom || deskDom
    if (!targetDom) {
      return
    }
    const rect = targetDom.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    const prevCols = cols
    const prevRows = rows
    const prevUnit = unitSize
    containerW = rect.width
    containerH = rect.height
    calcGridDimensions(containerW, containerH)
    if (cols !== prevCols || rows !== prevRows || unitSize !== prevUnit) {
      m.redraw()
    }
  }

  // 初始化桌面数据（同步系统 App 列表，全量铺满不删 App）
  const initDesktop = async () => {
    try {
      await desktopData.loadApps()
      const savedPages = desktopData.loadLayout()

      if (!Array.isArray(savedPages) || savedPages.length === 0) {
        await desktopData.resetLayout()
        return
      }

      const existingAppIds = new Set()
      const validPages = []

      for (const page of savedPages) {
        const nextPage = []
        for (const it of page) {
          if (it.isWidget) {
            nextPage.push(it)
          } else if (it.isFolder) {
            const validChildren = []
            for (const child of (it.children || [])) {
              const appMeta = desktopData.apps.find((a) => a.id === child.appId)
              if (appMeta) {
                existingAppIds.add(appMeta.id)
                validChildren.push({
                  ...child,
                  name: appMeta.name,
                  icon: appMeta.icon,
                  desc: appMeta.description || child.desc || "",
                  w: 1,
                  h: 1
                })
              }
            }
            if (validChildren.length > 1) {
              nextPage.push({
                ...it,
                w: 1,
                h: 1,
                children: validChildren
              })
            } else if (validChildren.length === 1) {
              nextPage.push(validChildren[0])
            }
          } else {
            const appMeta = desktopData.apps.find((a) => a.id === it.appId)
            if (appMeta) {
              existingAppIds.add(appMeta.id)
              nextPage.push({
                ...it,
                name: appMeta.name,
                icon: appMeta.icon,
                desc: appMeta.description || it.desc || "",
                w: 1,
                h: 1
              })
            }
          }
        }
        if (nextPage.length > 0) {
          validPages.push(nextPage)
        }
      }

      if (validPages.length === 0) {
        validPages.push([])
      }

      // 将新增未入桌面的系统 App 补齐到最后一页
      const lastPage = validPages[validPages.length - 1]
      for (const app of desktopData.apps) {
        if (!existingAppIds.has(app.id)) {
          lastPage.push({
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
          })
        }
      }

      desktopData.pages = validPages
      desktopData.cleanupEmptyPages()
      m.redraw()
    } catch (err) {
      console.error("[Desktop] 初始化桌面失败:", err)
    }
  }

  // 合体文件夹（仅允许 1x1 普通 App 拖到另一个 1x1 普通 App 或文件夹上）
  const mergeIntoFolder = async (dragId, targetId) => {
    try {
      const dragLoc = desktopData.findTileLocation(dragId)
      const targetLoc = desktopData.findTileLocation(targetId)
      if (!dragLoc || !targetLoc) {
        return
      }
      if (dragLoc.tile.isFolder || dragLoc.tile.isWidget || targetLoc.tile.isWidget) {
        return
      }

      const [dragTile] = desktopData.pages[dragLoc.pageIdx].splice(dragLoc.itemIdx, 1)
      const refreshedTarget = desktopData.findTileLocation(targetId)
      if (!refreshedTarget) {
        desktopData.pages[dragLoc.pageIdx].push(dragTile)
        return
      }

      if (refreshedTarget.tile.isFolder) {
        refreshedTarget.tile.children.push(dragTile)
      } else {
        const newFolder = {
          id: `folder_${Date.now()}`,
          appId: "",
          name: trs("桌面/文件夹/新建名称", {
            cn: "新建文件夹",
            en: "New Folder"
          }),
          icon: "",
          desc: "",
          w: 1,
          h: 1,
          isFolder: true,
          isWidget: false,
          widgetType: "",
          children: [refreshedTarget.tile, dragTile]
        }
        desktopData.pages[refreshedTarget.pageIdx].splice(refreshedTarget.itemIdx, 1, newFolder)
      }

      if (navigator.vibrate) {
        navigator.vibrate(25)
      }
      await desktopData.saveLayout()
      m.redraw()
    } catch (err) {
      console.error("[Desktop] 合成文件夹失败:", err)
    }
  }

  // 解散文件夹（所有子 App 放回文件夹原位，不删除任何 App）
  const unpackFolder = async (folderId) => {
    try {
      const loc = desktopData.findTileLocation(folderId)
      if (!loc || !loc.tile.isFolder) {
        return
      }
      const children = Array.isArray(loc.tile.children) ? loc.tile.children : []
      desktopData.pages[loc.pageIdx].splice(loc.itemIdx, 1, ...children)
      if (desktopData.folderOpenId === folderId) {
        desktopData.folderOpenId = null
      }
      await desktopData.saveLayout()
      m.redraw()
    } catch (err) {
      console.error("[Desktop] 解散文件夹失败:", err)
    }
  }

  // 从文件夹移出单个 App（剩余 ≤1 个时自动解散文件夹并关闭弹窗）
  const removeChildFromFolder = async (folderId, childIdx) => {
    try {
      const loc = desktopData.findTileLocation(folderId)
      if (!loc || !loc.tile.isFolder) {
        return
      }
      const folder = loc.tile
      const [removed] = folder.children.splice(childIdx, 1)
      if (!removed) {
        return
      }
      desktopData.pages[loc.pageIdx].splice(loc.itemIdx + 1, 0, removed)

      if (folder.children.length === 0) {
        desktopData.pages[loc.pageIdx].splice(loc.itemIdx, 1)
        desktopData.folderOpenId = null
      } else if (folder.children.length === 1) {
        const [lastChild] = folder.children.splice(0, 1)
        desktopData.pages[loc.pageIdx].splice(loc.itemIdx, 1, lastChild)
        desktopData.folderOpenId = null
      }

      await desktopData.saveLayout()
      m.redraw()
    } catch (err) {
      console.error("[Desktop] 移出文件夹子项失败:", err)
    }
  }

  // 打开“添加小组件”面板（遵循 Notice说明.md：自适应居中，不写死宽高）
  const openWidgetGallery = (currentLogicalPage) => {
    Notice.launch({
      sign: "desktop_widget_gallery",
      tip: trs("桌面/小组件/面板标题", {
        cn: "添加小组件",
        en: "Add Widget"
      }),
      hideBtn: 2,
      useMinus: false,
      content: {
        view: (v) => m(
          "",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: `${getSize(3)}rem`,
              padding: `${getSize(2)}rem`,
              minWidth: `${getSize(64)}rem`
            }
          },
          WIDGET_CATALOG.map((widget) => m(
            Box,
            {
              key: widget.widgetType,
              color: "gray_4",
              style: {
                margin: "0",
                padding: `${getSize(4)}rem`,
                borderRadius: `${getSize(4)}rem`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: `${getSize(4)}rem`
              }
            },
            [
              m(
                "",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: `${getSize(1)}rem`
                  }
                },
                [
                  m(
                    "span",
                    {
                      style: {
                        fontSize: `${getSize(4)}rem`,
                        lineHeight: `${getSize(5)}rem`,
                        color: getColor("gray_4").front
                      }
                    },
                    widget.getName()
                  ),
                  m(
                    "span",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        opacity: 0.7,
                        color: getColor("gray_4").front
                      }
                    },
                    widget.getDesc()
                  )
                ]
              ),
              m(
                IconTag,
                {
                  iconName: "Plus",
                  bgColor: getColor("main").back,
                  fgColor: getColor("main").front,
                  ext: {
                    onclick: async () => {
                      await desktopData.addWidget(widget.widgetType, currentLogicalPage)
                      if (v.attrs.noticeConfig) {
                        Notice.closeTab(v.attrs.noticeConfig)
                      }
                    }
                  }
                },
                trs("桌面/操作/添加", {
                  cn: "添加",
                  en: "Add"
                })
              )
            ]
          ))
        )
      }
    })
  }

  // 右键上下文菜单（使用 Notice + sysMenu，彻底避免右键直接静默解散文件夹）
  const openContextMenu = (e, tile, currentLogicalPage) => {
    e.preventDefault()
    e.stopPropagation()

    const x = e.clientX
    const y = e.clientY
    const menuItems = []

    if (!tile) {
      menuItems.push(
        {
          name: desktopData.flowDirection === "horizontal"
            ? trs("桌面/菜单/切竖向排列", {
              cn: "切换为竖向排列（Windows 风格）",
              en: "Switch to Vertical Flow (Windows Style)"
            })
            : trs("桌面/菜单/切横向排列", {
              cn: "切换为横向排列（iOS 风格）",
              en: "Switch to Horizontal Flow (iOS Style)"
            }),
          onclick: async (close) => {
            close()
            await desktopData.toggleFlowDirection()
          }
        },
        {
          name: trs("桌面/菜单/添加小组件", {
            cn: "添加小组件",
            en: "Add Widget"
          }),
          onclick: (close) => {
            close()
            openWidgetGallery(currentLogicalPage)
          }
        },
        {
          name: desktopData.editingMode
            ? trs("桌面/操作/完成", {
              cn: "完成编辑",
              en: "Done Editing"
            })
            : trs("桌面/操作/编辑桌面", {
              cn: "编辑桌面",
              en: "Edit Desktop"
            }),
          onclick: async (close) => {
            close()
            desktopData.editingMode = !desktopData.editingMode
            if (!desktopData.editingMode) {
              await desktopData.saveLayout()
            }
            m.redraw()
          }
        },
        "sep",
        {
          name: trs("桌面/操作/复位布局", {
            cn: "复位默认布局",
            en: "Reset Layout"
          }),
          onclick: (close) => {
            close()
            Notice.launch({
              tip: trs("桌面/弹窗/复位标题", {
                cn: "复位桌面布局",
                en: "Reset Desktop Layout"
              }),
              msg: trs("桌面/弹窗/复位内容", {
                cn: "是否恢复为默认排列（时钟小组件 + 全量应用整齐排布）？",
                en: "Restore default layout (Clock widget + all apps)?"
              }),
              confirm: async () => {
                await desktopData.resetLayout()
              }
            })
          }
        }
      )
    } else if (tile.isWidget) {
      menuItems.push(
        {
          name: trs("桌面/操作/切换小组件尺寸", {
            cn: "切换小组件尺寸",
            en: "Toggle Widget Size"
          }),
          onclick: async (close) => {
            close()
            await desktopData.toggleWidgetSize(tile.id, cols)
          }
        },
        {
          name: trs("桌面/操作/移至下一页", {
            cn: "移至下一页",
            en: "Move to Next Page"
          }),
          onclick: async (close) => {
            close()
            const loc = desktopData.findTileLocation(tile.id)
            if (loc) {
              desktopData.moveTileToLogicalPage(tile.id, loc.pageIdx + 1)
              await desktopData.saveLayout()
              m.redraw()
            }
          }
        },
        "sep",
        {
          name: trs("桌面/操作/移除小组件", {
            cn: "移除小组件",
            en: "Remove Widget"
          }),
          onclick: async (close) => {
            close()
            await desktopData.removeWidget(tile.id)
          }
        }
      )
    } else if (tile.isFolder) {
      menuItems.push(
        {
          name: trs("桌面/操作/打开文件夹", {
            cn: "打开文件夹",
            en: "Open Folder"
          }),
          onclick: (close) => {
            close()
            desktopData.folderOpenId = tile.id
            m.redraw()
          }
        },
        {
          name: trs("桌面/操作/移至下一页", {
            cn: "移至下一页",
            en: "Move to Next Page"
          }),
          onclick: async (close) => {
            close()
            const loc = desktopData.findTileLocation(tile.id)
            if (loc) {
              desktopData.moveTileToLogicalPage(tile.id, loc.pageIdx + 1)
              await desktopData.saveLayout()
              m.redraw()
            }
          }
        },
        "sep",
        {
          name: trs("桌面/操作/解散文件夹", {
            cn: "解散文件夹",
            en: "Unpack Folder"
          }),
          onclick: async (close) => {
            close()
            await unpackFolder(tile.id)
          }
        }
      )
    } else {
      menuItems.push(
        {
          name: trs("桌面/操作/打开应用", {
            cn: "打开应用",
            en: "Open App"
          }),
          onclick: (close) => {
            close()
            if (tile.appId) {
              settingData.fnCall("appLaunch", [tile.appId])
            }
          }
        },
        {
          name: trs("桌面/操作/移至下一页", {
            cn: "移至下一页",
            en: "Move to Next Page"
          }),
          onclick: async (close) => {
            close()
            const loc = desktopData.findTileLocation(tile.id)
            if (loc) {
              desktopData.moveTileToLogicalPage(tile.id, loc.pageIdx + 1)
              await desktopData.saveLayout()
              m.redraw()
            }
          }
        }
      )
      const loc = desktopData.findTileLocation(tile.id)
      if (loc && loc.pageIdx > 0) {
        menuItems.push({
          name: trs("桌面/操作/移至上一页", {
            cn: "移至上一页",
            en: "Move to Previous Page"
          }),
          onclick: async (close) => {
            close()
            desktopData.moveTileToLogicalPage(tile.id, loc.pageIdx - 1)
            await desktopData.saveLayout()
            m.redraw()
          }
        })
      }
      menuItems.push(
        "sep",
        {
          name: desktopData.editingMode
            ? trs("桌面/操作/完成", {
              cn: "完成编辑",
              en: "Done Editing"
            })
            : trs("桌面/操作/编辑桌面", {
              cn: "编辑桌面",
              en: "Edit Desktop"
            }),
          onclick: async (close) => {
            close()
            desktopData.editingMode = !desktopData.editingMode
            if (!desktopData.editingMode) {
              await desktopData.saveLayout()
            }
            m.redraw()
          }
        }
      )
    }

    Notice.launch({
      sign: "desktop_context_menu",
      win: {
        x,
        y
      },
      hideBtn: 2,
      useMinus: false,
      tip: tile
        ? (tile.name || trs("桌面/菜单/快捷操作", {
          cn: "快捷操作",
          en: "Actions"
        }))
        : trs("桌面/菜单/桌面选项", {
          cn: "桌面选项",
          en: "Desktop Options"
        }),
      content: {
        view: (v) => m(
          sysMenu,
          {
            menuItems: menuItems.map((item) => {
              if (item === "sep") {
                return "sep"
              }
              return {
                ...item,
                onclick: () => item.onclick(() => {
                  if (v.attrs.delete) {
                    v.attrs.delete()
                  }
                })
              }
            })
          }
        )
      }
    })
  }

  const clearTimers = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
    if (edgeFlipTimer) {
      clearTimeout(edgeFlipTimer)
      edgeFlipTimer = null
    }
    edgeFlipDir = 0
  }

  const getSearchResults = (query) => {
    const q = (query || "").trim().toLowerCase()
    if (!q) {
      return []
    }
    const results = []
    const seen = new Set()
    const matchTile = (tile, folderName = "") => {
      if (!tile || tile.isWidget || tile.isFolder || !tile.appId) {
        return
      }
      if (seen.has(tile.appId)) {
        return
      }
      const haystack = `${tile.name || ""} ${tile.appId || ""} ${tile.desc || ""}`.toLowerCase()
      if (haystack.includes(q)) {
        seen.add(tile.appId)
        results.push({
          ...tile,
          folderName
        })
      }
    }
    for (const page of desktopData.pages) {
      if (!Array.isArray(page)) {
        continue
      }
      for (const it of page) {
        if (it.isFolder && Array.isArray(it.children)) {
          for (const child of it.children) {
            matchTile(child, it.name || "")
          }
        } else {
          matchTile(it)
        }
      }
    }
    return results
  }

  const handleKeyDown = async (e) => {
    try {
      if (e.key === "Escape") {
        if (searchQuery) {
          searchQuery = ""
          m.redraw()
        } else if (desktopData.folderOpenId) {
          desktopData.folderOpenId = null
          m.redraw()
        } else if (desktopData.editingMode) {
          desktopData.editingMode = false
          await desktopData.saveLayout()
          m.redraw()
        }
      }
    } catch (err) {
      console.error("[Desktop] 键盘事件处理失败:", err)
    }
  }

  return {
    oninit() {
      initDesktop()
    },

    oncreate({ dom }) {
      deskDom = dom
      syncContainerSize()
      requestAnimationFrame(() => {
        syncContainerSize()
        if (searchInputDom) {
          searchInputDom.focus()
        }
      })

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(syncContainerSize)
        resizeObserver.observe(deskDom)
        if (swiperDom) {
          resizeObserver.observe(swiperDom)
        }
      }
      window.addEventListener("resize", syncContainerSize)
      window.addEventListener("keydown", handleKeyDown)
    },

    onremove() {
      clearTimers()
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      swiperDom = null
      searchInputDom = null
      searchQuery = ""
      window.removeEventListener("resize", syncContainerSize)
      window.removeEventListener("keydown", handleKeyDown)
      pageGridDoms.clear()
    },

    view() {
      const isEditing = desktopData.editingMode
      const trimmedQuery = searchQuery.trim()
      const searchResults = trimmedQuery ? getSearchResults(trimmedQuery) : []
      const themeColorId = commonData.themeColor || 0
      const wallpaperUrl = themeColorId === 1
        ? "/statics/desktop_wallpaper_warm.svg"
        : (themeColorId === 2 ? "/statics/desktop_wallpaper_blue.svg" : "/statics/desktop_wallpaper.svg")
      const isVertical = desktopData.flowDirection === "vertical"
      const gridTotalWidth = cols * unitSize
      const gridTotalHeight = rows * unitSize

      const { layout, visualPages, totalPages } = computeDesktopLayout(
        desktopData.pages,
        cols,
        rows,
        desktopData.flowDirection
      )

      if (desktopData.currentPage >= totalPages) {
        desktopData.currentPage = Math.max(0, totalPages - 1)
      }

      const currentVisualInfo = visualPages[desktopData.currentPage] || {
        visualPage: 0,
        logicalPage: 0,
        isOverflow: false
      }

      let activeFolder = null
      if (desktopData.folderOpenId) {
        const folderLoc = desktopData.findTileLocation(desktopData.folderOpenId)
        activeFolder = folderLoc ? folderLoc.tile : null
      }

      // 拖拽悬停左右边缘自动翻页（拖到最右侧可自动新建逻辑页）
      const scheduleEdgeFlip = () => {
        if (edgeFlipTimer) {
          clearTimeout(edgeFlipTimer)
        }
        edgeFlipTimer = setTimeout(() => {
          if (pointerMode !== "dragging_tile" || !draggingTile) {
            return
          }
          if (edgeFlipDir === 1) {
            if (desktopData.currentPage < totalPages - 1) {
              desktopData.currentPage++
              if (navigator.vibrate) {
                navigator.vibrate(15)
              }
              m.redraw()
              scheduleEdgeFlip()
            } else {
              // 在最后一页右侧持续悬停：若当前逻辑页不止拖拽者自身，则自动开辟新页
              const loc = desktopData.findTileLocation(draggingTile.id)
              const curLogicalList = desktopData.pages[currentVisualInfo.logicalPage] || []
              if (loc && curLogicalList.length > 1) {
                const newLogicalIdx = desktopData.pages.length
                desktopData.moveTileToLogicalPage(draggingTile.id, newLogicalIdx)
                desktopData.currentPage = totalPages
                if (navigator.vibrate) {
                  navigator.vibrate(20)
                }
                m.redraw()
              }
            }
          } else if (edgeFlipDir === -1 && desktopData.currentPage > 0) {
            desktopData.currentPage--
            if (navigator.vibrate) {
              navigator.vibrate(15)
            }
            m.redraw()
            scheduleEdgeFlip()
          }
        }, 450)
      }

      const checkEdgeFlip = (clientX) => {
        const rect = deskDom ? deskDom.getBoundingClientRect() : {
          left: 0,
          right: window.innerWidth
        }
        const edgeThreshold = 56
        if (clientX > rect.right - edgeThreshold) {
          if (edgeFlipDir !== 1) {
            edgeFlipDir = 1
            scheduleEdgeFlip()
          }
        } else if (clientX < rect.left + edgeThreshold) {
          if (edgeFlipDir !== -1) {
            edgeFlipDir = -1
            scheduleEdgeFlip()
          }
        } else {
          edgeFlipDir = 0
          if (edgeFlipTimer) {
            clearTimeout(edgeFlipTimer)
            edgeFlipTimer = null
          }
        }
      }

      const handleTilePointerDown = (e, tile) => {
        if (e.button === 2) {
          return
        }
        e.stopPropagation()
        clearTimers()

        activePointerId = e.pointerId
        draggingTile = tile
        pointerMode = "pending_tile"
        swipeDeltaX = 0
        lastSwapKey = ""
        startPixel = {
          x: e.clientX,
          y: e.clientY
        }
        pointerPixel = {
          x: e.clientX,
          y: e.clientY
        }

        const rect = e.currentTarget.getBoundingClientRect()
        dragOffset = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        }

        if (deskDom && deskDom.setPointerCapture) {
          try {
            deskDom.setPointerCapture(e.pointerId)
          } catch (err) {}
        }

        // 非编辑态：长按 450ms 进入抖动编辑态并立即抓起
        if (!desktopData.editingMode) {
          longPressTimer = setTimeout(() => {
            if (pointerMode === "pending_tile" && draggingTile) {
              desktopData.editingMode = true
              pointerMode = "dragging_tile"
              if (navigator.vibrate) {
                navigator.vibrate(25)
              }
              m.redraw()
            }
          }, 450)
        }
      }

      const handleViewportPointerDown = (e) => {
        if (e.button === 2) {
          return
        }
        clearTimers()
        activePointerId = e.pointerId
        draggingTile = null
        pointerMode = "pending_blank"
        swipeDeltaX = 0
        startPixel = {
          x: e.clientX,
          y: e.clientY
        }
        pointerPixel = {
          x: e.clientX,
          y: e.clientY
        }

        if (deskDom && deskDom.setPointerCapture) {
          try {
            deskDom.setPointerCapture(e.pointerId)
          } catch (err) {}
        }
      }

      const handleGlobalPointerMove = (e) => {
        if (e.pointerId !== activePointerId || pointerMode === "idle") {
          return
        }

        pointerPixel = {
          x: e.clientX,
          y: e.clientY
        }
        const dx = e.clientX - startPixel.x
        const dy = e.clientY - startPixel.y
        const dist = Math.hypot(dx, dy)

        // 1. 空白区或非编辑态图标上横向滑动 -> 流畅跟手翻页
        if (pointerMode === "pending_blank") {
          if (Math.abs(dx) > 10) {
            pointerMode = "swiping_page"
          } else {
            return
          }
        }

        if (pointerMode === "pending_tile") {
          if (desktopData.editingMode) {
            // 编辑态下轻移 > 6px 即刻抓起拖拽
            if (dist > 6) {
              pointerMode = "dragging_tile"
              if (navigator.vibrate) {
                navigator.vibrate(15)
              }
            } else {
              return
            }
          } else {
            // 非编辑态：横向滑动 > 12px 优先视为桌面滑动翻页（避免误触编辑态）
            if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
              clearTimers()
              draggingTile = null
              pointerMode = "swiping_page"
            } else if (dist > 10) {
              // 纵向大幅移动取消长按计时
              clearTimers()
              return
            } else {
              return
            }
          }
        }

        if (pointerMode === "swiping_page") {
          // 边界阻尼
          const atLeftEdge = desktopData.currentPage === 0 && dx > 0
          const atRightEdge = desktopData.currentPage >= totalPages - 1 && dx < 0
          swipeDeltaX = (atLeftEdge || atRightEdge) ? dx * 0.3 : dx
          m.redraw()
          return
        }

        if (pointerMode !== "dragging_tile" || !draggingTile) {
          return
        }

        checkEdgeFlip(e.clientX)

        if (!rafPending) {
          rafPending = true
          requestAnimationFrame(() => {
            rafPending = false
            if (pointerMode !== "dragging_tile" || !draggingTile) {
              return
            }

            const gridDom = pageGridDoms.get(desktopData.currentPage)
            if (!gridDom) {
              return
            }
            const gridRect = gridDom.getBoundingClientRect()
            const tileW = draggingTile.isWidget ? (draggingTile.w || 2) : 1
            const tileH = draggingTile.isWidget ? (draggingTile.h || 2) : 1
            const dragW = tileW * unitSize - 14
            const dragH = tileH * unitSize - 14
            const dragL = (pointerPixel.x - dragOffset.x) - gridRect.left
            const dragT = (pointerPixel.y - dragOffset.y) - gridRect.top

            const currentPagedTiles = layout.filter(
              (t) => t.page === desktopData.currentPage && t.id !== draggingTile.id
            )

            // 1. 面积交集 >= 45% 判定文件夹合体（仅 1x1 普通 App 可合体）
            const canMerge = !draggingTile.isFolder && !draggingTile.isWidget
            let mergeCandidate = null

            if (canMerge) {
              for (const t of currentPagedTiles) {
                if (t.isWidget) {
                  continue
                }
                const tL = t.col * unitSize
                const tT = t.row * unitSize
                const tW = t.w * unitSize - 14
                const tH = t.h * unitSize - 14

                const interL = Math.max(dragL, tL)
                const interT = Math.max(dragT, tT)
                const interR = Math.min(dragL + dragW, tL + tW)
                const interB = Math.min(dragT + dragH, tT + tH)

                if (interR > interL && interB > interT) {
                  const interArea = (interR - interL) * (interB - interT)
                  const targetArea = Math.max(1, tW * tH)
                  if (interArea / targetArea >= 0.45) {
                    mergeCandidate = t
                    break
                  }
                }
              }
            }

            if (mergeCandidate) {
              hoverFolderTarget = mergeCandidate.id
              shadowSlot = null
              lastSwapKey = ""
              m.redraw()
              return
            }

            hoverFolderTarget = null
            const centerCol = Math.max(
              0,
              Math.min(Math.floor((dragL + dragW / 2) / unitSize), cols - tileW)
            )
            const centerRow = Math.max(
              0,
              Math.min(Math.floor((dragT + dragH / 2) / unitSize), rows - tileH)
            )

            shadowSlot = {
              page: desktopData.currentPage,
              col: centerCol,
              row: centerRow,
              w: tileW,
              h: tileH
            }

            // 2. 完整矩形覆盖命中检测 + 跨页归属同步
            const hitTile = findTileAtCell(currentPagedTiles, centerCol, centerRow)
            const targetLogicalPage = currentVisualInfo.logicalPage
            const dragLoc = desktopData.findTileLocation(draggingTile.id)

            if (dragLoc) {
              if (hitTile) {
                const swapKey = `${targetLogicalPage}_${centerCol}_${centerRow}_${hitTile.id}`
                if (swapKey !== lastSwapKey) {
                  lastSwapKey = swapKey
                  const hitLoc = desktopData.findTileLocation(hitTile.id)
                  if (hitLoc) {
                    if (dragLoc.pageIdx === hitLoc.pageIdx) {
                      desktopData.pages[hitLoc.pageIdx] = reorderPageItems(
                        desktopData.pages[hitLoc.pageIdx],
                        draggingTile.id,
                        hitLoc.itemIdx
                      )
                    } else {
                      desktopData.moveTileToLogicalPage(
                        draggingTile.id,
                        hitLoc.pageIdx,
                        hitLoc.itemIdx
                      )
                    }
                  }
                }
              } else if (dragLoc.pageIdx !== targetLogicalPage) {
                // 跨页拖入空白格：直接归属到目标逻辑页末尾，松手不弹回！
                const swapKey = `${targetLogicalPage}_empty`
                if (swapKey !== lastSwapKey) {
                  lastSwapKey = swapKey
                  desktopData.moveTileToLogicalPage(draggingTile.id, targetLogicalPage)
                }
              }
            }

            m.redraw()
          })
        }
      }

      const handleGlobalPointerUp = async (e) => {
        if (e.pointerId !== activePointerId || pointerMode === "idle") {
          return
        }

        try {
          if (deskDom && deskDom.releasePointerCapture) {
            try {
              deskDom.releasePointerCapture(activePointerId)
            } catch (err) {}
          }
          clearTimers()

          const modeAtRelease = pointerMode
          const tileAtRelease = draggingTile
          const mergeTargetAtRelease = hoverFolderTarget
          const finalSwipeX = swipeDeltaX

          pointerMode = "idle"
          activePointerId = null
          draggingTile = null
          shadowSlot = null
          hoverFolderTarget = null
          lastSwapKey = ""
          swipeDeltaX = 0

          if (modeAtRelease === "swiping_page") {
            const threshold = Math.min(80, containerW * 0.18)
            if (finalSwipeX < -threshold && desktopData.currentPage < totalPages - 1) {
              desktopData.currentPage++
            } else if (finalSwipeX > threshold && desktopData.currentPage > 0) {
              desktopData.currentPage--
            }
          } else if (modeAtRelease === "pending_blank") {
            // 点击空白处退出编辑态
            if (desktopData.editingMode) {
              desktopData.editingMode = false
              await desktopData.saveLayout()
            }
          } else if (modeAtRelease === "pending_tile" && tileAtRelease) {
            // 轻点行为
            if (tileAtRelease.isFolder) {
              desktopData.folderOpenId = tileAtRelease.id
            } else if (!desktopData.editingMode && tileAtRelease.appId) {
              settingData.fnCall("appLaunch", [tileAtRelease.appId])
            }
          } else if (modeAtRelease === "dragging_tile" && tileAtRelease) {
            if (mergeTargetAtRelease) {
              await mergeIntoFolder(tileAtRelease.id, mergeTargetAtRelease)
            } else {
              await desktopData.saveLayout()
            }
            if (navigator.vibrate) {
              navigator.vibrate(15)
            }
          }

          m.redraw()
        } catch (err) {
          console.error("[Desktop] 指针释放处理失败:", err)
        }
      }

      return m(
        "",
        {
          style: {
            width: "100%",
            height: "100%",
            overflow: "hidden",
            position: "relative",
            backgroundColor: getColor("gray_1").back,
            backgroundImage: `url("${wallpaperUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            color: getColor("gray_1").front,
            boxSizing: "border-box",
            paddingBottom: `${getSize(2)}rem`,
            display: "flex",
            flexDirection: "column",
            userSelect: "none",
            "-webkit-user-select": "none",
            touchAction: "none"
          },
          onpointerdown: handleViewportPointerDown,
          onpointermove: handleGlobalPointerMove,
          onpointerup: handleGlobalPointerUp,
          onpointercancel: handleGlobalPointerUp,
          oncontextmenu: (e) => openContextMenu(e, null, currentVisualInfo.logicalPage)
        },
        [
          m(
            "style",
            `
              @keyframes owoDesktopJiggle {
                0% { transform: rotate(-1.4deg); }
                100% { transform: rotate(1.4deg); }
              }
            `
          ),

          // ─── 顶部精简操作栏（全量使用系统 IconTag 与成套主题色） ───
          m(
            "",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: `${getSize(2)}rem`,
                padding: `${getSize(3)}rem ${getSize(6)}rem`,
                width: "100%",
                maxWidth: `${gridTotalWidth + 48}px`,
                margin: "0 auto",
                boxSizing: "border-box"
              },
              onpointerdown: (e) => e.stopPropagation()
            },
            [
              m(
                "",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: `${getSize(2)}rem`,
                    flex: "1 1 auto",
                    minWidth: "0"
                  }
                },
                [
                  // 顶部快速搜索框（切换至桌面时自动聚焦）
                  m(
                    "",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: `${getSize(1.5)}rem`,
                        background: getColor("gray_4").back,
                        color: getColor("gray_4").front,
                        border: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                        borderRadius: `${getSize(8)}rem`,
                        padding: `${getSize(1)}rem ${getSize(3)}rem`,
                        width: "min(100%, 26rem)",
                        boxSizing: "border-box",
                        boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.08)`
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon("Search", {
                        fill: getColor("gray_4").front,
                        size: `${getSize(4)}rem`
                      })),
                      m(
                        "input",
                        {
                          type: "text",
                          value: searchQuery,
                          placeholder: trs("桌面/搜索/占位符", {
                            cn: "搜索应用...",
                            en: "Search apps..."
                          }),
                          oncreate: ({ dom }) => {
                            searchInputDom = dom
                            requestAnimationFrame(() => {
                              if (searchInputDom) {
                                searchInputDom.focus()
                              }
                            })
                          },
                          oninput: (e) => {
                            searchQuery = e.target.value
                          },
                          onkeydown: (e) => {
                            if (e.key === "Enter" && !e.isComposing && searchResults.length > 0) {
                              const firstApp = searchResults[0]
                              if (firstApp && firstApp.appId) {
                                settingData.fnCall("appLaunch", [firstApp.appId])
                              }
                            }
                          },
                          style: {
                            flex: "1 1 auto",
                            minWidth: "0",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontSize: `${getSize(3.5)}rem`,
                            lineHeight: `${getSize(5)}rem`,
                            color: getColor("gray_4").front
                          }
                        }
                      ),
                      searchQuery
                        ? m(
                          "",
                          {
                            title: trs("桌面/操作/清空搜索", {
                              cn: "清空",
                              en: "Clear"
                            }),
                            style: {
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              opacity: 0.65
                            },
                            onclick: () => {
                              searchQuery = ""
                              if (searchInputDom) {
                                searchInputDom.focus()
                              }
                              m.redraw()
                            }
                          },
                          [
                            m.trust(window.iconPark.getIcon("CloseSmall", {
                              fill: getColor("gray_4").front,
                              size: `${getSize(4)}rem`
                            }))
                          ]
                        )
                        : null
                    ]
                  ),

                  isEditing
                    ? m(
                      "",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: `${getSize(1)}rem`
                        }
                      },
                      [
                        // 排列方向切换：横向（iOS） / 竖向（Windows）
                        m(
                          IconTag,
                          {
                            iconName: isVertical ? "SortAmountDown" : "GridNine",
                            bgColor: getColor("gray_2").back,
                            fgColor: getColor("gray_2").front,
                            ext: {
                              onclick: async () => {
                                await desktopData.toggleFlowDirection()
                              }
                            }
                          },
                          isVertical
                            ? trs("桌面/方向/竖向", {
                              cn: "竖向排列",
                              en: "Vertical"
                            })
                            : trs("桌面/方向/横向", {
                              cn: "横向排列",
                              en: "Horizontal"
                            })
                        ),

                        // 添加小组件
                        m(
                          IconTag,
                          {
                            iconName: "Plus",
                            bgColor: getColor("gray_2").back,
                            fgColor: getColor("gray_2").front,
                            ext: {
                              onclick: () => openWidgetGallery(currentVisualInfo.logicalPage)
                            }
                          },
                          trs("桌面/操作/添加小组件", {
                            cn: "小组件",
                            en: "Widgets"
                          })
                        )
                      ]
                    )
                    : null
                ]
              ),

              m(
                "",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: `${getSize(1)}rem`
                  }
                },
                [
                  // 复位布局（仅编辑模式显示）
                  isEditing
                    ? m(
                      IconTag,
                      {
                        iconName: "Refresh",
                        bgColor: getColor("gray_2").back,
                        fgColor: getColor("gray_2").front,
                        ext: {
                          onclick: () => {
                            Notice.launch({
                              tip: trs("桌面/弹窗/复位标题", {
                                cn: "复位桌面布局",
                                en: "Reset Desktop Layout"
                              }),
                              msg: trs("桌面/弹窗/复位内容", {
                                cn: "是否恢复为默认排列（时钟小组件 + 全量应用整齐排布）？",
                                en: "Restore default layout (Clock widget + all apps)?"
                              }),
                              confirm: async () => {
                                await desktopData.resetLayout()
                              }
                            })
                          }
                        }
                      },
                      trs("桌面/操作/复位布局", {
                        cn: "复位",
                        en: "Reset"
                      })
                    )
                    : null,

                  // 编辑 / 完成按钮
                  m(
                    IconTag,
                    {
                      iconName: isEditing ? "CheckOne" : "Edit",
                      bgColor: isEditing ? getColor("main").back : getColor("gray_2").back,
                      fgColor: isEditing ? getColor("main").front : getColor("gray_2").front,
                      ext: {
                        onclick: async () => {
                          try {
                            desktopData.editingMode = !isEditing
                            if (!desktopData.editingMode) {
                              await desktopData.saveLayout()
                            }
                            m.redraw()
                          } catch (err) {
                            console.error("[Desktop] 切换编辑状态失败:", err)
                          }
                        }
                      }
                    },
                    isEditing
                      ? trs("桌面/操作/完成", {
                        cn: "完成",
                        en: "Done"
                      })
                      : trs("桌面/操作/编辑", {
                        cn: "编辑",
                        en: "Edit"
                      })
                  )
                ]
              )
            ]
          ),

          // ─── 搜索模式视图 OR 横向多页 Swiper ───
          trimmedQuery
            ? m(
              "",
              {
                style: {
                  flex: "1 1 auto",
                  width: "100%",
                  minHeight: "0",
                  overflowY: "auto",
                  padding: `${getSize(4)}rem ${getSize(6)}rem`,
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center"
                },
                onpointerdown: (e) => e.stopPropagation()
              },
              [
                searchResults.length > 0
                  ? m(
                    "",
                    {
                      style: {
                        width: "100%",
                        maxWidth: `${gridTotalWidth}px`,
                        display: "grid",
                        gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(76, unitSize - 8)}px, 1fr))`,
                        gap: `${getSize(4)}rem`,
                        alignItems: "start"
                      }
                    },
                    searchResults.map((item) => m(
                      "",
                      {
                        key: `search_${item.appId}`,
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: `${getSize(1)}rem`,
                          cursor: "pointer",
                          padding: `${getSize(2)}rem`,
                          borderRadius: `${getSize(4)}rem`
                        },
                        onclick: () => {
                          settingData.fnCall("appLaunch", [item.appId])
                        }
                      },
                      [
                        m(
                          "",
                          {
                            style: {
                              width: `${Math.min(Math.floor((unitSize - 14) * 0.72), 64)}px`,
                              height: `${Math.min(Math.floor((unitSize - 14) * 0.72), 64)}px`,
                              borderRadius: "22.5%",
                              overflow: "hidden",
                              background: getColor("gray_4").back,
                              border: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                              boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.08)`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }
                          },
                          [
                            m(
                              "img",
                              {
                                src: getAppIconUrl(item.appId, item.icon),
                                onerror: (e) => {
                                  e.target.src = "/statics/navbar/program.svg"
                                },
                                style: {
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover"
                                }
                              }
                            )
                          ]
                        ),
                        m(
                          "span",
                          {
                            style: {
                              fontSize: `${getSize(3)}rem`,
                              lineHeight: `${getSize(4)}rem`,
                              color: getColor("gray_1").front,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "100%"
                            }
                          },
                          item.name || item.appId
                        ),
                        item.folderName
                          ? m(
                            "span",
                            {
                              style: {
                                fontSize: `${getSize(2.5)}rem`,
                                lineHeight: `${getSize(3)}rem`,
                                opacity: 0.65,
                                color: getColor("gray_1").front,
                                textAlign: "center",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%"
                              }
                            },
                            item.folderName
                          )
                          : null
                      ]
                    ))
                  )
                  : m(
                    "",
                    {
                      style: {
                        marginTop: `${getSize(12)}rem`,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: `${getSize(2)}rem`,
                        opacity: 0.7,
                        color: getColor("gray_1").front
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon("Search", {
                        fill: getColor("gray_1").front,
                        size: `${getSize(8)}rem`
                      })),
                      m(
                        "span",
                        {
                          style: {
                            fontSize: `${getSize(4)}rem`,
                            lineHeight: `${getSize(5)}rem`
                          }
                        },
                        trs("桌面/搜索/无结果", {
                          cn: "未找到匹配的应用",
                          en: "No matching apps found"
                        })
                      )
                    ]
                  )
              ]
            )
            : m(
              "",
            {
              oncreate: ({ dom }) => {
                swiperDom = dom
                if (resizeObserver) {
                  resizeObserver.observe(swiperDom)
                }
                syncContainerSize()
              },
              style: {
                flex: "1 1 auto",
                width: "100%",
                minHeight: "0",
                overflow: "hidden",
                position: "relative"
              }
            },
            [
              m(
                "",
                {
                  style: {
                    display: "flex",
                    width: `${totalPages * 100}%`,
                    height: "100%",
                    transform: `translate3d(calc(-${(desktopData.currentPage * (100 / totalPages)).toFixed(6)}% + ${swipeDeltaX}px), 0, 0)`,
                    transition: pointerMode === "swiping_page" ? "none" : "transform 0.3s ease"
                  }
                },
                visualPages.map((vPage) => {
                  const pageIdx = vPage.visualPage
                  const pageItems = layout.filter((it) => it.page === pageIdx)

                  return m(
                    "",
                    {
                      key: `visual_page_${pageIdx}`,
                      style: {
                        width: `${(100 / totalPages).toFixed(6)}%`,
                        flexShrink: 0,
                        overflow: "hidden",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        boxSizing: "border-box"
                      }
                    },
                    [
                      m(
                        "",
                        {
                          oncreate: ({ dom }) => {
                            pageGridDoms.set(pageIdx, dom)
                          },
                          onremove: () => {
                            pageGridDoms.delete(pageIdx)
                          },
                          style: {
                            position: "relative",
                            width: `${gridTotalWidth}px`,
                            height: `${gridTotalHeight}px`
                          }
                        },
                        [
                          // 拖拽目标虚线吸附框（使用主题主色，亮暗主题清晰可见）
                          shadowSlot && shadowSlot.page === pageIdx && pointerMode === "dragging_tile"
                            ? (() => {
                              const isSingle = shadowSlot.w === 1 && shadowSlot.h === 1
                              const slotW = isSingle
                                ? Math.min(Math.floor((unitSize - 14) * 0.72), 64)
                                : (shadowSlot.w * unitSize - 14)
                              const slotH = isSingle
                                ? slotW
                                : (shadowSlot.h * unitSize - 14)
                              const offsetLeft = isSingle ? ((unitSize - 14) - slotW) / 2 : 0

                              return m(
                                "",
                                {
                                  style: {
                                    position: "absolute",
                                    top: "0",
                                    left: "0",
                                    width: `${slotW}px`,
                                    height: `${slotH}px`,
                                    transform: `translate3d(${shadowSlot.col * unitSize + offsetLeft}px, ${shadowSlot.row * unitSize}px, 0)`,
                                    borderRadius: isSingle ? "22.5%" : `${getSize(4)}rem`,
                                    border: `${getSize(0.5)}rem dashed ${getColor("main").back}`,
                                    background: getColor("gray_3").back,
                                    opacity: 0.55,
                                    pointerEvents: "none",
                                    transition: "transform 0.2s ease",
                                    zIndex: 0
                                  }
                                }
                              )
                            })()
                            : null,

                          // 当前页所有磁贴
                          pageItems.map((tile) => m(
                            DesktopIcon,
                            {
                              key: tile.id,
                              tile,
                              unitSize,
                              isDragging: draggingTile && draggingTile.id === tile.id && pointerMode === "dragging_tile",
                              isDropTarget: hoverFolderTarget === tile.id,
                              onPointerDown: handleTilePointerDown,
                              onContextMenu: (e, targetTile) => openContextMenu(e, targetTile, vPage.logicalPage),
                              onToggleWidgetSize: (id) => desktopData.toggleWidgetSize(id, cols),
                              onRemoveWidget: (id) => desktopData.removeWidget(id),
                              onUnpackFolder: unpackFolder
                            }
                          ))
                        ]
                      )
                    ]
                  )
                })
              )
            ]
          ),

          // ─── 分页指示器（搜索态隐藏，正常态显示） ───
          !trimmedQuery && totalPages > 1
            ? m(
              "",
              {
                style: {
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: `${getSize(2)}rem`,
                  padding: `${getSize(2)}rem 0 ${getSize(3)}rem 0`,
                  flexShrink: 0
                },
                onpointerdown: (e) => e.stopPropagation()
              },
              [
                m(
                  "",
                  {
                    style: {
                      width: `${getSize(6)}rem`,
                      height: `${getSize(6)}rem`,
                      borderRadius: "50%",
                      background: getColor("gray_2").back,
                      color: getColor("gray_2").front,
                      opacity: desktopData.currentPage > 0 ? 1 : 0.35,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: desktopData.currentPage > 0 ? "pointer" : "default"
                    },
                    onclick: () => {
                      if (desktopData.currentPage > 0) {
                        desktopData.currentPage--
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(window.iconPark.getIcon("Left", {
                      fill: getColor("gray_2").front,
                      size: `${getSize(4)}rem`
                    }))
                  ]
                ),

                m(
                  "",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: `${getSize(2)}rem`
                    }
                  },
                  visualPages.map((vPage) => {
                    const pIdx = vPage.visualPage
                    const isActive = desktopData.currentPage === pIdx
                    return m(
                      "",
                      {
                        key: `dot_${pIdx}`,
                        style: {
                          width: isActive ? `${getSize(5)}rem` : `${getSize(2)}rem`,
                          height: `${getSize(2)}rem`,
                          borderRadius: `${getSize(8)}rem`,
                          background: isActive ? getColor("main").back : getColor("gray_2").back,
                          transition: "all 0.3s ease",
                          cursor: "pointer"
                        },
                        onclick: () => {
                          desktopData.currentPage = pIdx
                          m.redraw()
                        }
                      }
                    )
                  })
                ),

                m(
                  "",
                  {
                    style: {
                      width: `${getSize(6)}rem`,
                      height: `${getSize(6)}rem`,
                      borderRadius: "50%",
                      background: getColor("gray_2").back,
                      color: getColor("gray_2").front,
                      opacity: desktopData.currentPage < totalPages - 1 ? 1 : 0.35,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: desktopData.currentPage < totalPages - 1 ? "pointer" : "default"
                    },
                    onclick: () => {
                      if (desktopData.currentPage < totalPages - 1) {
                        desktopData.currentPage++
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(window.iconPark.getIcon("Right", {
                      fill: getColor("gray_2").front,
                      size: `${getSize(4)}rem`
                    }))
                  ]
                )
              ]
            )
            : null,

          // ─── 悬空跟手拖拽代理 ───
          draggingTile && pointerMode === "dragging_tile"
            ? m(
              "",
              {
                style: {
                  position: "fixed",
                  top: "0",
                  left: "0",
                  width: `${(draggingTile.isWidget ? (draggingTile.w || 2) : 1) * unitSize - 14}px`,
                  height: `${(draggingTile.isWidget ? (draggingTile.h || 2) : 1) * unitSize - 14}px`,
                  transform: `translate3d(${pointerPixel.x - dragOffset.x}px, ${pointerPixel.y - dragOffset.y}px, 0) scale(1.06)`,
                  transition: "none",
                  zIndex: 99999,
                  pointerEvents: "none",
                  filter: "drop-shadow(0 10px 20px rgba(0, 0, 0, 0.28))"
                }
              },
              [
                m(
                  DesktopIcon,
                  {
                    tile: draggingTile,
                    unitSize,
                    isProxy: true
                  }
                )
              ]
            )
            : null,

          // ─── 文件夹展开弹窗（零 blur、成套主题色、实时改名不打断输入、剩 ≤1 项自动解散） ───
          activeFolder
            ? m(
              "",
              {
                style: {
                  position: "fixed",
                  top: "0",
                  left: "0",
                  width: "100vw",
                  height: "100vh",
                  background: "rgba(0, 0, 0, 0.45)",
                  zIndex: 99990,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                },
                onpointerdown: (e) => e.stopPropagation(),
                onclick: () => {
                  desktopData.folderOpenId = null
                  m.redraw()
                }
              },
              [
                m(
                  "",
                  {
                    style: {
                      background: getColor("gray_4").back,
                      color: getColor("gray_4").front,
                      borderRadius: `${getSize(8)}rem`,
                      padding: `${getSize(6)}rem`,
                      width: "min(90vw, 44rem)",
                      boxShadow: `0 ${getSize(1)}rem ${getSize(4)}rem rgba(0, 0, 0, 0.15)`,
                      border: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                      display: "flex",
                      flexDirection: "column",
                      gap: `${getSize(4)}rem`,
                      boxSizing: "border-box"
                    },
                    onclick: (e) => e.stopPropagation()
                  },
                  [
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: `${getSize(2)}rem`
                        }
                      },
                      [
                        m(
                          "input",
                          {
                            value: activeFolder.name || "",
                            placeholder: trs("桌面/文件夹/默认名", {
                              cn: "文件夹",
                              en: "Folder"
                            }),
                            style: {
                              fontSize: `${getSize(5)}rem`,
                              lineHeight: `${getSize(6)}rem`,
                              background: "transparent",
                              border: "none",
                              borderBottom: `${getSize(0.5)}rem solid ${getColor("main").back}`,
                              color: getColor("gray_4").front,
                              outline: "none",
                              flex: "1 1 auto",
                              minWidth: "0"
                            },
                            oninput: (e) => {
                              activeFolder.name = e.target.value
                            },
                            onchange: async (e) => {
                              try {
                                activeFolder.name = e.target.value.trim() || trs("桌面/文件夹/默认名", {
                                  cn: "文件夹",
                                  en: "Folder"
                                })
                                await desktopData.saveLayout()
                              } catch (err) {
                                console.error("[Desktop] 保存文件夹名称失败:", err)
                              }
                            }
                          }
                        ),
                        m(
                          "",
                          {
                            title: trs("桌面/操作/关闭", {
                              cn: "关闭",
                              en: "Close"
                            }),
                            style: {
                              width: `${getSize(7)}rem`,
                              height: `${getSize(7)}rem`,
                              borderRadius: "50%",
                              background: getColor("gray_2").back,
                              color: getColor("gray_2").front,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              flexShrink: 0
                            },
                            onclick: () => {
                              desktopData.folderOpenId = null
                              m.redraw()
                            }
                          },
                          [
                            m.trust(window.iconPark.getIcon("Close", {
                              fill: getColor("gray_2").front,
                              size: `${getSize(4)}rem`
                            }))
                          ]
                        )
                      ]
                    ),

                    m(
                      "",
                      {
                        style: {
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(7.2rem, 1fr))",
                          gap: `${getSize(3)}rem`,
                          maxHeight: "48vh",
                          overflowY: "auto",
                          padding: `${getSize(1)}rem 0`
                        }
                      },
                      (activeFolder.children || []).map((child, cIdx) => m(
                        "",
                        {
                          key: child.id,
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: `${getSize(1)}rem`,
                            cursor: "pointer",
                            position: "relative"
                          },
                          onclick: () => {
                            if (child.appId) {
                              settingData.fnCall("appLaunch", [child.appId])
                            }
                            desktopData.folderOpenId = null
                            m.redraw()
                          }
                        },
                        [
                          m(
                            "",
                            {
                              style: {
                                width: `${getSize(14)}rem`,
                                height: `${getSize(14)}rem`,
                                position: "relative"
                              }
                            },
                            [
                              m(
                                "",
                                {
                                  style: {
                                    width: "100%",
                                    height: "100%",
                                    borderRadius: "22.5%",
                                    overflow: "hidden",
                                    border: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                                    boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.08)`
                                  }
                                },
                                [
                                  m(
                                    "img",
                                    {
                                      src: getAppIconUrl(child.appId, child.icon),
                                      onerror: (e) => {
                                        e.target.src = "/statics/navbar/program.svg"
                                      },
                                      style: {
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover"
                                      }
                                    }
                                  )
                                ]
                              ),
                              isEditing
                                ? m(
                                  "",
                                  {
                                    title: trs("桌面/操作/移出文件夹", {
                                      cn: "移出文件夹",
                                      en: "Remove from Folder"
                                    }),
                                    style: {
                                      position: "absolute",
                                      top: `-${getSize(1.5)}rem`,
                                      right: `-${getSize(1.5)}rem`,
                                      width: `${getSize(5)}rem`,
                                      height: `${getSize(5)}rem`,
                                      borderRadius: "50%",
                                      background: getColor("pink_1").back,
                                      color: getColor("pink_1").front,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: "pointer",
                                      boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.15)`
                                    },
                                    onpointerdown: (e) => e.stopPropagation(),
                                    onclick: async (e) => {
                                      e.stopPropagation()
                                      await removeChildFromFolder(activeFolder.id, cIdx)
                                    }
                                  },
                                  [
                                    m.trust(window.iconPark.getIcon("UpOne", {
                                      fill: getColor("pink_1").front,
                                      size: `${getSize(3)}rem`
                                    }))
                                  ]
                                )
                                : null
                            ]
                          ),
                          m(
                            "span",
                            {
                              style: {
                                fontSize: `${getSize(3)}rem`,
                                lineHeight: `${getSize(4)}rem`,
                                textAlign: "center",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%",
                                color: getColor("gray_4").front
                              }
                            },
                            child.name
                          )
                        ]
                      ))
                    )
                  ]
                )
              ]
            )
            : null
        ]
      )
    }
  }
}
