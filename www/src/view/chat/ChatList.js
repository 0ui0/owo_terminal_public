// 消息列表（虚拟滚动 + 历史分页滑窗淘汰）
//
// 核心思路：
//   1. 账本(ledger)：维护消息分组、实测/估算高度表、前缀和坐标与二分索引
//   2. 视口(viewport)：每次统一按当前滚动位置计算渲染区间与上下占位条，绝不留白
//   3. 管家(steward)：负责测高、可见锚点采样、物理位置补偿与单飞分页拉取/远端页淘汰

import chatData from "./chatData.js"
import comData from "../../comData/comData.js"
import settingData from "../setting/settingData.js"
import ChatItem from "./ChatItem.js"
import ChatTasks from "./ChatTasks.js"
import ChatConfirm from "./ChatConfirm.js"
import ToolCallGroup from "./ToolCallGroup.js"
import TaskProcessGroup from "./TaskProcessGroup.js"
import Box from "../common/box.js"
import IconTag from "../common/iconTag.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import { trs } from "../common/i18n.js"
import ChatListScrollBar from "./ChatListScrollBar.js"

const BUFFER_ITEMS = 8 // 视口上下各多渲染 8 组，防止快速滚动露白
const ESTIMATED_HEIGHT = 100 // 未测消息的初始估算高度（px）
const SENTINEL_HEIGHT = "0.1rem" // 末尾哨兵非零高度，避免末项外边距折叠
const SEED_SAMPLES = 10 // 取样前 10 条真实消息均值作为后续估算高度
const SEED_MIN = 60
const SEED_MAX = 600
const GESTURE_MS = 300 // 用户手势静默期（ms），期间不做反向补偿
const SETTLE_MS = 320 // 手势停下后补一次静态对齐的延迟（ms）
const MIN_VIEW_HEIGHT = 600 // 视口高度尚未测得时的默认一屏高度（px）
const COMPACT_WIDTH = 560 // 列表容器窄于该宽度（px）时切为紧凑双行顶栏（兼容移动端与小浮窗）
const MAX_CACHED_PAGES = 12 // 分页滑窗上限：只保留离视口最近的 12 页（外加第 0 页），远端旧页释放回占位符

// ========== 一、纯函数区（无状态） ==========

// 分组唯一键：附加首条消息 uuid 防跨分页边界重复 key
const getGroupKey = (group) => group.isTaskProcess
  ? `${group.id}_${group.chats[0].uuid}`
  : group.toolCallGroupId
    ? `${group.toolCallGroupId}_${group.chats[0].uuid}`
    : group.chats[0].uuid

// 通信角色：严格以权威字段 chat.ask.role 为准，缺失时按 chat.group 分类兼容
const getMsgRole = (chat) => {
  if (chat.ask && chat.ask.role) {
    return chat.ask.role
  }
  if (chat.group === "user") {
    return "user"
  }
  if (chat.group === "agent") {
    return "assistant"
  }
  if (chat.group === "tip") {
    return "tool"
  }
  return "system"
}

const hasToolCalls = (chat) => Boolean(
  (chat.toolCalls && chat.toolCalls.length)
  || (chat.ask && chat.ask.toolCalls && chat.ask.toolCalls.length)
  || (chat.ask && chat.ask.tool_call_id)
)

const getProcId = (chat) => (chat.procId || (chat.ask && chat.ask.procId) || "")

const isFinalReplyGroup = (group) => !group.toolCallGroupId
  && getMsgRole(group.chats[0]) === "assistant"
  && !hasToolCalls(group.chats[0])

// 将平铺消息数组编译为分组数组：先聚合连续 toolCallGroupId，再按 procId 折叠过程消息
const buildGroups = (listDataArr) => {
  const rawGroupsArr = []
  let currentToolGroup = null

  for (let idx = 0; idx < listDataArr.length; idx++) {
    const chat = listDataArr[idx]
    const toolCallGroupId = chat.ask ? chat.ask.toolCallGroupId : ""
    if (toolCallGroupId) {
      if (currentToolGroup && currentToolGroup.toolCallGroupId === toolCallGroupId) {
        currentToolGroup.chats.push(chat)
      } else {
        currentToolGroup = {
          startIndex: idx,
          toolCallGroupId,
          chats: [chat]
        }
        rawGroupsArr.push(currentToolGroup)
      }
    } else {
      currentToolGroup = null
      rawGroupsArr.push({
        startIndex: idx,
        toolCallGroupId: "",
        chats: [chat]
      })
    }
  }

  const groupsArr = []
  let i = 0
  while (i < rawGroupsArr.length) {
    const group = rawGroupsArr[i]
    const procIdStr = getProcId(group.chats[0])
    if (procIdStr && !isFinalReplyGroup(group)) {
      const processGroupsArr = []
      while (i < rawGroupsArr.length && getProcId(rawGroupsArr[i].chats[0]) === procIdStr) {
        processGroupsArr.push(rawGroupsArr[i])
        i++
      }
      // 末条 AI 回复及其后的收尾提示挪出折叠组外单独展示
      let tailStartNum = -1
      for (let k = processGroupsArr.length - 1; k >= 0; k--) {
        if (getMsgRole(processGroupsArr[k].chats[0]) === "assistant") {
          tailStartNum = k
          break
        }
      }
      const tailGroupsArr = tailStartNum < 0 ? [] : processGroupsArr.splice(tailStartNum)
      const hasToolsBool = processGroupsArr.some(tg =>
        tg.toolCallGroupId || tg.chats.some(c => getMsgRole(c) === "tool" || hasToolCalls(c))
      )
      if (hasToolsBool && processGroupsArr.length > 0) {
        groupsArr.push({
          isTaskProcess: true,
          startIndex: processGroupsArr[0].startIndex,
          processGroups: processGroupsArr,
          id: "proc_" + procIdStr,
          chats: [processGroupsArr[0].chats[0]]
        })
      } else {
        processGroupsArr.forEach(tg => groupsArr.push(tg))
      }
      tailGroupsArr.forEach(tg => groupsArr.push(tg))
      continue
    }
    groupsArr.push(group)
    i++
  }
  return groupsArr
}

// 二分查找升序序列中最后一个 <= targetVal 的下标，找不到返回 -1
const findLastIndex = (lengthNum, targetVal, valueAtFn) => {
  let lowNum = 0
  let highNum = lengthNum - 1
  let resultNum = -1
  while (lowNum <= highNum) {
    const midNum = (lowNum + highNum) >> 1
    if (valueAtFn(midNum) <= targetVal) {
      resultNum = midNum
      lowNum = midNum + 1
    } else {
      highNum = midNum - 1
    }
  }
  return resultNum
}

export default () => {
  let activeListIdNum = -1
  let listDom = null
  let headerDom = null
  let sentinelDom = null
  let resizeObserver = null
  let dataSignatureStr = ""
  let lastMessageCountNum = 0
  let isHoveredBottomBool = false
  let isHoveredTopBool = false
  let isDestroyedBool = false

  // ========== 二、账本（高度表 + 前缀和 + 二分索引） ==========
  const ledger = {
    groups: [],
    offsets: [],
    heights: {},
    userGroups: [],
    latestProcess: -1,
    seedSum: 0,
    seedCount: 0,
    estimated: ESTIMATED_HEIGHT,

    estimate(group) {
      return group.chats[0].isPlaceholder ? ESTIMATED_HEIGHT : this.estimated
    },

    seed(advanceNum) {
      if (this.seedCount >= SEED_SAMPLES) {
        return
      }
      this.seedSum += advanceNum
      this.seedCount++
      if (this.seedCount === SEED_SAMPLES) {
        this.estimated = Math.min(Math.max(this.seedSum / this.seedCount, SEED_MIN), SEED_MAX)
      }
    },

    rebuild(fromIndexNum) {
      let sumNum = fromIndexNum === 0 ? 0 : this.offsets[fromIndexNum]
      for (let i = fromIndexNum; i < this.groups.length; i++) {
        this.offsets[i] = sumNum
        sumNum += this.heights[getGroupKey(this.groups[i])] || this.estimate(this.groups[i])
      }
      this.offsets.length = this.groups.length + 1
      this.offsets[this.groups.length] = sumNum
    },

    indexAt(contentTopNum) {
      return Math.max(0, findLastIndex(this.groups.length, contentTopNum, (i) => this.offsets[i]))
    },

    indexAtFlat(flatIndexNum) {
      return findLastIndex(this.groups.length, flatIndexNum, (i) => this.groups[i].startIndex)
    },

    userIndexAt(contentTopNum) {
      const idxNum = findLastIndex(this.userGroups.length, contentTopNum, (i) => this.offsets[this.userGroups[i]])
      return idxNum < 0 ? -1 : this.userGroups[idxNum]
    },

    load(listDataArr) {
      this.groups = buildGroups(listDataArr)
      this.userGroups = []
      this.latestProcess = -1
      for (let i = 0; i < this.groups.length; i++) {
        if (this.groups[i].chats[0].group === "user") {
          this.userGroups.push(i)
        }
        if (this.groups[i].isTaskProcess) {
          this.latestProcess = i
        }
      }
      this.rebuild(0)
    },

    clear() {
      this.heights = {}
      this.groups = []
      this.offsets = []
      this.userGroups = []
      this.latestProcess = -1
      this.seedSum = 0
      this.seedCount = 0
      this.estimated = ESTIMATED_HEIGHT
    }
  }

  // ========== 三、视口（渲染范围 + 上下占位条） ==========
  const viewport = {
    start: 0,
    end: -1,
    topPad: 0,
    bottomPad: 0,
    height: 0,
    width: 0,
    sticky: 0,
    activeUser: -1,

    padsOnly() {
      if (this.end < this.start || ledger.groups.length === 0) {
        this.topPad = 0
        this.bottomPad = 0
        return
      }
      this.topPad = ledger.offsets[this.start]
      this.bottomPad = ledger.offsets[ledger.groups.length] - ledger.offsets[this.end + 1]
    },

    // 统一按当前滚动位置重算渲染区间并夹紧到合法范围，彻底杜绝白屏
    recompute(scrollTopNum) {
      if (ledger.groups.length === 0) {
        this.start = 0
        this.end = -1
        this.padsOnly()
        return
      }
      const contentTopNum = Math.max(0, scrollTopNum - this.sticky)
      const firstIndexNum = ledger.indexAt(contentTopNum)
      const lastIndexNum = ledger.indexAt(contentTopNum + Math.max(this.height, MIN_VIEW_HEIGHT))
      this.start = Math.max(0, firstIndexNum - BUFFER_ITEMS)
      this.end = Math.min(ledger.groups.length - 1, Math.max(lastIndexNum, firstIndexNum) + BUFFER_ITEMS)
      if (this.end < this.start) {
        this.end = Math.min(ledger.groups.length - 1, this.start + BUFFER_ITEMS * 2)
      }
      this.padsOnly()
    }
  }

  // ========== 四、管家（测高 + 可见锚点采样 + 位置补偿 + 单飞拉页/淘汰） ==========
  const steward = {
    pos: 0,
    written: -1,
    anchorIndex: -1,
    anchorFlat: -1,
    anchorOffset: 0,
    lastUserAt: 0,
    settleTimer: 0,
    loadTimer: 0,
    initTimer1: 0,
    initTimer2: 0,
    dragging: false,
    fetching: new Set(),
    doms: {},

    // 用相邻兄弟 offsetTop 差测量真实占位高度（含项间距）
    measure() {
      let changedFromNum = ledger.offsets.length
      for (let i = viewport.start; i <= viewport.end; i++) {
        const group = ledger.groups[i]
        const keyStr = getGroupKey(group)
        const dom = this.doms[keyStr]
        if (!dom) {
          continue
        }
        const nextGroup = ledger.groups[i + 1]
        const nextDom = nextGroup ? (this.doms[getGroupKey(nextGroup)] || sentinelDom) : sentinelDom
        if (!nextDom || nextDom === dom) {
          continue
        }
        const advanceNum = nextDom.offsetTop - dom.offsetTop
        if (advanceNum <= 0 || ledger.heights[keyStr] === advanceNum) {
          continue
        }
        if (ledger.heights[keyStr] === undefined && !group.chats[0].isPlaceholder) {
          ledger.seed(advanceNum)
        }
        ledger.heights[keyStr] = advanceNum
        if (i < changedFromNum) {
          changedFromNum = i
        }
      }
      if (changedFromNum < ledger.offsets.length) {
        ledger.rebuild(changedFromNum)
        return true
      }
      return false
    },

    // 遍历当前渲染区间，锁定第一个真正在视口内可见的卡片作为锚点
    sample() {
      if (!listDom || ledger.groups.length === 0 || viewport.end < viewport.start) {
        this.anchorIndex = -1
        this.anchorFlat = -1
        this.anchorOffset = 0
        return
      }
      const listRect = listDom.getBoundingClientRect()
      const visibleTopNum = listRect.top + viewport.sticky
      for (let i = viewport.start; i <= viewport.end; i++) {
        const dom = this.doms[getGroupKey(ledger.groups[i])]
        if (!dom) {
          continue
        }
        const rect = dom.getBoundingClientRect()
        if (rect.bottom <= visibleTopNum || rect.top >= listRect.bottom) {
          continue
        }
        this.anchorIndex = i
        this.anchorFlat = ledger.groups[i].startIndex
        this.anchorOffset = rect.top - listRect.top
        return
      }
      this.anchorIndex = -1
      this.anchorFlat = -1
      this.anchorOffset = 0
    },

    // 滚动位置修正：流式贴底优先，其次按锚点像素差对冲上方高度变化
    regulate(forceBool = false) {
      if (!listDom || ledger.groups.length === 0) {
        return
      }

      const currentList = comData.getChatList(activeListIdNum)
      if (currentList && currentList.replying && chatData.chatListScrollAtBottom(activeListIdNum)) {
        listDom.scrollTop = listDom.scrollHeight - listDom.clientHeight
        this.pos = listDom.scrollTop
        this.written = listDom.scrollTop
        viewport.recompute(this.pos)
        this.sample()
        return
      }

      if (!forceBool && Date.now() - this.lastUserAt < GESTURE_MS) {
        return
      }

      if (this.anchorIndex < 0 || this.anchorIndex >= ledger.groups.length) {
        return
      }
      const anchorDom = this.doms[getGroupKey(ledger.groups[this.anchorIndex])]
      if (!anchorDom) {
        return
      }
      const deltaNum = anchorDom.getBoundingClientRect().top - listDom.getBoundingClientRect().top - this.anchorOffset
      if (Math.abs(deltaNum) < 0.5) {
        return
      }
      listDom.scrollTop += deltaNum
      this.pos = listDom.scrollTop
      this.written = listDom.scrollTop
      viewport.recompute(this.pos)
      this.sample()
    },

    clearTimers() {
      clearTimeout(this.loadTimer)
      clearTimeout(this.settleTimer)
      clearTimeout(this.initTimer1)
      clearTimeout(this.initTimer2)
      this.loadTimer = 0
      this.settleTimer = 0
      this.initTimer1 = 0
      this.initTimer2 = 0
    },

    clear() {
      this.doms = {}
      this.fetching.clear()
      this.pos = 0
      this.written = -1
      this.anchorIndex = -1
      this.anchorFlat = -1
      this.anchorOffset = 0
      this.dragging = false
      viewport.activeUser = -1
    }
  }

  // ========== 五、分页滑窗淘汰与按需拉页 ==========

  // 释放离当前视口最远的旧页，避免超长会话持续翻页导致原文缓存无限膨胀
  const evictFarPages = (listIdNum) => {
    const rows = chatData.chatLists[listIdNum]
    if (!rows || !rows.allCount) {
      return
    }
    const loadedPagesArr = Object.keys(rows.pages).map(Number)
    if (loadedPagesArr.length <= MAX_CACHED_PAGES) {
      return
    }
    const centerGroup = ledger.groups[(viewport.start + viewport.end) >> 1]
    const centerFlatNum = centerGroup ? centerGroup.startIndex : rows.allCount - 1
    const centerPageNum = Math.floor((rows.allCount - 1 - centerFlatNum) / rows.limit)

    // 当前视口正在展示的页、第 0 页（最新页）、在途页均不淘汰
    const protectedSet = new Set([0, ...steward.fetching])
    for (let i = viewport.start; i <= viewport.end; i++) {
      protectedSet.add(Math.floor((rows.allCount - 1 - ledger.groups[i].startIndex) / rows.limit))
    }

    const candidatesArr = loadedPagesArr
      .filter(p => !protectedSet.has(p))
      .sort((a, b) => Math.abs(b - centerPageNum) - Math.abs(a - centerPageNum))

    let remainNum = loadedPagesArr.length
    for (let i = 0; i < candidatesArr.length && remainNum > MAX_CACHED_PAGES; i++) {
      delete rows.pages[candidatesArr[i]]
      remainNum--
    }
  }

  // 挑选下一个待拉取页码：拖拽期间暂缓拉页；其余时候优先视口内离中心最近的占位页，其次上方两屏内预拉页
  const pickNextPageNum = () => {
    if (isDestroyedBool || steward.dragging || steward.fetching.size > 0 || ledger.groups.length === 0) {
      return -1
    }
    const centerNum = (viewport.start + viewport.end) >> 1
    let targetIdxNum = -1
    let prefetchIdxNum = -1
    const scanStartNum = ledger.indexAt(Math.max(0, steward.pos - viewport.sticky - viewport.height * 2))

    for (let i = scanStartNum; i <= viewport.end; i++) {
      const chat = ledger.groups[i].chats[0]
      if (!chat.isPlaceholder || chat.pageIndex === undefined) {
        continue
      }
      if (i >= viewport.start) {
        if (targetIdxNum < 0 || Math.abs(i - centerNum) < Math.abs(targetIdxNum - centerNum)) {
          targetIdxNum = i
        }
      } else if (prefetchIdxNum < 0) {
        prefetchIdxNum = i
      }
    }
    const pickIdxNum = targetIdxNum >= 0 ? targetIdxNum : prefetchIdxNum
    return pickIdxNum < 0 ? -1 : ledger.groups[pickIdxNum].chats[0].pageIndex
  }

  const scheduleLoadPages = () => {
    clearTimeout(steward.loadTimer)
    steward.loadTimer = setTimeout(async () => {
      const pageIndexNum = pickNextPageNum()
      if (pageIndexNum < 0) {
        return
      }
      const listIdNum = activeListIdNum
      steward.fetching.add(pageIndexNum)
      try {
        await chatData.chatLists[listIdNum].pull(pageIndexNum)
        if (isDestroyedBool || listIdNum !== activeListIdNum) {
          steward.fetching.delete(pageIndexNum)
          return
        }
        evictFarPages(listIdNum)
        chatData.getHistoryList(listIdNum)
        m.redraw()
      } catch (err) {
        console.error("[ChatList] 分页拉取失败", err)
      }
      steward.fetching.delete(pageIndexNum)
      if (!isDestroyedBool && listIdNum === activeListIdNum) {
        scheduleLoadPages()
      }
    }, 0)
  }

  // 数据同步：会话切换或数据变化时重建账本，并按锚点高度差对冲滚动位置
  const syncData = (chatList) => {
    const listIdNum = chatList.id
    const listDataArr = chatData.computedLists[listIdNum] || chatData.list
    const pagesObj = chatData.chatLists[listIdNum] ? chatData.chatLists[listIdNum].pages : {}
    const signatureStr = `${listIdNum}_${listDataArr.length}_${listDataArr.length > 0 ? listDataArr[0].uuid : ""}_${listDataArr.length > 0 ? listDataArr[listDataArr.length - 1].uuid : ""}_${Object.keys(pagesObj).join(",")}`

    if (signatureStr === dataSignatureStr) {
      return
    }

    const isSwitchedListBool = activeListIdNum !== listIdNum
    if (isSwitchedListBool || listDataArr.length < lastMessageCountNum) {
      activeListIdNum = listIdNum
      ledger.clear()
      steward.clear()
      viewport.start = 0
      viewport.end = -1
      chatData.getSessionState(listIdNum).isAtBottom = true
      if (isSwitchedListBool && !chatData.chatLists[listIdNum]) {
        chatData.initChatLists(listIdNum)
        chatData.chatLists[listIdNum].pull(0)
          .then(() => {
            if (!isDestroyedBool && activeListIdNum === listIdNum) {
              chatData.getHistoryList(listIdNum)
              m.redraw()
            }
          })
          .catch(err => console.error("[ChatList] 切换会话拉取失败", err))
      }
    }

    lastMessageCountNum = listDataArr.length
    dataSignatureStr = signatureStr

    const oldAnchorTopNum = steward.anchorIndex < 0 ? 0 : ledger.offsets[steward.anchorIndex]
    ledger.load(listDataArr)
    steward.anchorIndex = steward.anchorFlat < 0 ? -1 : ledger.indexAtFlat(steward.anchorFlat)

    if (steward.anchorIndex >= 0 && listDom) {
      const deltaNum = ledger.offsets[steward.anchorIndex] - oldAnchorTopNum
      if (Math.abs(deltaNum) >= 0.5) {
        listDom.scrollTop += deltaNum
      }
      steward.pos = listDom.scrollTop
      steward.written = listDom.scrollTop
    }
    viewport.recompute(steward.pos)
  }

  return {
    async oninit({ attrs }) {
      isDestroyedBool = false
      resizeObserver = new ResizeObserver(() => {
        if (!listDom || isDestroyedBool) {
          return
        }
        const oldHeightNum = viewport.height
        const oldWidthNum = viewport.width
        viewport.height = listDom.clientHeight
        viewport.width = listDom.clientWidth
        viewport.sticky = headerDom ? headerDom.offsetHeight : 0
        const heightsChangedBool = steward.measure()
        const oldTopPadNum = viewport.topPad
        const oldBottomPadNum = viewport.bottomPad
        viewport.padsOnly()

        if (viewport.height !== oldHeightNum) {
          viewport.recompute(steward.pos)
        }
        if (heightsChangedBool) {
          steward.regulate(true)
        }
        const compactChangedBool = (viewport.width > 0 && viewport.width < COMPACT_WIDTH) !== (oldWidthNum > 0 && oldWidthNum < COMPACT_WIDTH)
        if (compactChangedBool || viewport.topPad !== oldTopPadNum || viewport.bottomPad !== oldBottomPadNum) {
          m.redraw()
        }
      })

      activeListIdNum = attrs.chatList.id
      try {
        chatData.initChatLists(activeListIdNum)
        await chatData.chatLists[activeListIdNum].pull(0)
        if (!isDestroyedBool) {
          chatData.getHistoryList(activeListIdNum)
          m.redraw()
        }
      } catch (err) {
        console.error("[ChatList] 初始化拉取失败", err)
      }
    },

    onremove() {
      isDestroyedBool = true
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      steward.clearTimers()
      steward.clear()
      ledger.clear()
      listDom = null
      headerDom = null
      sentinelDom = null
    },

    view({ attrs }) {
      const chatList = attrs.chatList
      const listIdNum = chatList.id
      const session = chatData.getSessionState(listIdNum)

      viewport.sticky = headerDom ? headerDom.offsetHeight : 0
      viewport.height = listDom ? listDom.clientHeight : 0
      viewport.width = listDom ? listDom.clientWidth : 0
      const isCompactBool = Boolean(window.Mob) || (viewport.width > 0 && viewport.width < COMPACT_WIDTH)

      syncData(chatList)
      viewport.recompute(steward.pos)

      viewport.activeUser = ledger.userIndexAt(Math.max(0, steward.pos - viewport.sticky))
      const activeUserChat = viewport.activeUser < 0 ? null : ledger.groups[viewport.activeUser].chats[0]

      const renderActiveUserPill = () => activeUserChat
        ? m(
          IconTag,
          {
            iconName: "Message",
            isBtn: true,
            bgColor: "transparent",
            fgColor: getColor("消息列表前景"),
            iconConfig: { size: `${getSize(5)}rem` },
            styleExt: {
              pointerEvents: "auto",
              width: "fit-content",
              maxWidth: isCompactBool ? "100%" : `${getSize(50)}rem`,
              minWidth: 0,
              margin: 0,
              background: "transparent",
              border: "none",
              boxShadow: "none",
              color: getColor("消息列表前景"),
              fontSize: `${getSize(4)}rem`,
              display: "flex",
              alignItems: "center",
              gap: `${getSize(1)}rem`,
              cursor: "pointer",
              textAlign: "left"
            },
            ext: {
              title: trs("通用/点击跳转", { cn: "点击跳转至该消息", en: "Click to jump to this message" }),
              onclick() {
                if (!listDom) {
                  return
                }
                session.isAtBottom = false
                listDom.scrollTo({
                  top: Math.max(0, ledger.offsets[viewport.activeUser] + viewport.sticky - 50),
                  behavior: "auto"
                })
              }
            }
          },
          [
            m(
              "span",
              {
                style: {
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: 1,
                  minWidth: 0
                }
              },
              activeUserChat.content
                ? (activeUserChat.content.length > 100 ? activeUserChat.content.slice(0, 100) + "..." : activeUserChat.content)
                : ""
            )
          ]
        )
        : null

      return m(
        "",
        {
          style: {
            flex: 1,
            borderRadius: `${getSize(8)}rem`,
            //background: getColor("消息列表背景") + "99",
            //border: `${getSize(0.25)}rem solid ${getColor("main").back}`,
            position: "relative",
            height: "100%",
            overflow: "hidden"
          }
        },
        [
          m(
            "style",
            `
              .chatList::-webkit-scrollbar {
                width: 0;
                height: 0;
              }
            `
          ),

          m(
            ".chatList",
            {
              "data-list-id": listIdNum,
              style: {
                height: "100%",
                width: "100%",
                overflowY: "auto",
                overflowAnchor: "none"
              },
              async onscroll(e) {
                e.redraw = false
                const dom = e.target
                const oldScrollTopNum = steward.pos
                const oldIsAtBottomBool = session.isAtBottom
                steward.pos = dom.scrollTop

                if (Math.abs(steward.pos - steward.written) > 1) {
                  if (steward.pos < oldScrollTopNum - 1) {
                    session.isAtBottom = false
                  } else if (chatData.checkDomScrollAtBottom(listIdNum)) {
                    session.isAtBottom = true
                  }
                  steward.lastUserAt = Date.now()
                  clearTimeout(steward.settleTimer)
                  steward.settleTimer = setTimeout(() => {
                    if (isDestroyedBool) {
                      return
                    }
                    viewport.recompute(steward.pos)
                    steward.sample()
                    m.redraw()
                  }, SETTLE_MS)
                  steward.sample()

                  if (session.isAtBottom && session.unreadCount > 0) {
                    session.unreadCount = 0
                    try {
                      await chatData.chatLists[listIdNum].pull(0)
                      if (!isDestroyedBool) {
                        chatData.getHistoryList(listIdNum)
                        m.redraw()
                        chatData.scrollChatListTobottom(listIdNum)
                      }
                    } catch (err) {
                      console.error("[ChatList] 回到底部补拉最新失败", err)
                    }
                  }
                }

                const oldStartNum = viewport.start
                const oldEndNum = viewport.end
                viewport.recompute(steward.pos)
                const nextActiveUserNum = ledger.userIndexAt(Math.max(0, steward.pos - viewport.sticky))
                if (
                  viewport.start !== oldStartNum
                  || viewport.end !== oldEndNum
                  || (steward.pos > 200) !== (oldScrollTopNum > 200)
                  || nextActiveUserNum !== viewport.activeUser
                  || session.isAtBottom !== oldIsAtBottomBool
                ) {
                  m.redraw()
                }
                viewport.activeUser = nextActiveUserNum
              },
              oncreate(v) {
                listDom = v.dom
                viewport.height = v.dom.clientHeight
                viewport.width = v.dom.clientWidth
                steward.pos = v.dom.scrollTop
                session.chatListDom = v.dom
                resizeObserver.observe(v.dom)
                scheduleLoadPages()
                steward.initTimer1 = setTimeout(() => {
                  if (isDestroyedBool || !listDom) {
                    return
                  }
                  listDom.scrollTop = listDom.scrollHeight
                  steward.pos = listDom.scrollTop
                  steward.written = listDom.scrollTop
                  steward.initTimer2 = setTimeout(() => {
                    if (isDestroyedBool || !listDom) {
                      return
                    }
                    listDom.scrollTop = listDom.scrollHeight
                    steward.pos = listDom.scrollTop
                    steward.written = listDom.scrollTop
                    viewport.recompute(steward.pos)
                    steward.sample()
                    m.redraw()
                  }, 100)
                }, 0)
              },
              onupdate(v) {
                listDom = v.dom
                session.chatListDom = v.dom
                const beforeStartNum = viewport.start
                const beforeEndNum = viewport.end
                steward.regulate()
                if (viewport.start !== beforeStartNum || viewport.end !== beforeEndNum) {
                  m.redraw()
                }
                scheduleLoadPages()
              },
              onremove() {
                if (listDom && resizeObserver) {
                  resizeObserver.unobserve(listDom)
                }
                if (chatData.getSessionState(listIdNum).chatListDom === listDom) {
                  chatData.getSessionState(listIdNum).chatListDom = null
                }
              }
            },
            [
              // 顶部渐变淡出蒙层
              m(
                "",
                {
                  style: {
                    position: "sticky",
                    top: `${getSize(0)}rem`,
                    left: `${getSize(0)}rem`,
                    width: "100%",
                    height: `${getSize(24)}rem`,
                    marginBottom: `-${getSize(24)}rem`,
                    background: `linear-gradient(to bottom, ${getColor("消息列表背景")} 0%, ${getColor("消息列表背景")}cc 45%, ${getColor("消息列表背景")}00 100%)`,
                    WebkitMaskImage: `linear-gradient(to right, transparent 0%, #000 ${getSize(6)}rem, #000 calc(100% - ${getSize(6)}rem), transparent 100%)`,
                    maskImage: `linear-gradient(to right, transparent 0%, #000 ${getSize(6)}rem, #000 calc(100% - ${getSize(6)}rem), transparent 100%)`,
                    pointerEvents: "none",
                    zIndex: 5
                  }
                }
              ),

              // 顶部起始留白：防止翻到最顶时首条消息被悬浮顶栏遮挡
              m(
                "",
                {
                  style: {
                    height: `${getSize(10)}rem`,
                    overflowAnchor: "none"
                  }
                }
              ),

              // 消息流：顶部占位条 + 渲染窗口 + 末尾哨兵 + 底部占位条
              m(
                "",
                [
                  m(
                    "",
                    {
                      style: {
                        height: `${viewport.topPad}px`,
                        overflowAnchor: "none"
                      },
                      oncreate(v) {
                        if (resizeObserver) {
                          resizeObserver.observe(v.dom)
                        }
                      },
                      onremove(v) {
                        if (v.dom && resizeObserver) {
                          resizeObserver.unobserve(v.dom)
                        }
                      }
                    }
                  ),

                  m(
                    "",
                    [
                      ...ledger.groups.slice(viewport.start, viewport.end + 1).map((group, offsetInViewNum) => {
                        const keyStr = getGroupKey(group)
                        let childrenArr = group.chats.map(chat => m(ChatItem, {
                          key: chat.uuid,
                          chat,
                          listId: attrs.listId
                        }))
                        if (group.isTaskProcess) {
                          childrenArr = [
                            m(TaskProcessGroup, {
                              groups: group.processGroups,
                              listId: attrs.listId,
                              isReplying: Boolean(chatList.replying) && viewport.start + offsetInViewNum === ledger.latestProcess
                            })
                          ]
                        } else if (group.toolCallGroupId) {
                          childrenArr = [
                            m(ToolCallGroup, {
                              key: group.toolCallGroupId,
                              chats: group.chats
                            })
                          ]
                        } else if (group.chats[0].isPlaceholder) {
                          childrenArr = [
                            m(
                              "",
                              {
                                style: {
                                  position: "relative",
                                  height: `${ESTIMATED_HEIGHT}px`,
                                  overflowAnchor: "none"
                                }
                              },
                              m(
                                "span",
                                {
                                  style: {
                                    position: "absolute",
                                    left: "50%",
                                    top: "50%",
                                    transform: "translate(-50%, -50%)",
                                    whiteSpace: "nowrap",
                                    background: getColor("gray_3").back,
                                    color: getColor("gray_3").front,
                                    padding: `${getSize(1)}rem ${getSize(3)}rem`,
                                    borderRadius: `${getSize(8)}rem`,
                                    fontSize: `${getSize(3)}rem`,
                                    animation: "pulse 1.5s infinite"
                                  }
                                },
                                trs("通用/加载中", { cn: "加载中...", en: "Loading..." })
                              )
                            )
                          ]
                        }
                        return m(
                          "",
                          {
                            key: keyStr,
                            "data-id": keyStr,
                            oncreate({ dom }) {
                              steward.doms[keyStr] = dom
                              if (resizeObserver) {
                                resizeObserver.observe(dom)
                              }
                            },
                            onremove({ dom }) {
                              if (steward.doms[keyStr] === dom) {
                                delete steward.doms[keyStr]
                              }
                              if (resizeObserver) {
                                resizeObserver.unobserve(dom)
                              }
                            }
                          },
                          childrenArr
                        )
                      }),

                      // 末尾哨兵：保证最后一项也能通过相邻兄弟 offsetTop 差测得含间距高度
                      m(
                        "",
                        {
                          key: "__sentinel__",
                          style: {
                            height: SENTINEL_HEIGHT,
                            overflowAnchor: "none"
                          },
                          oncreate(v) {
                            sentinelDom = v.dom
                            if (resizeObserver) {
                              resizeObserver.observe(v.dom)
                            }
                          },
                          onremove(v) {
                            if (v.dom && resizeObserver) {
                              resizeObserver.unobserve(v.dom)
                            }
                            if (sentinelDom === v.dom) {
                              sentinelDom = null
                            }
                          }
                        }
                      )
                    ]
                  ),

                  m(
                    "",
                    {
                      style: {
                        height: `${viewport.bottomPad}px`,
                        overflowAnchor: "none"
                      },
                      oncreate(v) {
                        if (resizeObserver) {
                          resizeObserver.observe(v.dom)
                        }
                      },
                      onremove(v) {
                        if (v.dom && resizeObserver) {
                          resizeObserver.unobserve(v.dom)
                        }
                      }
                    }
                  )
                ]
              ),

              // 尾部常驻节点：流式回复气泡
              chatList.replying
                ? m(ChatItem, {
                  chat: {
                    group: "preparing",
                    content: chatList.streamDisplayContent || chatList.streamChunks,
                    reasoning: chatList.streamReasoningChunks,
                    timestamp: Date.now()
                  },
                  listId: attrs.listId,
                  oncreate(v) {
                    if (resizeObserver) {
                      resizeObserver.observe(v.dom)
                    }
                  },
                  onremove(v) {
                    if (v.dom && resizeObserver) {
                      resizeObserver.unobserve(v.dom)
                    }
                  }
                })
                : null,

              // 尾部常驻节点：待确认审批框
              chatList.confirmCmds
                ? chatList.confirmCmds
                  .filter(confirmCmd => confirmCmd.confirm === "pending")
                  .map(confirmCmd => m(ChatConfirm, {
                    confirmCmd,
                    chatList,
                    oncreate(v) {
                      if (resizeObserver) {
                        resizeObserver.observe(v.dom)
                      }
                    },
                    onremove(v) {
                      if (v.dom && resizeObserver) {
                        resizeObserver.unobserve(v.dom)
                      }
                    }
                  }))
                : null
            ]
          ),

          // 顶部统一悬浮栏（空白处穿透点击，滚动时覆盖下方消息，桌面单行 / 移动端双行自适应）
          m(
            "",
            {
              style: {
                position: "absolute",
                top: `${getSize(0)}rem`,
                left: `${getSize(0)}rem`,
                right: `${getSize(0)}rem`,
                zIndex: 20,
                pointerEvents: "none",
                padding: `${getSize(2)}rem`,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(1)}rem`
              },
              oncreate(v) {
                headerDom = v.dom
                if (resizeObserver) {
                  resizeObserver.observe(v.dom)
                }
              },
              onremove(v) {
                if (v.dom && resizeObserver) {
                  resizeObserver.unobserve(v.dom)
                }
                if (headerDom === v.dom) {
                  headerDom = null
                }
              }
            },
            [
              m(
                "",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: `${getSize(1)}rem`,
                    minWidth: 0
                  }
                },
                [
                  // 第一行：主/子会话图标 + 悬浮提问气泡
                  m(
                    "",
                    {
                      style: isCompactBool
                        ? {
                          display: "flex",
                          alignItems: "center",
                          gap: `${getSize(2)}rem`,
                          minWidth: 0
                        }
                        : {
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
                          alignItems: "center",
                          minWidth: 0
                        }
                    },
                    [
                  // 左侧主/子会话图标按钮（主会话为正圆列表按钮；子会话为外层胶囊包裹正圆返回按钮 + 会话编号）
                  m(
                    "",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        flexShrink: 0
                      }
                    },
                    listIdNum === 0
                      ? m(
                          Box,
                          {
                            isBtn: true,
                            style: {
                              pointerEvents: "auto",
                              flexShrink: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: `${getSize(11)}rem`,
                              height: `${getSize(11)}rem`,
                              background: getColor("main").back,
                              color: getColor("main").front,
                              padding: 0,
                              margin: 0,
                              borderRadius: "50%",
                              boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0,0,0,0.08)`
                            },
                            ext: {
                              title: trs("通用/消息列表", { cn: "消息列表", en: "Message List" })
                            },
                            async onclick() {
                              const hostListIdNum = attrs.listId
                              chatData.getSessionState(hostListIdNum).lockedListId = null
                              try {
                                await settingData.fnCall("updateListConfig", [hostListIdNum, { lockedListId: null }])
                              } catch (err) {
                                console.error("[ChatList] 取消锁定子会话失败", err)
                              }
                              m.redraw()
                            }
                          },
                          m(
                            "span",
                            {
                              style: {
                                display: "flex",
                                alignItems: "center"
                              }
                            },
                            m.trust(window.iconPark.getIcon(
                              "ListTwo",
                              {
                                fill: getColor("main").front,
                                size: `${getSize(5)}rem`
                              }
                            ))
                          )
                        )
                      : m(
                          "",
                          {
                            style: {
                              pointerEvents: "auto",
                              flexShrink: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: `${getSize(1)}rem`,
                              padding: `${getSize(1)}rem`,
                              borderRadius: `${getSize(8)}rem`,
                              background: getColor("gray_3").back,
                              color: getColor("gray_3").front,
                              boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0,0,0,0.08)`
                            }
                          },
                          [
                            m(
                              Box,
                              {
                                isBtn: true,
                                style: {
                                  flexShrink: 0,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: `${getSize(9)}rem`,
                                  height: `${getSize(9)}rem`,
                                  background: getColor("main").back,
                                  color: getColor("main").front,
                                  padding: 0,
                                  margin: 0,
                                  borderRadius: "50%"
                                },
                                ext: {
                                  title: `${trs("通用/返回上一级", { cn: "返回上一级", en: "Back to Parent" })}(${trs("通用/子会话", { cn: "子会话", en: "Sub Session" })} ${listIdNum})`
                                },
                                async onclick() {
                                  const hostListIdNum = attrs.listId
                                  chatData.getSessionState(hostListIdNum).lockedListId = null
                                  try {
                                    await settingData.fnCall("updateListConfig", [hostListIdNum, { lockedListId: null }])
                                  } catch (err) {
                                    console.error("[ChatList] 取消锁定子会话失败", err)
                                  }
                                  m.redraw()
                                }
                              },
                              m(
                                "span",
                                {
                                  style: {
                                    display: "flex",
                                    alignItems: "center"
                                  }
                                },
                                m.trust(window.iconPark.getIcon(
                                  "Return",
                                  {
                                    fill: getColor("main").front,
                                    size: `${getSize(5)}rem`
                                  }
                                ))
                              )
                            ),
                            m(
                              "span",
                              {
                                style: {
                                  paddingRight: `${getSize(2)}rem`,
                                  fontSize: `${getSize(3)}rem`,
                                  whiteSpace: "nowrap"
                                }
                              },
                              `#${listIdNum}`
                            )
                          ]
                        )
                  ),

                  // 悬浮提问气泡（紧跟图标，窄屏同样显示）
                  m(
                    "",
                    {
                      style: {
                        minWidth: 0,
                        maxWidth: "100%",
                        display: "flex",
                        justifyContent: "center"
                      }
                    },
                    renderActiveUserPill()
                  ),
                  !isCompactBool
                    ? m(
                      "",
                      {
                        style: {
                          minWidth: 0,
                          display: "flex",
                          justifyContent: "flex-end"
                        }
                      },
                      m(ChatTasks, { chatList, isCompact: isCompactBool })
                    )
                    : null
                    ]
                  ),

                  // 窄屏第二行：任务与笔记并排（右对齐）
                  isCompactBool
                    ? m(
                      "",
                      {
                        style: {
                          minWidth: 0,
                          display: "flex",
                          justifyContent: "flex-end"
                        }
                      },
                      m(ChatTasks, { chatList, isCompact: isCompactBool })
                    )
                    : null
                ]
              ),

            ]
          ),

          // 自绘滚动条（不传回调，数据与状态对象直接传入）
          m(ChatListScrollBar, {
            listId: listIdNum,
            getGroupKey,
            ledger,
            steward,
            viewport,
            total: chatData.chatLists[listIdNum] ? (chatData.chatLists[listIdNum].allCount || ledger.groups.length) : ledger.groups.length,
            index: ledger.groups[viewport.start] ? ledger.groups[viewport.start].startIndex : 0,
            scrollTop: steward.pos,
            visibleRatio: listDom && listDom.scrollHeight > 0 ? viewport.height / listDom.scrollHeight : 1,
            maxScrollTop: listDom ? Math.max(0, listDom.scrollHeight - viewport.height) : 0
          }),

          // 回到底部按钮
          !session.isAtBottom
            ? m(
              "",
              {
                style: {
                  position: "absolute",
                  bottom: `${getSize(4)}rem`,
                  right: `${getSize(4)}rem`,
                  width: `${getSize(8)}rem`,
                  height: `${getSize(8)}rem`,
                  borderRadius: `${getSize(8)}rem`,
                  zIndex: 100,
                  background: session.unreadCount > 0
                    ? getColor("yellow_1").back
                    : getColor("main").back,
                  color: session.unreadCount > 0
                    ? getColor("yellow_1").front
                    : getColor("main").front,
                  opacity: isHoveredBottomBool ? 1 : 0.85,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 ${getSize(1)}rem ${getSize(4)}rem rgba(0,0,0,0.15)`,
                  animation: "fadeIn 0.2s ease",
                  transition: "opacity 0.2s ease"
                },
                onmouseenter() {
                  isHoveredBottomBool = true
                },
                onmouseleave() {
                  isHoveredBottomBool = false
                },
                async onclick(e) {
                  e.stopPropagation()
                  const hadUnreadBool = session.unreadCount > 0
                  session.isAtBottom = true
                  session.unreadCount = 0
                  isHoveredBottomBool = false
                  if (hadUnreadBool) {
                    try {
                      await chatData.chatLists[listIdNum].pull(0)
                      if (!isDestroyedBool) {
                        chatData.getHistoryList(listIdNum)
                        m.redraw()
                        chatData.scrollChatListTobottom(listIdNum)
                      }
                    } catch (err) {
                      console.error("[ChatList] 回到底部补拉最新失败", err)
                    }
                    return
                  }
                  if (listDom) {
                    chatData.scrollChatListTobottom(listIdNum)
                  }
                }
              },
              [
                m.trust(window.iconPark.getIcon("Down", {
                  size: `${getSize(5)}rem`,
                  fill: session.unreadCount > 0 ? getColor("yellow_1").front : getColor("main").front
                })),
                session.unreadCount > 0
                  ? m(
                    "",
                    {
                      style: {
                        position: "absolute",
                        top: `-${getSize(1)}rem`,
                        right: `-${getSize(1)}rem`,
                        background: getColor("red_1").back,
                        color: getColor("red_1").front,
                        fontSize: `${getSize(3)}rem`,
                        padding: `${getSize(0)}rem ${getSize(1)}rem`,
                        height: `${getSize(4)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0,0,0,0.08)`,
                        minWidth: `${getSize(4)}rem`,
                        textAlign: "center"
                      }
                    },
                    session.unreadCount > 99 ? "99+" : session.unreadCount
                  )
                  : null
              ]
            )
            : null,

          // 回到顶部按钮
          steward.pos > 200
            ? m(
              "",
              {
                style: {
                  position: "absolute",
                  bottom: `${getSize(14)}rem`,
                  right: `${getSize(4)}rem`,
                  width: `${getSize(7)}rem`,
                  height: `${getSize(7)}rem`,
                  borderRadius: `${getSize(8)}rem`,
                  zIndex: 100,
                  background: getColor("gray_3").back,
                  color: getColor("gray_3").front,
                  opacity: isHoveredTopBool ? 1 : 0.85,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 ${getSize(1)}rem ${getSize(4)}rem rgba(0,0,0,0.15)`,
                  animation: "fadeIn 0.2s ease",
                  transition: "opacity 0.2s ease"
                },
                onmouseenter() {
                  isHoveredTopBool = true
                },
                onmouseleave() {
                  isHoveredTopBool = false
                },
                onclick(e) {
                  e.stopPropagation()
                  if (!listDom) {
                    return
                  }
                  session.isAtBottom = false
                  listDom.scrollTop = 0
                }
              },
              [
                m.trust(window.iconPark.getIcon("Up", {
                  size: `${getSize(4)}rem`,
                  fill: getColor("gray_3").front
                }))
              ]
            )
            : null
        ]
      )
    }
  }
}
