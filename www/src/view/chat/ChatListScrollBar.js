// 消息列表自绘滚动条（严格对齐《样式设计指南》：3rem经典胶囊圆角、标准颜色配对、trs国际化、顶底连发自动步进滚动）
//
// 规范遵照：
//   1. 《样式设计指南》：圆角建议 3rem 经典胶囊，无边框线，纯行内 style，零 CSS 类名，对象属性极致垂直化换行
//   2. 严格颜色配对：getColor(name).back 必须搭配 getColor(name).front，严禁不同颜色前背景混搭
//   3. 字号规范：正文 Base 1.5rem，标签与注释 Caption 1.2rem
//   4. 国际化适配：全部标签使用 trs 动态渲染
//   5. 边缘连发自动步进：滚到视窗顶/底端推挤时，像键盘按住上/下键一样自动连续单个跳动步进
//   6. 双模手势隔离：未判定前静默等待，无长按为普通顺滑滚动，长按 260ms 触发放大镜，减速即预拉取

import chatData from "./chatData.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"

// 悬挂时，吸附条目顶边停在吸顶头下方多少像素
const SNAP_GAP = 8

export default () => {
  let trackDom = null
  let trackHeight = 0
  let dragging = false
  let isLongPressed = false
  let dragMode = "idle" // "idle" | "pending" | "normal" | "magnifier"
  let dragStartX = 0
  let dragStartY = 0
  let lastMoveY = 0
  let accumulatedStepY = 0
  let longPressTimer = null
  let prefetchTimer = null
  let edgeScrollTimer = null
  let edgeScrollDir = 0 // -1 向上连发, 1 向下连发, 0 停止
  let edgeOverflowDist = 0 // 距离顶/底边缘的拉拽距离（拉得越远步进越快）

  let windowStartIdx = -1 // 8 条视窗起始下标
  let focusGroupIdx = -1 // 当前高亮聚焦的 group 下标
  const WINDOW_SIZE = 8 // 放大镜固定视窗大小
  const STEP_PX = 24 // 手势每位移 24px 切换一个条目

  // 停止顶底连续自动步进滚动
  const stopEdgeAutoScroll = () => {
    if (edgeScrollTimer) {
      clearTimeout(edgeScrollTimer)
      edgeScrollTimer = null
    }
    edgeScrollDir = 0
    edgeOverflowDist = 0
  }

  // 动态速度调度递归：离边缘越远速度越快（从从容的 400ms 动态加速至 85ms）
  const scheduleNextEdgeTick = (groups, triggerPrefetch) => {
    if (!dragging || dragMode !== "magnifier" || edgeScrollDir === 0 || !groups || groups.length === 0) {
      stopEdgeAutoScroll()
      return
    }

    // 基础慢速 400ms；随着拉拽距离越远线性提速，最高达到 85ms
    const delay = Math.max(85, Math.round(400 - Math.min(315, edgeOverflowDist * 2.6)))

    edgeScrollTimer = setTimeout(() => {
      if (!dragging || dragMode !== "magnifier" || edgeScrollDir === 0) {
        stopEdgeAutoScroll()
        return
      }

      if (edgeScrollDir < 0) {
        // 向上步进
        if (windowStartIdx > 0) {
          windowStartIdx = Math.max(0, windowStartIdx - 1)
          focusGroupIdx = windowStartIdx
          try {
            navigator.vibrate?.(10)
          } catch (_) {}
          triggerPrefetch(groups[focusGroupIdx]?.startIndex)
          m.redraw()
          scheduleNextEdgeTick(groups, triggerPrefetch)
        } else {
          stopEdgeAutoScroll()
        }
      } else if (edgeScrollDir > 0) {
        // 向下步进
        const maxStart = Math.max(0, groups.length - WINDOW_SIZE)
        if (windowStartIdx < maxStart) {
          windowStartIdx = Math.min(maxStart, windowStartIdx + 1)
          focusGroupIdx = Math.min(groups.length - 1, windowStartIdx + WINDOW_SIZE - 1)
          try {
            navigator.vibrate?.(10)
          } catch (_) {}
          triggerPrefetch(groups[focusGroupIdx]?.startIndex)
          m.redraw()
          scheduleNextEdgeTick(groups, triggerPrefetch)
        } else {
          stopEdgeAutoScroll()
        }
      }
    }, delay)
  }

  // 启动边缘连续自动步进（支持手势拉拽距离动态变速）
  const startEdgeAutoScroll = (dir, overflow, groups, triggerPrefetch) => {
    edgeOverflowDist = Math.max(0, overflow)
    if (edgeScrollDir === dir && edgeScrollTimer) {
      return // 保持当前方向，已实时更新拉拽距离
    }
    stopEdgeAutoScroll()
    edgeScrollDir = dir

    // 首次触边给予 300ms 从容启动延迟，随后按距离自适应提速
    edgeScrollTimer = setTimeout(() => {
      if (!dragging || dragMode !== "magnifier" || edgeScrollDir !== dir) {
        return
      }
      if (dir < 0 && windowStartIdx > 0) {
        windowStartIdx = Math.max(0, windowStartIdx - 1)
        focusGroupIdx = windowStartIdx
        try {
          navigator.vibrate?.(10)
        } catch (_) {}
        triggerPrefetch(groups[focusGroupIdx]?.startIndex)
        m.redraw()
      } else if (dir > 0 && windowStartIdx < Math.max(0, groups.length - WINDOW_SIZE)) {
        windowStartIdx = Math.min(Math.max(0, groups.length - WINDOW_SIZE), windowStartIdx + 1)
        focusGroupIdx = Math.min(groups.length - 1, windowStartIdx + WINDOW_SIZE - 1)
        try {
          navigator.vibrate?.(10)
        } catch (_) {}
        triggerPrefetch(groups[focusGroupIdx]?.startIndex)
        m.redraw()
      }
      scheduleNextEdgeTick(groups, triggerPrefetch)
    }, 300)
  }

  // 指针 Y 坐标 → 滚动条相对比例 0~1
  const ratioAt = (clientY, thumbHeight) => {
    if (!trackDom || trackHeight <= thumbHeight) {
      return 0
    }
    const rect = trackDom.getBoundingClientRect()
    return Math.max(
      0,
      Math.min(
        1,
        (clientY - rect.top - thumbHeight / 2) / Math.max(1, trackHeight - thumbHeight)
      )
    )
  }

  // 提取单条摘要（全部遵循 trs 国际化）
  const getBrief = (group) => {
    if (!group) {
      return {
        tag: trs("聊天/角色/消息", { cn: "消息", en: "Msg" }),
        text: trs("聊天/摘要/无记录", { cn: "无记录", en: "No record" })
      }
    }
    const chat = group.chats?.[0]
    if (chat?.isPlaceholder) {
      return {
        tag: trs("聊天/角色/未载", { cn: "未载", en: "Unload" }),
        text: `${trs("聊天/角色/消息", { cn: "第", en: "#" })} ${group.startIndex + 1} ${trs("聊天/摘要/未载提示", { cn: "条消息 (减速即载)", en: "msg (slow to load)" })}`
      }
    }
    if (group.isTaskProcess) {
      return {
        tag: trs("聊天/角色/任务", { cn: "任务", en: "Task" }),
        text: `${group.processGroups?.length || 0} ${trs("聊天/摘要/任务过程", { cn: "项执行过程", en: "processes" })}`
      }
    }
    if (group.toolCallGroupId) {
      return {
        tag: trs("聊天/角色/工具", { cn: "工具", en: "Tool" }),
        text: `${group.chats?.length || 0} ${trs("聊天/摘要/工具流", { cn: "条工具流水", en: "tool calls" })}`
      }
    }
    const role = chat?.ask?.role || chat?.role || (chat?.group === "user" ? "user" : "assistant")
    const tag = role === "user"
      ? trs("聊天/角色/提问", { cn: "提问", en: "Ask" })
      : (role === "assistant"
        ? trs("聊天/角色/回复", { cn: "回复", en: "Reply" })
        : trs("聊天/角色/系统", { cn: "系统", en: "System" }))
    const text = (chat?.content || chat?.ask?.title || "").replace(/\s+/g, " ").trim()
    return {
      tag,
      text: text || trs("聊天/摘要/空内容", { cn: "(空内容)", en: "(empty)" })
    }
  }

  return {
    view({ attrs }) {
      // 内容不足一屏时物理上没有任何可滚动量，直接不挂载，杜绝启动瞬间凭空冒出的滑块
      if (attrs.maxScrollTop <= 0) {
        return null
      }

      const listId = attrs.listId
      const getGroupKey = attrs.getGroupKey
      const ledger = attrs.ledger
      const steward = attrs.steward
      const viewport = attrs.viewport
      const groups = ledger.groups
      const index = attrs.index
      const maxScrollTop = attrs.maxScrollTop
      const thumbHeight = Math.max(28, Math.round(trackHeight * attrs.visibleRatio))

      // 普通拖拽：直接把真实滚动位置写进列表（与主列表同一把尺子，滑块拉到底就是物理到底）
      const scrollListTo = (targetScrollTop) => {
        const listDom = chatData.getChatListDom(listId)
        if (!listDom) {
          return
        }
        steward.lastUserAt = Date.now()
        const session = chatData.getSessionState(listId)
        const maxScroll = Math.max(0, listDom.scrollHeight - listDom.clientHeight)
        const clamped = Math.max(0, Math.min(maxScroll, targetScrollTop))
        session.isAtBottom = (clamped >= maxScroll - 10)
        listDom.scrollTop = clamped
        steward.pos = clamped
        steward.written = clamped
        steward.sample()
        viewport.recompute()
        m.redraw()
      }

      // 松手跳转：精准落到吸附的那一条并挂在吸顶头下方
      // （主动跳跃必须先解除贴底并在同帧挪走锚点，否则会被 regulate 按旧锚点拽回原位）
      const jumpToFlat = (flatIndex) => {
        const listDom = chatData.getChatListDom(listId)
        if (!listDom || ledger.groups.length === 0) {
          return
        }
        steward.lastUserAt = Date.now()
        const session = chatData.getSessionState(listId)

        // 拖到最底下：直接落到最新消息并恢复贴底
        if (flatIndex >= ledger.groups[ledger.groups.length - 1].startIndex) {
          session.isAtBottom = true
          listDom.scrollTop = listDom.scrollHeight - listDom.clientHeight
          steward.pos = listDom.scrollTop
          steward.written = listDom.scrollTop
          steward.sample()
          viewport.recompute()
          m.redraw()
          return
        }

        session.isAtBottom = false
        const target = Math.max(0, ledger.indexAtFlat(flatIndex))
        listDom.scrollTop = Math.max(0, ledger.offsets[target] + viewport.sticky - SNAP_GAP)
        steward.pos = listDom.scrollTop
        steward.written = listDom.scrollTop

        // 锚点同步挪到目标上，否则旧锚点会把列表反向补偿回去
        steward.anchorIndex = target
        steward.anchorFlat = ledger.groups[target].startIndex
        steward.anchorOffset = viewport.sticky - SNAP_GAP

        viewport.recompute()
        m.redraw()

        // 实测高度与账本估算有偏差，落地后再按真实 DOM 校一次
        setTimeout(() => {
          const dom = steward.doms[getGroupKey(ledger.groups[target])]
          if (!dom) {
            return
          }
          const delta = dom.getBoundingClientRect().top - listDom.getBoundingClientRect().top - viewport.sticky - SNAP_GAP
          if (Math.abs(delta) < 0.5) {
            return
          }
          listDom.scrollTop += delta
          steward.pos = listDom.scrollTop
          steward.written = listDom.scrollTop
          steward.sample()
        }, 32)
      }

      // 减速预取：指针停在哪一条，就补它所在的那一页（在途页由管家统一去重）
      const prefetchFlat = async (flatIndex) => {
        const group = ledger.groups[ledger.indexAtFlat(flatIndex)]
        const chat = group?.chats?.[0]
        if (chat?.isPlaceholder && chat.pageIndex !== undefined && !steward.fetching.has(chat.pageIndex)) {
          steward.fetching.add(chat.pageIndex)
          try {
            await chatData.chatLists[listId].pull(chat.pageIndex)
            chatData.getHistoryList(listId)
            m.redraw()
          } catch (err) {
            console.error("[ChatListScrollBar] 预取分页失败", err)
          }
          steward.fetching.delete(chat.pageIndex)
        }
      }

      // 寻找当前主列表顶部对应的 group 下标
      let currentTopGroupIdx = 0
      if (groups.length > 0) {
        let minDiff = Infinity
        for (let i = 0; i < groups.length; i++) {
          const diff = Math.abs(groups[i].startIndex - index)
          if (diff < minDiff) {
            minDiff = diff
            currentTopGroupIdx = i
          } else if (groups[i].startIndex > index) {
            break
          }
        }
      }

      // 常规滑块位置（放大镜模式下外层滑块锁定静止）
      const normalRatio = attrs.scrollTop / maxScrollTop
      const thumbTop = Math.round(
        Math.max(0, Math.min(1, normalRatio)) * (trackHeight - thumbHeight)
      )

      // 菜单垂直停靠高度（居中平稳停靠在视口安全区内）
      const menuCenterY = Math.max(
        180,
        Math.min(trackHeight - 180, thumbTop + thumbHeight / 2)
      )

      // 减速预加载触发器（防抖 90ms）
      const triggerPrefetch = (flatIndex) => {
        clearTimeout(prefetchTimer)
        prefetchTimer = setTimeout(() => {
          if (flatIndex !== undefined) {
            prefetchFlat(flatIndex)
          }
        }, 90)
      }

      // 放大镜窗口 8 条条目切片
      const windowItems = []
      if (isLongPressed && groups.length > 0) {
        for (let step = 0; step < WINDOW_SIZE; step++) {
          const gIdx = windowStartIdx + step
          if (gIdx >= groups.length) {
            break
          }
          windowItems.push({
            gIdx,
            group: groups[gIdx]
          })
        }
      }

      const activeFlatIndex = groups[focusGroupIdx]?.startIndex ?? index

      return m("", {
        style: {
          position: "absolute",
          top: "0",
          bottom: "0",
          right: "0",
          width: isLongPressed ? "2.2rem" : "1.1rem",
          zIndex: 90,
          cursor: "pointer",
          touchAction: "none",
          userSelect: "none",
          transition: "width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)"
        },
        oncreate(v) {
          trackDom = v.dom
          trackHeight = v.dom.clientHeight
          m.redraw()
        },
        onupdate(v) {
          trackDom = v.dom
          trackHeight = v.dom.clientHeight
        },
        onpointerdown(e) {
          e.preventDefault()
          dragging = true
          isLongPressed = false
          dragMode = "pending" // 初始静默等待期：零位移、零跳动、零逻辑
          dragStartX = e.clientX
          dragStartY = e.clientY
          lastMoveY = e.clientY
          accumulatedStepY = 0
          stopEdgeAutoScroll()

          e.currentTarget.setPointerCapture(e.pointerId)

          // 启动长按定时器（260ms）：按住不动触发放大镜菜单
          clearTimeout(longPressTimer)
          longPressTimer = setTimeout(() => {
            if (!dragging || dragMode !== "pending") {
              return
            }
            dragMode = "magnifier"
            isLongPressed = true

            // 长按激活以当前主列表实际顶部的 group 为初始焦点，绝不跳位
            focusGroupIdx = currentTopGroupIdx
            windowStartIdx = Math.max(
              0,
              Math.min(Math.max(0, groups.length - WINDOW_SIZE), focusGroupIdx - 3)
            )

            try {
              navigator.vibrate?.(15)
            } catch (_) {}
            triggerPrefetch(groups[focusGroupIdx]?.startIndex)
            m.redraw()
          }, 260)
          m.redraw()
        },
        onpointermove(e) {
          if (!dragging) {
            return
          }
          const currentX = e.clientX
          const currentY = e.clientY
          const dist = Math.hypot(currentX - dragStartX, currentY - dragStartY)

          // 阶段 1：静默判定等待期
          if (dragMode === "pending") {
            if (dist > 8) {
              // 移动超过 8px 防抖阈值：明确意图为滑动，立即取消长按，转入普通滚动
              clearTimeout(longPressTimer)
              dragMode = "normal"
              isLongPressed = false
            } else {
              return // 8px 静止半径内静默等待长按
            }
          }

          // 阶段 2：普通虚拟滚动模式（无长按，手指拖滑）
          if (dragMode === "normal") {
            const r = ratioAt(currentY, thumbHeight)
            scrollListTo(r * maxScrollTop)
            m.redraw()
            return
          }

          // 阶段 3：长按放大镜菜单模式（彻底对齐视口世界坐标，消除 trackRect.top 产生的 2~3 个选项偏移）
          if (dragMode === "magnifier") {
            const trackRect = trackDom ? trackDom.getBoundingClientRect() : { top: 0, height: trackHeight }
            const menuCenterViewportY = trackRect.top + menuCenterY // 菜单在屏幕视口中的绝对中心 Y 坐标
            const deltaY = currentY - menuCenterViewportY // 指针相对于菜单视口中心的物理偏移（像素）
            const slotH = 34 // 上下两行卡片物理槽位高度（约 34px）
            const halfMenuH = (WINDOW_SIZE * slotH) / 2 // 菜单半高约 136px

            if (deltaY < -halfMenuH) {
              // 指针推过最顶部卡片：锁定选中第 0 项，按向上溢出距离动态自适应连滚
              focusGroupIdx = windowStartIdx
              const overflow = -halfMenuH - deltaY
              startEdgeAutoScroll(-1, overflow, groups, triggerPrefetch)
            } else if (deltaY > halfMenuH) {
              // 指针推过最底部卡片：锁定选中末项，按向下溢出距离动态自适应连滚
              focusGroupIdx = Math.min(groups.length - 1, windowStartIdx + WINDOW_SIZE - 1)
              const overflow = deltaY - halfMenuH
              startEdgeAutoScroll(1, overflow, groups, triggerPrefetch)
            } else {
              // 指针在 8 张卡片范围内：物理绝对对齐，手指正对哪张卡片就高亮哪张，彻底消除 2 个选项的偏移！
              stopEdgeAutoScroll()
              const slotIdx = Math.max(0, Math.min(WINDOW_SIZE - 1, Math.round(3.5 + deltaY / slotH)))
              focusGroupIdx = Math.max(0, Math.min(groups.length - 1, windowStartIdx + slotIdx))
            }

            triggerPrefetch(groups[focusGroupIdx]?.startIndex)
            m.redraw()
          }
        },
        onpointerup() {
          clearTimeout(longPressTimer)
          clearTimeout(prefetchTimer)
          stopEdgeAutoScroll()
          if (dragging && dragMode === "magnifier") {
            jumpToFlat(activeFlatIndex)
          }
          dragging = false
          isLongPressed = false
          dragMode = "idle"
          m.redraw()
        },
        onpointercancel() {
          clearTimeout(longPressTimer)
          clearTimeout(prefetchTimer)
          stopEdgeAutoScroll()
          if (dragging && dragMode === "magnifier") {
            jumpToFlat(activeFlatIndex)
          }
          dragging = false
          isLongPressed = false
          dragMode = "idle"
          m.redraw()
        },
        onlostpointercapture() {
          clearTimeout(longPressTimer)
          clearTimeout(prefetchTimer)
          stopEdgeAutoScroll()
          dragging = false
          isLongPressed = false
          dragMode = "idle"
          m.redraw()
        }
      }, [
        // 放大镜电视阶梯菜单（严格分2行垂直排版：第1行开头序号角色，第2行换行展示正文）
        isLongPressed ? m("", {
          style: {
            position: "absolute",
            right: "2.8rem",
            top: `${menuCenterY}px`,
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.45rem",
            pointerEvents: "none",
            zIndex: 100,
            transition: "top 0.12s ease-out, right 0.22s ease-out"
          }
        }, windowItems.map(({ gIdx, group }) => {
          const dist = Math.abs(gIdx - focusGroupIdx)
          const isFocus = (gIdx === focusGroupIdx)
          const brief = getBrief(group)

          // 宽度克制在 26rem，不挡大半屏幕；高度 4.0rem 舒适容纳上下两行
          const widthRem = isFocus ? 26 : Math.max(15, 26 - dist * 2.8)
          const itemH = isFocus ? "4.0rem" : "3.1rem"

          // 严格配对颜色：严禁不同颜色前后景混搭！
          const cardColorName = isFocus ? "pink_1" : "gray_3"
          const cardBg = getColor(cardColorName).back
          const cardFront = getColor(cardColorName).front

          const badgeColorName = "main"
          const badgeBg = getColor(badgeColorName).back
          const badgeFront = getColor(badgeColorName).front

          return m("", {
            key: `mag_${group.startIndex}`,
            style: {
              width: `${widthRem}rem`,
              height: itemH,
              borderRadius: "3rem", // 《样式设计指南》核心：建议 3rem 浑圆胶囊
              background: cardBg,
              color: cardFront,
              boxShadow: isFocus
                ? "0 4px 16px rgba(0,0,0,0.18)"
                : "0 1px 3px rgba(0,0,0,0.06)",
              opacity: isFocus ? "1.00" : Math.max(0.48, (1.0 - dist * 0.16)).toFixed(2),
              display: "flex",
              flexDirection: "column", // 【彻底改为上下垂直2行排列！】
              alignItems: "flex-start",
              justifyContent: "center",
              padding: isFocus ? "0.4rem 1.4rem" : "0.25rem 1.1rem",
              boxSizing: "border-box",
              gap: isFocus ? "0.22rem" : "0.1rem",
              transform: isFocus ? "scale(1.02)" : "scale(1)",
              transition: "width 0.14s cubic-bezier(0.2, 0.9, 0.3, 1), transform 0.14s ease, opacity 0.14s ease, height 0.14s ease",
              overflow: "hidden"
            }
          }, [
            // 第一行：开头展示【第 xxx 条】与角色徽章
            m("", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                width: "100%",
                flexShrink: 0
              }
            }, [
              m("span", {
                style: {
                  fontSize: isFocus ? "1.1rem" : "1.0rem",
                  fontWeight: "bold",
                  padding: "0.1rem 0.55rem",
                  borderRadius: "3rem",
                  background: isFocus ? "rgba(255,255,255,0.22)" : badgeBg,
                  color: isFocus ? getColor('pink_1').front : badgeFront,
                  whiteSpace: "nowrap"
                }
              }, `${trs("聊天/角色/序号前缀", { cn: "第", en: "#" })}${group.startIndex + 1}${trs("聊天/角色/序号后缀", { cn: "条", en: "" })}`),

              m("span", {
                style: {
                  fontSize: isFocus ? "1.1rem" : "1.0rem",
                  padding: "0.1rem 0.5rem",
                  borderRadius: "3rem",
                  background: isFocus ? badgeBg : "rgba(0,0,0,0.06)",
                  color: isFocus ? badgeFront : cardFront,
                  whiteSpace: "nowrap"
                }
              }, brief.tag)
            ]),

            // 第二行：换行显示正文内容（贯通整行宽度，呈现超多字数，绝不再被左侧挤压！）
            m("span", {
              style: {
                fontSize: isFocus ? "1.28rem" : "1.12rem",
                fontWeight: isFocus ? "bold" : "normal",
                lineHeight: isFocus ? "1.5rem" : "1.35rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                width: "100%",
                wordBreak: "break-all",
                display: "block"
              }
            }, brief.text)
          ])
        })) : null,

        // 基础轨道背景
        m("", {
          style: {
            position: "absolute",
            right: "0",
            top: "0",
            bottom: "0",
            width: isLongPressed ? "1.6rem" : "1.1rem",
            background: getColor('gray_3').back,
            borderRadius: "3rem",
            transition: "width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease"
          }
        }),

        // 基础滑块（平时 1.1rem 窄条，长按后向左膨胀至 2.0rem 饱满 3rem 大胶囊并浮现防滑握把）
        m("", {
          style: {
            position: "absolute",
            right: "0",
            width: isLongPressed ? "2.0rem" : "1.1rem",
            top: `${thumbTop}px`,
            height: `${thumbHeight}px`,
            minHeight: "2.4rem",
            borderRadius: "3rem", // 3rem 经典胶囊大圆角
            background: isLongPressed ? getColor('pink_1').back : getColor('main').back,
            color: isLongPressed ? getColor('pink_1').front : getColor('main').front,
            boxShadow: isLongPressed
              ? `0 0 1.2rem ${getColor('pink_1').back}cc, 0 4px 16px rgba(0,0,0,0.3)`
              : "0 1px 4px rgba(0,0,0,0.2)",
            transform: isLongPressed ? "scale(1.03)" : "scale(1)",
            transformOrigin: "right center",
            transition: dragging
              ? "width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, box-shadow 0.2s ease"
              : "top 0.12s linear, width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.22s ease, background 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden"
          }
        }, [
          // 长按防滑握把线条
          isLongPressed ? m("", {
            style: {
              display: "flex",
              gap: "0.22rem",
              alignItems: "center",
              justifyContent: "center",
              opacity: "0.9"
            }
          }, [
            m("span", {
              style: {
                width: "0.14rem",
                height: "0.75rem",
                borderRadius: "3rem",
                background: getColor('pink_1').front
              }
            }),
            m("span", {
              style: {
                width: "0.14rem",
                height: "1.1rem",
                borderRadius: "3rem",
                background: getColor('pink_1').front
              }
            }),
            m("span", {
              style: {
                width: "0.14rem",
                height: "0.75rem",
                borderRadius: "3rem",
                background: getColor('pink_1').front
              }
            })
          ]) : null
        ])
      ])
    }
  }
}
