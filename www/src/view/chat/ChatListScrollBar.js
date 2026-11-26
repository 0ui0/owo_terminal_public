// 消息列表自绘滚动条（双模手势：短滑普通滚动 / 长按 260ms 放大镜电视菜单 + 顶底边缘变速连滚）
// 约定：不接收外部回调函数，所需数据与状态对象由参数传入，内部闭环处理。

import chatData from "./chatData.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import { trs } from "../common/i18n.js"

const SNAP_GAP = 8 // 跳转吸附时，条目顶边距吸顶头下方的像素间距
const WINDOW_SIZE = 8 // 放大镜固定展示条目数
const LONG_PRESS_MS = 260 // 长按触发放大镜时间（ms）
const DRAG_THRESHOLD_PX = 8 // 区分静止长按与普通滑动的位移阈值（px）
const PREFETCH_DEBOUNCE_MS = 90 // 减速预拉取防抖时长（ms）
const MAG_SLOT_PX = 34 // 放大镜卡片槽位物理高度（px），用于指针 Y 坐标对齐

// 提取单条消息摘要（仅认权威字段 chat.ask.role，缺失按 chat.group 兼容）
const getBrief = (group) => {
  const chat = group.chats[0]
  if (chat.isPlaceholder) {
    return {
      tag: trs("聊天/角色/未载", { cn: "未载", en: "Unload" }),
      text: `${trs("聊天/角色/消息", { cn: "第", en: "#" })} ${group.startIndex + 1} ${trs("聊天/摘要/未载提示", { cn: "条消息 (减速即载)", en: "msg (slow to load)" })}`
    }
  }
  if (group.isTaskProcess) {
    return {
      tag: trs("聊天/角色/任务", { cn: "任务", en: "Task" }),
      text: `${group.processGroups.length} ${trs("聊天/摘要/任务过程", { cn: "项执行过程", en: "processes" })}`
    }
  }
  if (group.toolCallGroupId) {
    return {
      tag: trs("聊天/角色/工具", { cn: "工具", en: "Tool" }),
      text: `${group.chats.length} ${trs("聊天/摘要/工具流", { cn: "条工具流水", en: "tool calls" })}`
    }
  }
  const roleStr = (chat.ask && chat.ask.role)
    || (chat.group === "user" ? "user" : chat.group === "agent" ? "assistant" : "system")
  return {
    tag: roleStr === "user"
      ? trs("聊天/角色/提问", { cn: "提问", en: "Ask" })
      : roleStr === "assistant"
        ? trs("聊天/角色/回复", { cn: "回复", en: "Reply" })
        : trs("聊天/角色/系统", { cn: "系统", en: "System" }),
    text: (chat.content || (chat.ask && chat.ask.title) || "").replace(/\s+/g, " ").trim()
      || trs("聊天/摘要/空内容", { cn: "(空内容)", en: "(empty)" })
  }
}

export default () => {
  let trackDom = null
  let trackHeightNum = 0
  let draggingBool = false
  let dragStartOnThumbBool = false
  let isLongPressedBool = false
  let dragModeStr = "idle" // "idle" | "pending" | "normal" | "magnifier"
  let dragStartXNum = 0
  let dragStartYNum = 0
  let dragRatioNum = 0
  let lastThumbHeightNum = 28
  let longPressTimer = 0
  let prefetchTimer = 0
  let edgeScrollTimer = 0
  let jumpAdjustTimer = 0
  let dragRafId = 0
  let pendingScrollTopNum = -1
  let edgeScrollDirNum = 0 // -1 向上, 1 向下, 0 停止
  let edgeOverflowDistNum = 0
  let windowStartIdxNum = -1
  let focusGroupIdxNum = -1
  let isDestroyedBool = false
  let currentAttrs = null

  const stopEdgeAutoScroll = () => {
    clearTimeout(edgeScrollTimer)
    edgeScrollTimer = 0
    edgeScrollDirNum = 0
    edgeOverflowDistNum = 0
  }

  const cancelPendingDragFrame = () => {
    if (dragRafId) {
      cancelAnimationFrame(dragRafId)
      dragRafId = 0
    }
    pendingScrollTopNum = -1
  }

  // 减速预拉取：指针停在未加载占位页上时单飞拉取对应页
  const prefetchFlat = async (flatIndexNum) => {
    if (isDestroyedBool || !currentAttrs) {
      return
    }
    const { listId, ledger, steward } = currentAttrs
    const groupIdxNum = ledger.indexAtFlat(flatIndexNum)
    if (groupIdxNum < 0) {
      return
    }
    const chat = ledger.groups[groupIdxNum].chats[0]
    if (!chat.isPlaceholder || chat.pageIndex === undefined || steward.fetching.has(chat.pageIndex)) {
      return
    }
    steward.fetching.add(chat.pageIndex)
    try {
      await chatData.chatLists[listId].pull(chat.pageIndex)
      if (!isDestroyedBool) {
        chatData.getHistoryList(listId)
        m.redraw()
      }
    } catch (err) {
      console.error("[ChatListScrollBar] 预取分页失败", err)
    }
    steward.fetching.delete(chat.pageIndex)
  }

  const triggerPrefetch = (flatIndexNum) => {
    clearTimeout(prefetchTimer)
    prefetchTimer = setTimeout(() => {
      if (!isDestroyedBool && flatIndexNum >= 0) {
        prefetchFlat(flatIndexNum)
      }
    }, PREFETCH_DEBOUNCE_MS)
  }

  // 写入滚动位置并同步视口：供拖拽按帧合并与点击轨道跳转共用
  const applyScrollTop = (targetScrollTopNum) => {
    if (isDestroyedBool || !currentAttrs) {
      return
    }
    const { listId, steward, viewport } = currentAttrs
    const listDom = chatData.getChatListDom(listId)
    if (!listDom) {
      return
    }
    steward.lastUserAt = Date.now()
    const session = chatData.getSessionState(listId)
    const maxScrollNum = Math.max(0, listDom.scrollHeight - listDom.clientHeight)
    const clampedNum = Math.max(0, Math.min(maxScrollNum, targetScrollTopNum))

    session.isAtBottom = clampedNum >= maxScrollNum - 10
    listDom.scrollTop = clampedNum
    steward.pos = clampedNum
    steward.written = clampedNum
    steward.anchorIndex = -1
    steward.anchorFlat = -1
    viewport.recompute(steward.pos)
    m.redraw()
  }

  // 普通拖拽按帧合并写入滚动位置：避免高频移动触发重复重绘
  const scheduleScrollListTo = (targetScrollTopNum) => {
    pendingScrollTopNum = targetScrollTopNum
    if (dragRafId) {
      return
    }
    dragRafId = requestAnimationFrame(() => {
      dragRafId = 0
      if (pendingScrollTopNum < 0) {
        return
      }
      const targetNum = pendingScrollTopNum
      pendingScrollTopNum = -1
      applyScrollTop(targetNum)
    })
  }

  // 放大镜松手跳转：精准落到目标条目并在渲染落地后微调一次
  const jumpToFlat = (flatIndexNum) => {
    if (!currentAttrs) {
      return
    }
    const { listId, getGroupKey, ledger, steward, viewport } = currentAttrs
    const listDom = chatData.getChatListDom(listId)
    if (!listDom || ledger.groups.length === 0) {
      return
    }
    steward.lastUserAt = Date.now()
    const session = chatData.getSessionState(listId)

    if (flatIndexNum >= ledger.groups[ledger.groups.length - 1].startIndex) {
      session.isAtBottom = true
      listDom.scrollTop = listDom.scrollHeight - listDom.clientHeight
      steward.pos = listDom.scrollTop
      steward.written = listDom.scrollTop
      viewport.recompute(steward.pos)
      m.redraw()
      return
    }

    session.isAtBottom = false
    const targetIdxNum = Math.max(0, ledger.indexAtFlat(flatIndexNum))
    listDom.scrollTop = Math.max(0, ledger.offsets[targetIdxNum] + viewport.sticky - SNAP_GAP)
    steward.pos = listDom.scrollTop
    steward.written = listDom.scrollTop
    steward.anchorIndex = targetIdxNum
    steward.anchorFlat = ledger.groups[targetIdxNum].startIndex
    steward.anchorOffset = viewport.sticky - SNAP_GAP
    viewport.recompute(steward.pos)
    m.redraw()

    clearTimeout(jumpAdjustTimer)
    jumpAdjustTimer = setTimeout(() => {
      if (isDestroyedBool || !currentAttrs) {
        return
      }
      const targetGroup = currentAttrs.ledger.groups[targetIdxNum]
      if (!targetGroup) {
        return
      }
      const dom = currentAttrs.steward.doms[getGroupKey(targetGroup)]
      if (!dom) {
        return
      }
      const deltaNum = dom.getBoundingClientRect().top - listDom.getBoundingClientRect().top - currentAttrs.viewport.sticky - SNAP_GAP
      if (Math.abs(deltaNum) < 0.5) {
        return
      }
      listDom.scrollTop += deltaNum
      currentAttrs.steward.pos = listDom.scrollTop
      currentAttrs.steward.written = listDom.scrollTop
      currentAttrs.viewport.recompute(currentAttrs.steward.pos)
      currentAttrs.steward.sample()
      m.redraw()
    }, 32)
  }

  // 边缘连滚单步推进
  const stepEdgeScroll = () => {
    if (!currentAttrs) {
      return false
    }
    const groupsArr = currentAttrs.ledger.groups
    if (edgeScrollDirNum < 0) {
      if (windowStartIdxNum <= 0) {
        return false
      }
      windowStartIdxNum = Math.max(0, windowStartIdxNum - 1)
      focusGroupIdxNum = windowStartIdxNum
    } else if (edgeScrollDirNum > 0) {
      const maxStartNum = Math.max(0, groupsArr.length - WINDOW_SIZE)
      if (windowStartIdxNum >= maxStartNum) {
        return false
      }
      windowStartIdxNum = Math.min(maxStartNum, windowStartIdxNum + 1)
      focusGroupIdxNum = Math.min(groupsArr.length - 1, windowStartIdxNum + WINDOW_SIZE - 1)
    } else {
      return false
    }

    if (navigator.vibrate) {
      navigator.vibrate(10)
    }
    triggerPrefetch(groupsArr[focusGroupIdxNum].startIndex)
    m.redraw()
    return true
  }

  // 动态变速递归：离边缘越远速度越快（400ms → 85ms）
  const scheduleNextEdgeTick = () => {
    if (isDestroyedBool || !draggingBool || dragModeStr !== "magnifier" || edgeScrollDirNum === 0) {
      stopEdgeAutoScroll()
      return
    }
    const delayMsNum = Math.max(85, Math.round(400 - Math.min(315, edgeOverflowDistNum * 2.6)))
    edgeScrollTimer = setTimeout(() => {
      if (isDestroyedBool || !draggingBool || dragModeStr !== "magnifier" || edgeScrollDirNum === 0) {
        stopEdgeAutoScroll()
        return
      }
      if (stepEdgeScroll()) {
        scheduleNextEdgeTick()
      } else {
        stopEdgeAutoScroll()
      }
    }, delayMsNum)
  }

  const startEdgeAutoScroll = (dirNum, overflowNum) => {
    edgeOverflowDistNum = Math.max(0, overflowNum)
    if (edgeScrollDirNum === dirNum && edgeScrollTimer) {
      return
    }
    stopEdgeAutoScroll()
    edgeScrollDirNum = dirNum
    edgeScrollTimer = setTimeout(() => {
      if (isDestroyedBool || !draggingBool || dragModeStr !== "magnifier" || edgeScrollDirNum !== dirNum) {
        return
      }
      if (stepEdgeScroll()) {
        scheduleNextEdgeTick()
      } else {
        stopEdgeAutoScroll()
      }
    }, 300)
  }

  const ratioAt = (clientYNum, thumbHeightNum) => {
    if (!trackDom || trackHeightNum <= thumbHeightNum) {
      return 0
    }
    const rect = trackDom.getBoundingClientRect()
    return Math.max(
      0,
      Math.min(1, (clientYNum - rect.top - thumbHeightNum / 2) / Math.max(1, trackHeightNum - thumbHeightNum))
    )
  }

  const finishDrag = (shouldJumpBool) => {
    clearTimeout(longPressTimer)
    clearTimeout(prefetchTimer)
    longPressTimer = 0
    prefetchTimer = 0
    stopEdgeAutoScroll()
    cancelPendingDragFrame()

    if (currentAttrs) {
      currentAttrs.steward.dragging = false
    }

    if (draggingBool && currentAttrs) {
      if (shouldJumpBool && dragModeStr === "magnifier") {
        const groupsArr = currentAttrs.ledger.groups
        const activeFlatNum = focusGroupIdxNum >= 0 && focusGroupIdxNum < groupsArr.length
          ? groupsArr[focusGroupIdxNum].startIndex
          : currentAttrs.index
        jumpToFlat(activeFlatNum)
      } else if (shouldJumpBool && dragModeStr === "pending" && !dragStartOnThumbBool) {
        applyScrollTop(ratioAt(dragStartYNum, lastThumbHeightNum) * currentAttrs.maxScrollTop)
      } else if (dragModeStr === "normal") {
        currentAttrs.steward.sample()
      }
    }

    draggingBool = false
    dragStartOnThumbBool = false
    isLongPressedBool = false
    dragModeStr = "idle"
    m.redraw()
  }

  return {
    oninit() {
      isDestroyedBool = false
    },

    onremove() {
      isDestroyedBool = true
      clearTimeout(longPressTimer)
      clearTimeout(prefetchTimer)
      clearTimeout(jumpAdjustTimer)
      stopEdgeAutoScroll()
      cancelPendingDragFrame()
      draggingBool = false
      isLongPressedBool = false
      dragModeStr = "idle"
      trackDom = null
      currentAttrs = null
    },

    view({ attrs }) {
      currentAttrs = attrs
      if (attrs.maxScrollTop <= 0) {
        return null
      }

      const groupsArr = attrs.ledger.groups
      const thumbHeightNum = Math.max(28, Math.round(trackHeightNum * attrs.visibleRatio))
      lastThumbHeightNum = thumbHeightNum
      const normalRatioNum = (draggingBool && dragModeStr === "normal")
        ? dragRatioNum
        : attrs.scrollTop / attrs.maxScrollTop
      const thumbTopNum = Math.round(
        Math.max(0, Math.min(1, normalRatioNum)) * (trackHeightNum - thumbHeightNum)
      )
      const menuCenterYNum = Math.max(
        180,
        Math.min(trackHeightNum - 180, thumbTopNum + thumbHeightNum / 2)
      )

      // 用账本二分定位当前视口顶部对应的 group 下标
      const currentTopGroupIdxNum = groupsArr.length > 0
        ? Math.max(0, attrs.ledger.indexAtFlat(attrs.index))
        : 0

      const windowItemsArr = []
      if (isLongPressedBool && groupsArr.length > 0) {
        for (let stepNum = 0; stepNum < WINDOW_SIZE; stepNum++) {
          const gIdxNum = windowStartIdxNum + stepNum
          if (gIdxNum >= groupsArr.length) {
            break
          }
          windowItemsArr.push({
            gIdx: gIdxNum,
            group: groupsArr[gIdxNum]
          })
        }
      }

      return m(
        "",
        {
          style: {
            position: "absolute",
            top: `${getSize(0)}rem`,
            bottom: `${getSize(0)}rem`,
            right: `${getSize(0)}rem`,
            width: isLongPressedBool ? `${getSize(6)}rem` : `${getSize(3)}rem`,
            zIndex: 90,
            cursor: "pointer",
            touchAction: "none",
            userSelect: "none",
            transition: "width 0.2s ease"
          },
          oncreate(v) {
            trackDom = v.dom
            trackHeightNum = v.dom.clientHeight
            m.redraw()
          },
          onupdate(v) {
            trackDom = v.dom
            trackHeightNum = v.dom.clientHeight
          },
          onpointerdown(e) {
            e.preventDefault()
            e.redraw = false
            draggingBool = true
            isLongPressedBool = false
            dragModeStr = "pending"
            dragStartXNum = e.clientX
            dragStartYNum = e.clientY
            const localYNum = trackDom ? e.clientY - trackDom.getBoundingClientRect().top : -1
            dragStartOnThumbBool = localYNum >= thumbTopNum && localYNum <= thumbTopNum + thumbHeightNum
            stopEdgeAutoScroll()
            cancelPendingDragFrame()

            e.currentTarget.setPointerCapture(e.pointerId)

            clearTimeout(longPressTimer)
            longPressTimer = setTimeout(() => {
              if (isDestroyedBool || !draggingBool || dragModeStr !== "pending") {
                return
              }
              dragModeStr = "magnifier"
              isLongPressedBool = true
              focusGroupIdxNum = currentTopGroupIdxNum
              windowStartIdxNum = Math.max(
                0,
                Math.min(Math.max(0, groupsArr.length - WINDOW_SIZE), focusGroupIdxNum - 3)
              )
              if (navigator.vibrate) {
                navigator.vibrate(15)
              }
              if (groupsArr.length > 0) {
                triggerPrefetch(groupsArr[focusGroupIdxNum].startIndex)
              }
              m.redraw()
            }, LONG_PRESS_MS)
          },
          onpointermove(e) {
            e.redraw = false
            if (!draggingBool) {
              return
            }

            if (dragModeStr === "pending") {
              if (Math.hypot(e.clientX - dragStartXNum, e.clientY - dragStartYNum) > DRAG_THRESHOLD_PX) {
                clearTimeout(longPressTimer)
                longPressTimer = 0
                dragModeStr = "normal"
                isLongPressedBool = false
              } else {
                return
              }
            }

            if (dragModeStr === "normal") {
              attrs.steward.dragging = true
              clearTimeout(prefetchTimer)
              prefetchTimer = setTimeout(() => {
                if (isDestroyedBool || !currentAttrs) {
                  return
                }
                currentAttrs.steward.dragging = false
                m.redraw()
              }, 150)
              dragRatioNum = ratioAt(e.clientY, thumbHeightNum)
              scheduleScrollListTo(dragRatioNum * attrs.maxScrollTop)
              return
            }

            if (dragModeStr === "magnifier" && groupsArr.length > 0) {
              const prevFocusNum = focusGroupIdxNum
              const deltaYNum = e.clientY - (trackDom.getBoundingClientRect().top + menuCenterYNum)
              const halfMenuHNum = (WINDOW_SIZE * MAG_SLOT_PX) / 2

              if (deltaYNum < -halfMenuHNum) {
                focusGroupIdxNum = windowStartIdxNum
                startEdgeAutoScroll(-1, -halfMenuHNum - deltaYNum)
              } else if (deltaYNum > halfMenuHNum) {
                focusGroupIdxNum = Math.min(groupsArr.length - 1, windowStartIdxNum + WINDOW_SIZE - 1)
                startEdgeAutoScroll(1, deltaYNum - halfMenuHNum)
              } else {
                stopEdgeAutoScroll()
                const slotIdxNum = Math.max(0, Math.min(WINDOW_SIZE - 1, Math.round(3.5 + deltaYNum / MAG_SLOT_PX)))
                focusGroupIdxNum = Math.max(0, Math.min(groupsArr.length - 1, windowStartIdxNum + slotIdxNum))
              }

              if (focusGroupIdxNum !== prevFocusNum) {
                triggerPrefetch(groupsArr[focusGroupIdxNum].startIndex)
                m.redraw()
              }
            }
          },
          onpointerup() {
            finishDrag(true)
          },
          onpointercancel() {
            finishDrag(true)
          },
          onlostpointercapture() {
            finishDrag(false)
          }
        },
        [
          // 放大镜电视阶梯菜单（双行垂直胶囊卡片）
          isLongPressedBool
            ? m(
              "",
              {
                style: {
                  position: "absolute",
                  right: `${getSize(7)}rem`,
                  top: `${menuCenterYNum}px`,
                  transform: "translateY(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: `${getSize(1)}rem`,
                  pointerEvents: "none",
                  zIndex: 100,
                  transition: "top 0.2s ease, right 0.2s ease"
                }
              },
              windowItemsArr.map(({ gIdx, group }) => {
                const distNum = Math.abs(gIdx - focusGroupIdxNum)
                const isFocusBool = gIdx === focusGroupIdxNum
                const brief = getBrief(group)
                const cardColorStr = isFocusBool ? "pink_1" : "gray_3"
                const widthUnitsNum = isFocusBool ? 65 : Math.max(38, Math.round(65 - distNum * 7))

                return m(
                  "",
                  {
                    key: `mag_${group.startIndex}`,
                    style: {
                      width: `${getSize(widthUnitsNum)}rem`,
                      height: isFocusBool ? `${getSize(10)}rem` : `${getSize(8)}rem`,
                      borderRadius: `${getSize(8)}rem`,
                      background: getColor(cardColorStr).back,
                      color: getColor(cardColorStr).front,
                      boxShadow: isFocusBool
                        ? `0 ${getSize(1)}rem ${getSize(4)}rem rgba(0,0,0,0.15)`
                        : `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0,0,0,0.08)`,
                      opacity: isFocusBool ? "1" : Math.max(0.48, 1 - distNum * 0.16).toFixed(2),
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "center",
                      padding: isFocusBool
                        ? `${getSize(1)}rem ${getSize(3)}rem`
                        : `${getSize(1 / 2)}rem ${getSize(3)}rem`,
                      boxSizing: "border-box",
                      gap: `${getSize(1 / 2)}rem`,
                      transform: isFocusBool ? "scale(1.02)" : "scale(1)",
                      transition: "width 0.2s ease, transform 0.2s ease, opacity 0.2s ease, height 0.2s ease",
                      overflow: "hidden"
                    }
                  },
                  [
                    m(
                      "",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: `${getSize(1)}rem`,
                          width: "100%",
                          flexShrink: 0
                        }
                      },
                      [
                        m(
                          "span",
                          {
                            style: {
                              fontSize: `${getSize(3)}rem`,
                              padding: `${getSize(0)}rem ${getSize(1)}rem`,
                              borderRadius: `${getSize(8)}rem`,
                              background: isFocusBool ? "rgba(255,255,255,0.22)" : getColor("main").back,
                              color: isFocusBool ? getColor("pink_1").front : getColor("main").front,
                              whiteSpace: "nowrap"
                            }
                          },
                          `${trs("聊天/角色/序号前缀", { cn: "第", en: "#" })}${group.startIndex + 1}${trs("聊天/角色/序号后缀", { cn: "条", en: "" })}`
                        ),
                        m(
                          "span",
                          {
                            style: {
                              fontSize: `${getSize(3)}rem`,
                              padding: `${getSize(0)}rem ${getSize(1)}rem`,
                              borderRadius: `${getSize(8)}rem`,
                              background: isFocusBool ? getColor("main").back : "rgba(0,0,0,0.06)",
                              color: isFocusBool ? getColor("main").front : getColor(cardColorStr).front,
                              whiteSpace: "nowrap"
                            }
                          },
                          brief.tag
                        )
                      ]
                    ),
                    m(
                      "span",
                      {
                        style: {
                          fontSize: isFocusBool ? `${getSize(3.5)}rem` : `${getSize(3)}rem`,
                          lineHeight: isFocusBool ? `${getSize(4.5)}rem` : `${getSize(4)}rem`,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                          wordBreak: "break-all",
                          display: "block"
                        }
                      },
                      brief.text
                    )
                  ]
                )
              })
            )
            : null,

          // 基础轨道背景（保持透明以防遮挡右侧消息气泡边框）
          m(
            "",
            {
              style: {
                position: "absolute",
                right: `${getSize(0)}rem`,
                top: `${getSize(0)}rem`,
                bottom: `${getSize(0)}rem`,
                width: isLongPressedBool ? `${getSize(4)}rem` : `${getSize(3)}rem`,
                // background: getColor("gray_3").back,
                background: "transparent",
                borderRadius: `${getSize(8)}rem`,
                transition: "width 0.2s ease"
              }
            }
          ),

          // 基础滑块
          m(
            "",
            {
              style: {
                position: "absolute",
                right: `${getSize(0)}rem`,
                width: isLongPressedBool ? `${getSize(5)}rem` : `${getSize(3)}rem`,
                top: `${thumbTopNum}px`,
                height: `${thumbHeightNum}px`,
                minHeight: `${getSize(6)}rem`,
                borderRadius: `${getSize(8)}rem`,
                background: isLongPressedBool ? getColor("pink_1").back : getColor("main").back,
                color: isLongPressedBool ? getColor("pink_1").front : getColor("main").front,
                boxShadow: isLongPressedBool
                  ? `0 ${getSize(1)}rem ${getSize(4)}rem rgba(0,0,0,0.15)`
                  : `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0,0,0,0.08)`,
                transform: isLongPressedBool ? "scale(1.03)" : "scale(1)",
                transformOrigin: "right center",
                transition: draggingBool
                  ? "width 0.2s ease, transform 0.2s ease, background 0.2s ease"
                  : "top 0.12s linear, width 0.2s ease, transform 0.2s ease, background 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden"
              }
            },
            [
              isLongPressedBool
                ? m(
                  "",
                  {
                    style: {
                      display: "flex",
                      gap: `${getSize(1 / 2)}rem`,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: "0.9"
                    }
                  },
                  [
                    m("", {
                      style: {
                        width: `${getSize(0.25)}rem`,
                        height: `${getSize(2)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        background: getColor("pink_1").front
                      }
                    }),
                    m("", {
                      style: {
                        width: `${getSize(0.25)}rem`,
                        height: `${getSize(3)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        background: getColor("pink_1").front
                      }
                    }),
                    m("", {
                      style: {
                        width: `${getSize(0.25)}rem`,
                        height: `${getSize(2)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        background: getColor("pink_1").front
                      }
                    })
                  ]
                )
                : null
            ]
          )
        ]
      )
    }
  }
}
