// quickOpen 全文搜索结果列表展示组件
// 专注于全文匹配展示：文件名 + 行号 + monospace 等宽代码行 + submatches 黄色高亮
// 严格遵循 App 开发指南与 Mithril 函数组件规范
// 虚拟滚动：ResizeObserver 真实测高 + 冻结估算高度 + scrollTop 补偿
// 关键：每个条目必须用真实 <div> 承载 data-id，fragment 节点无 DOM 导致测高失效
// 全文结果保留 pre-wrap 多行展示，条目高度不固定，由 ResizeObserver 实测

// 无任何测量数据时的初始估算高度（px）
const INITIAL_HEIGHT = 48
// 可视区上下缓冲项数，避免快速滚动出现白屏
const BUFFER_ITEMS = 8

export default ({ m, Box, getColor, trs }) => {
  const renderHighlightedText = (content, submatches) => {
    if (!submatches || submatches.length === 0) return content
    const nodes = []
    let lastIdx = 0
    submatches.forEach((mObj) => {
      if (mObj.start > lastIdx) {
        nodes.push(content.substring(lastIdx, mObj.start))
      }
      nodes.push(m("span",
        {
          style: {
            background: "#e5c07b",
            color: "#000",
            borderRadius: "0.2rem",
            padding: "0 0.2rem"
          }
        },
        content.substring(mObj.start, mObj.end)
      ))
      lastIdx = mObj.end
    })
    if (lastIdx < content.length) {
      nodes.push(content.substring(lastIdx))
    }
    return nodes
  }

  const heightsMap = {}
  let resizeObserver = null
  let scrollTop = 0
  let viewportHeight = 600
  let listDom = null
  let scrollParent = null // 滚动容器 = 列表自身（固定高度 div）
  let frozenEstimatedHeight = INITIAL_HEIGHT
  let lastKeyword = ""
  let needsScrollToSelected = false

  const observeItem = ({ dom }) => { resizeObserver?.observe(dom) }
  const unobserveItem = ({ dom }) => { resizeObserver?.unobserve(dom) }

  const getItemId = (f) => f.path ? `${f.path}:${f.line ?? 0}` : ""

  function getVirtualScrollState(list) {
    const dataLength = list.length
    const est = frozenEstimatedHeight

    // 先算出总估算高度
    let totalHeight = 0
    for (let i = 0; i < dataLength; i++) {
      totalHeight += heightsMap[getItemId(list[i])] || est
    }

    // scrollTop 钳制：确保不超过最大可滚动范围，消除底部空白
    const maxScroll = Math.max(0, totalHeight - viewportHeight)
    if (scrollTop > maxScroll) {
      scrollTop = maxScroll
      if (scrollParent) scrollParent.scrollTop = scrollTop
    }

    let startIndex = 0
    let endIndex = dataLength - 1
    let accumulated = 0
    for (let i = 0; i < dataLength; i++) {
      const h = heightsMap[getItemId(list[i])] || est
      if (accumulated + h < scrollTop) startIndex = i + 1
      if (accumulated < scrollTop + viewportHeight) endIndex = i
      accumulated += h
    }

    const renderStart = Math.max(0, startIndex - BUFFER_ITEMS)
    const renderEnd = Math.min(dataLength - 1, endIndex + BUFFER_ITEMS)

    let topPadding = 0
    for (let i = 0; i < renderStart; i++) {
      topPadding += heightsMap[getItemId(list[i])] || est
    }
    let bottomPadding = 0
    for (let i = renderEnd + 1; i < dataLength; i++) {
      bottomPadding += heightsMap[getItemId(list[i])] || est
    }

    const visibleItems = list.slice(renderStart, renderEnd + 1)
    return { visibleItems, renderStart, topPadding, bottomPadding }
  }

  function onScroll() {
    if (!scrollParent) return
    scrollTop = scrollParent.scrollTop
    viewportHeight = scrollParent.clientHeight
    m.redraw()
  }

  function scrollSelectedIntoView(list, selectedIndex) {
    if (!needsScrollToSelected) return
    needsScrollToSelected = false
    if (!scrollParent) return

    // 计算选中项在列表中的累计偏移（不依赖它是否已渲染）
    const est = frozenEstimatedHeight
    let offsetTop = 0
    let itemHeight = est
    for (let i = 0; i < list.length; i++) {
      const h = heightsMap[getItemId(list[i])] || est
      if (i === selectedIndex) {
        itemHeight = h
        break
      }
      offsetTop += h
    }

    // 若选中项在视口上方，滚到它顶部；若在下方，滚到能看见它的位置
    if (offsetTop < scrollParent.scrollTop) {
      scrollParent.scrollTop = offsetTop
    } else if (offsetTop + itemHeight > scrollParent.scrollTop + scrollParent.clientHeight) {
      scrollParent.scrollTop = offsetTop + itemHeight - scrollParent.clientHeight
    }
    scrollTop = scrollParent.scrollTop
  }

  return {
    oninit(vnode) {
      resizeObserver = new ResizeObserver((entries) => {
        const changes = []
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-id")
          if (!id) continue
          const newHeight = entry.target.offsetHeight
          if (newHeight <= 0) continue
          const oldHeight = heightsMap[id]
          if (oldHeight === newHeight) continue

          const refHeight = oldHeight !== undefined ? oldHeight : frozenEstimatedHeight
          const delta = newHeight - refHeight

          let aboveViewport = false
          if (scrollParent && delta !== 0) {
            const itemRect = entry.target.getBoundingClientRect()
            const listRect = scrollParent.getBoundingClientRect()
            aboveViewport = itemRect.top < listRect.top
          }
          changes.push({ id, newHeight, delta, aboveViewport })
        }

        if (changes.length === 0) return

        if (scrollParent) {
          let totalCompensation = 0
          for (const c of changes) {
            if (c.delta !== 0 && c.aboveViewport) {
              totalCompensation += c.delta
            }
          }
          if (totalCompensation !== 0) {
            scrollParent.scrollTop += totalCompensation
            scrollTop = scrollParent.scrollTop
          }
        }

        for (const c of changes) {
          heightsMap[c.id] = c.newHeight
        }
        const measuredValues = Object.values(heightsMap)
        if (measuredValues.length > 0) {
          frozenEstimatedHeight = measuredValues.reduce((a, b) => a + b, 0) / measuredValues.length
        }
        m.redraw()
      })
    },

    onbeforeremove(vnode) {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
    },

    view(vnode) {
      const { list = [], selectedIndex = 0, keyword = "", onOpenFile, needsScroll } = vnode.attrs
      if (needsScroll) needsScrollToSelected = true

      if (keyword !== lastKeyword) {
        lastKeyword = keyword
        Object.keys(heightsMap).forEach((k) => { delete heightsMap[k] })
        frozenEstimatedHeight = INITIAL_HEIGHT
        scrollTop = 0
        if (scrollParent) scrollParent.scrollTop = 0
      }

      if (list.length === 0) {
        if (!keyword.trim()) return null
        return m("",
          {
            style: {
              textAlign: "center",
              color: getColor('gray_4').front,
              padding: "1rem"
            }
          },
          trs("快速打开/无结果", {
            cn: "无匹配结果喵",
            en: "No matches"
          })
        )
      }

      const { visibleItems, renderStart, topPadding, bottomPadding } = getVirtualScrollState(list)

      return m("div",
        {
          style: {
            height: "35rem",
            overflowY: "auto",
            overflowAnchor: "none"
          },
          oncreate(vnodeEl) {
            listDom = vnodeEl.dom
            scrollParent = vnodeEl.dom
            viewportHeight = vnodeEl.dom.clientHeight
            scrollTop = vnodeEl.dom.scrollTop
          },
          onupdate(vnodeEl) {
            listDom = vnodeEl.dom
            scrollParent = vnodeEl.dom
            viewportHeight = vnodeEl.dom.clientHeight
            scrollSelectedIntoView(list, selectedIndex)
          },
          onscroll: onScroll
        },
        [
          m("div", { style: { height: `${topPadding}px` } }),
          m("div",
            visibleItems.map((f, i) => {
              const realIndex = renderStart + i
              const isSelected = (realIndex === selectedIndex)
              const itemId = getItemId(f)
              return m("div",
                {
                  key: itemId,
                  "data-id": itemId,
                  "data-selected": isSelected ? "true" : undefined,
                  oncreate: observeItem,
                  onbeforeremove: unobserveItem,
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    background: isSelected ? getColor('main').back : "transparent",
                    padding: "0.5rem 0.8rem",
                    borderRadius: "0.6rem",
                    cursor: "pointer",
                    overflow: "hidden",
                    boxSizing: "border-box"
                  },
                  onclick: () => {
                    if (typeof onOpenFile === "function") {
                      onOpenFile(f)
                    }
                  }
                },
                [
                  m("div",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        color: isSelected ? getColor('main').front : getColor('gray_1').front,
                        whiteSpace: "nowrap",
                        overflow: "hidden"
                      }
                    },
                    [
                      f.isFileNameMatch
                        ? [
                            m("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, f.name),
                            m("span",
                              {
                                style: {
                                  fontSize: "1rem",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "0.3rem",
                                  background: isSelected ? getColor('main').front + "33" : getColor('main').back + "55",
                                  color: isSelected ? getColor('main').front : getColor('main').front,
                                  flexShrink: 0
                                }
                              },
                              trs("快速打开/文件名标记", {
                                cn: "文件名",
                                en: "Filename"
                              })
                            )
                          ]
                        : m("span", `${f.name} : ${f.line}`)
                    ]
                  ),
                  f.isSearchResult && !f.isFileNameMatch
                    ? m("div",
                      {
                        style: {
                          opacity: isSelected ? 0.9 : 0.75,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          fontFamily: "monospace",
                          tabSize: 2,
                          marginTop: "0.1rem",
                          color: isSelected ? getColor('main').front : getColor('gray_4').front
                        }
                      },
                      renderHighlightedText(f.content, f.submatches)
                    )
                    : m("div",
                      {
                        style: {
                          color: isSelected ? getColor('main').front + "cc" : getColor('gray_4').front,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }
                      },
                      f.relPath
                    )
                ]
              )
            })
          ),
          m("div", { style: { height: `${bottomPadding}px` } })
        ]
      )
    }
  }
}
