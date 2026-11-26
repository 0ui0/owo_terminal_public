/**
 * GridEngine - 自适应多页桌面网格布局引擎
 * 支持：
 * 1. 按逻辑页独立分组（真正跨页不弹回），容器变窄溢出时自动顺延至视觉续页
 * 2. 横向（行优先，iOS 风格）与竖向（列优先，Windows 桌面风格）两种排列方向
 * 3. 完整矩形占用检测（支持 1x1 图标及 2x2 / 4x2 等多格小组件）
 */

export const computeDesktopLayout = (pages, cols, rows, flowDirection = "horizontal") => {
  const safeCols = Math.max(1, cols || 1)
  const safeRows = Math.max(1, rows || 1)
  const safePages = Array.isArray(pages) && pages.length > 0 ? pages : [[]]

  const layout = []
  const visualPages = []
  let visualPageIdx = 0

  const createGrid = () => Array.from(
    { length: safeRows },
    () => Array(safeCols).fill(false)
  )

  const canPlace = (grid, c, r, w, h) => {
    if (c + w > safeCols || r + h > safeRows) {
      return false
    }
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) {
        if (grid[y][x]) {
          return false
        }
      }
    }
    return true
  }

  const occupy = (grid, c, r, w, h) => {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) {
        grid[y][x] = true
      }
    }
  }

  const findFirstSlot = (grid, w, h) => {
    if (flowDirection === "vertical") {
      // 竖向排列（列优先：从上到下，再从左到右，模拟 Windows 桌面）
      for (let c = 0; c <= safeCols - w; c++) {
        for (let r = 0; r <= safeRows - h; r++) {
          if (canPlace(grid, c, r, w, h)) {
            return {
              col: c,
              row: r
            }
          }
        }
      }
      return null
    }

    // 横向排列（行优先：从左到右，再从上到下，iOS 经典排布）
    for (let r = 0; r <= safeRows - h; r++) {
      for (let c = 0; c <= safeCols - w; c++) {
        if (canPlace(grid, c, r, w, h)) {
          return {
            col: c,
            row: r
          }
        }
      }
    }
    return null
  }

  for (let logicalIdx = 0; logicalIdx < safePages.length; logicalIdx++) {
    const pageItems = Array.isArray(safePages[logicalIdx]) ? safePages[logicalIdx] : []
    let grid = createGrid()

    visualPages.push({
      visualPage: visualPageIdx,
      logicalPage: logicalIdx,
      isOverflow: false
    })

    for (const item of pageItems) {
      const w = Math.min(item.w || 1, safeCols)
      const h = Math.min(item.h || 1, safeRows)
      let slot = findFirstSlot(grid, w, h)

      if (!slot) {
        // 当前视觉页空间不足，顺延至下一个视觉续页（仍归属同一逻辑页）
        visualPageIdx++
        grid = createGrid()
        visualPages.push({
          visualPage: visualPageIdx,
          logicalPage: logicalIdx,
          isOverflow: true
        })
        slot = findFirstSlot(grid, w, h) || {
          col: 0,
          row: 0
        }
      }

      occupy(grid, slot.col, slot.row, w, h)
      layout.push({
        ...item,
        page: visualPageIdx,
        logicalPage: logicalIdx,
        col: slot.col,
        row: slot.row,
        w,
        h
      })
    }

    visualPageIdx++
  }

  return {
    layout,
    visualPages,
    totalPages: Math.max(1, visualPages.length)
  }
}

// 矩形覆盖命中检测：支持 1x1 与多格小组件，修复仅检测左上角的 Bug
export const findTileAtCell = (pageTiles, col, row) => {
  if (!Array.isArray(pageTiles)) {
    return null
  }
  return pageTiles.find((t) => (
    col >= t.col &&
    col < t.col + (t.w || 1) &&
    row >= t.row &&
    row < t.row + (t.h || 1)
  )) || null
}

// 同一逻辑页内流式插队重排
export const reorderPageItems = (pageItems, sourceId, targetIndex) => {
  const fromIdx = pageItems.findIndex((it) => it.id === sourceId)
  if (fromIdx === -1) {
    return pageItems
  }
  const next = [...pageItems]
  const [moved] = next.splice(fromIdx, 1)
  const clamped = Math.max(0, Math.min(targetIndex, next.length))
  next.splice(clamped, 0, moved)
  return next
}
