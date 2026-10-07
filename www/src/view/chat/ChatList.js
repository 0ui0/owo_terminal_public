// 消息列表（虚拟滚动）
//
// 一句话：只渲染视口上下各几条，其余用上下两条「占位条」撞出来。
//
// 三条铁律：
//   1. 每一帧画哪一段，按当前滚动位置算（否则卡片与视口脱节 = 整片空白）
//   2. 测到的高度只写账本，不反过来决定「画哪一段」（否则量一张滑一次窗 = 连环拉页）
//   3. 全文件只有「管家」能改滚动位置（贴底 / 锚点复位 / 兜底，三选一）
//
// 三块状态：账本（高度与索引）、视口（渲染范围与上下占位条）、管家（滚动位置唯一写入者）

import chatData from "./chatData.js"
import comData from "../../comData/comData.js"
import settingData from "../setting/settingData.js"
import ChatItem from "./ChatItem.js"
import ChatTasks from "./ChatTasks.js"
import ChatConfirm from "./ChatConfirm.js"
import ToolCallGroup from "./ToolCallGroup.js"
import TaskProcessGroup from "./TaskProcessGroup.js"
import Box from "../common/box.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"
import ChatListScrollBar from "./ChatListScrollBar.js"

const BUFFER_ITEMS = 8 // 渲染窗口上下各多渲染几项，避免滚动时露白
const ESTIMATED_HEIGHT = 100 // 未渲染项的默认估算高度（含项与项之间的间距）
const SENTINEL_HEIGHT = "0.1rem" // 末尾哨兵必须非零，否则最后一项的间距会被外边距折叠吃掉
const SEED_SAMPLES = 10
const SEED_MIN = 60
const SEED_MAX = 600
const GESTURE_MS = 300 // 用户手势静默期：这段时间内不做反向补偿
const SETTLE_MS = 320 // 手势停下多久后补一次静态对齐
const MIN_VIEW_HEIGHT = 600 // 视口高度还拿不到时按一屏算

// ========== 一、纯函数区（不碰状态） ==========

// 分组键：任务过程组用自身 id 加首条 uuid，工具组用组号加首条 uuid，其余用消息 uuid（绝对物理稳定，且彻底防重）
const getGroupKey = (group) => group.isTaskProcess
  ? `${group.id}_${group.chats[0].uuid}`
  : group.toolCallGroupId
    ? `${group.toolCallGroupId}_${group.chats[0].uuid}`
    : group.chats[0].uuid

// 通信角色：优先标准契约 role，其次兼容旧的 group 字段
const getMsgRole = (chat) => {
  const role = chat?.ask?.role || chat?.role
  if (role) {
    return role
  }
  if (chat?.group === "user") {
    return "user"
  }
  if (chat?.group === "agent") {
    return "assistant"
  }
  if (chat?.group === "tip") {
    return "tool"
  }
  return "system"
}

const hasToolCalls = (chat) => !!(chat?.toolCalls?.length || chat?.ask?.toolCalls?.length || chat?.ask?.tool_call_id)

// 过程标识：本轮任务的统一编号，后端在触发大模型前生成并随消息落库
const getProcId = (chat) => chat?.procId || chat?.ask?.procId || null

// 最终回复：本轮的最后一条常规回答，它必须留在折叠条之外单独展示
const isFinalReplyGroup = (group) => !group.toolCallGroupId
  && getMsgRole(group.chats[0]) === "assistant"
  && !hasToolCalls(group.chats[0])

// 把消息数组编译成分组数组：先按 toolCallGroupId 聚合，再把「用户提问到最终回复之间」的执行过程包成宏观折叠组
const buildGroups = (listData) => {
  const rawGroups = []
  let currentToolCallGroup = null
  listData.forEach((chat, index) => {
    const toolCallGroupId = chat.ask?.toolCallGroupId
    if (toolCallGroupId) {
      if (currentToolCallGroup && currentToolCallGroup.toolCallGroupId === toolCallGroupId) {
        currentToolCallGroup.chats.push(chat)
      } else {
        currentToolCallGroup = { startIndex: index, toolCallGroupId, chats: [chat] }
        rawGroups.push(currentToolCallGroup)
      }
    } else {
      currentToolCallGroup = null
      rawGroups.push({ startIndex: index, toolCallGroupId: null, chats: [chat] })
    }
  })

  const groups = []
  let i = 0
  while (i < rawGroups.length) {
    const group = rawGroups[i]

    // procId 过程簇：同一轮任务的过程消息打包折叠，最终回复始终留在外层
    const procId = getProcId(group.chats[0])
    if (procId && !isFinalReplyGroup(group)) {
      const processGroups = []
      while (i < rawGroups.length && getProcId(rawGroups[i].chats[0]) === procId) {
        processGroups.push(rawGroups[i])
        i++
      }
      // 组内最后一条 AI 消息就是本轮成品：把它以及它之后的消息（收尾提示等）全部挪出组外，
      // 即便它们依然带着同一个事务 id，也不该被折叠条吃掉
      let tailStart = -1
      for (let k = processGroups.length - 1; k >= 0; k--) {
        if (getMsgRole(processGroups[k].chats[0]) === "assistant") {
          tailStart = k
          break
        }
      }
      const tailGroups = tailStart < 0 ? [] : processGroups.splice(tailStart)
      const hasTools = processGroups.some(tg => tg.toolCallGroupId || tg.chats.some(c => getMsgRole(c) === "tool" || hasToolCalls(c)))
      if (hasTools) {
        groups.push({
          isTaskProcess: true,
          startIndex: processGroups[0].startIndex,
          processGroups,
          id: "proc_" + procId,
          chats: [processGroups[0].chats[0]]
        })
      } else {
        processGroups.forEach(tg => groups.push(tg))
      }
      tailGroups.forEach(tg => groups.push(tg))
      continue
    }

    // 无 procId 的普通消息、历史消息、最终回复，100% 纯净原样平铺
    groups.push(group)
    i++
  }
  return groups
}

// 通用二分：在升序序列里找「最后一个值 ≤ 目标」的下标，找不到返回 -1
const findLastIndex = (length, value, valueAt) => {
  let low = 0
  let high = length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (valueAt(mid) <= value) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

export default () => {
  // 组件级句柄与当前会话
  let activeListId = 0
  let listDom = null
  let tasksEl = null
  let boxEl = null
  let sentinelDom = null
  let resizeObserver = null
  let dataSignature = ""
  let lastMessageCount = 0
  let isHovered = false
  let isHoveredTop = false
  let scheduleLoadPages = null // 在下面赋值；先声明以满足「从上到下」的阅读顺序

  // ========== 二、账本：高度表 + 估算 + 前缀和 + 双向索引 ==========
  const ledger = {
    groups: [], // 分组数组（重建账本时一起换）
    offsets: [], // 前缀和：offsets[i] = 前 i 项合计高度
    heights: {}, // 分组键 → 实测占位高度（含项与项之间的间距）
    userGroups: [], // 我方提问组的数组下标
    latestProcess: -1, // 最后一个任务过程组的下标
    seedSum: 0,
    seedCount: 0,
    estimated: ESTIMATED_HEIGHT,

    // 未测项的估算：占位符按骨架屏自身高度，真消息按取样均值
    estimate(group) {
      return group.chats[0].isPlaceholder ? ESTIMATED_HEIGHT : this.estimated
    },

    // 只拿真消息取样；量够 SEED_SAMPLES 条就把均值冻住，免得估算值一直在变把总高撞得乱跳
    seed(advance) {
      if (this.seedCount >= SEED_SAMPLES) {
        return
      }
      this.seedSum += advance
      this.seedCount++
      if (this.seedCount === SEED_SAMPLES) {
        this.estimated = Math.min(Math.max(this.seedSum / this.seedCount, SEED_MIN), SEED_MAX)
      }
    },

    // 重建前缀和（只重建脏后缀；滚动过程中不重建）
    rebuild(fromIndex) {
      let sum = fromIndex === 0 ? 0 : this.offsets[fromIndex]
      for (let i = fromIndex; i < this.groups.length; i++) {
        this.offsets[i] = sum
        sum += this.heights[getGroupKey(this.groups[i])] || this.estimate(this.groups[i])
      }
      this.offsets[this.groups.length] = sum
    },

    // 内容坐标 → 分组下标
    indexAt(contentTop) {
      return Math.max(0, findLastIndex(this.groups.length, contentTop, (i) => this.offsets[i]))
    },

    // 首条消息下标 → 分组下标（分组结构变了锚点依旧有效，找不到返回 -1）
    indexAtFlat(flatIndex) {
      return findLastIndex(this.groups.length, flatIndex, (i) => this.groups[i].startIndex)
    },

    // 内容坐标 → 上方最近的我方提问组下标（找不到返回 -1）
    userIndexAt(contentTop) {
      const k = findLastIndex(this.userGroups.length, contentTop, (i) => this.offsets[this.userGroups[i]])
      return k < 0 ? -1 : this.userGroups[k]
    },

    // 首条消息下标 → 上方最近的我方提问是「第几条提问」（0 起，找不到返回 -1）
    // 更早的历史还没加载时没有提问信息（占位符不带身份），所以目录只覆盖已加载的部分
    userSlotAtFlat(flatIndex) {
      return findLastIndex(this.userGroups.length, flatIndex, (i) => this.groups[this.userGroups[i]].startIndex)
    },

    // 换一份账本（数据重建时用）
    load(listData) {
      this.groups = buildGroups(listData)
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

    // 清空（切会话时用）
    clear() {
      for (const key in this.heights) delete this.heights[key]
      this.groups = []
      this.offsets = []
      this.userGroups = []
      this.latestProcess = -1
      this.seedSum = 0
      this.seedCount = 0
      this.estimated = ESTIMATED_HEIGHT
    }
  }

  let steward = null // 在下面赋值；先声明以满足「从上到下」的阅读顺序

  // ========== 三、视口：渲染范围与上下占位条 ==========
  const viewport = {
    start: 0,
    end: -1,
    topPad: 0,
    bottomPad: 0,
    height: 0,
    sticky: 0,
    activeUser: -1, // 悬浮提问条目标

    // 上下占位条：跟着账本走，范围不变时只重算这个
    padsOnly() {
      if (this.end < this.start) {
        this.topPad = 0
        this.bottomPad = 0
        return
      }
      this.topPad = ledger.offsets[this.start]
      this.bottomPad = ledger.offsets[ledger.groups.length] - ledger.offsets[this.end + 1]
    },

    // 铁律 1：每一帧绘制都按当前滚动位置锁定渲染范围
    recompute() {
      if (ledger.groups.length === 0) {
        this.start = 0
        this.end = -1
        this.padsOnly()
        return
      }
      const contentTop = Math.max(0, steward.pos - this.sticky)
      const firstIndex = ledger.indexAt(contentTop)
      const lastIndex = ledger.indexAt(contentTop + Math.max(this.height, MIN_VIEW_HEIGHT))
      this.start = Math.max(0, firstIndex - BUFFER_ITEMS)
      this.end = Math.min(ledger.groups.length - 1, Math.max(lastIndex, firstIndex) + BUFFER_ITEMS)
      // 绝不用空数组渲染：宁可多画一屏，也绝不让列表留白
      if (this.end < this.start) {
        this.end = Math.min(ledger.groups.length - 1, this.start + BUFFER_ITEMS * 2)
      }
      this.padsOnly()
    }
  }

  // ========== 四、管家：滚动位置唯一写入者 + 测高 + 拉页 ==========
  steward = {
    pos: 0, // 当前滚动位置（DOM 的事实，存一份供计算）
    written: -1, // 上一次由管家写入的位置：用来区分「用户滚动」与「程序补偿」
    anchorIndex: -1,
    anchorFlat: -1, // 锚点首条消息下标（跨分页稳定）
    anchorOffset: 0, // 锚点顶边相对滚动口顶边的像素距离
    lastUserAt: 0, // 最近一次用户手势时间
    settleTimer: null,
    loadTimer: null,
    fetching: new Set(), // 在途页号（严格单飞：最多一个）
    doms: {}, // 分组键 → 已渲染的 DOM 节点

    // 4.1 测高：用「相邻兄弟的 offsetTop 差」当占位高度（含间距，且不受滚动位置影响）
    measure() {
      let changedFrom = ledger.offsets.length
      for (let i = viewport.start; i <= viewport.end; i++) {
        const group = ledger.groups[i]
        const key = getGroupKey(group)
        const dom = this.doms[key]
        if (!dom) {
          continue
        }
        const nextGroup = ledger.groups[i + 1]
        const nextDom = nextGroup ? this.doms[getGroupKey(nextGroup)] || sentinelDom : sentinelDom
        if (!nextDom || nextDom === dom) {
          continue
        }
        const advance = nextDom.offsetTop - dom.offsetTop
        if (advance <= 0) {
          continue
        }
        if (ledger.heights[key] === advance) {
          continue
        }
        // 只拿真消息当种子：骨架屏本身就是 100px，拿它当种子等于没改进
        if (ledger.heights[key] === undefined && !group.chats[0].isPlaceholder) {
          ledger.seed(advance)
        }
        ledger.heights[key] = advance
        if (i < changedFrom) {
          changedFrom = i
        }
      }
      if (changedFrom < ledger.offsets.length) {
        ledger.rebuild(changedFrom)
        return true
      }
      return false
    },

    // 4.2 采样锚点：先用账本二分直取「视口顶部那一项」，最多再试一项
    sample() {
      if (!listDom || ledger.groups.length === 0) {
        return
      }
      const listRect = listDom.getBoundingClientRect()
      const visibleTop = listRect.top + viewport.sticky
      const index = ledger.indexAt(Math.max(0, this.pos - viewport.sticky))
      for (let step = 0; step < 2; step++) {
        const i = Math.min(Math.max(index + step, viewport.start), viewport.end)
        const dom = this.doms[getGroupKey(ledger.groups[i])]
        if (!dom) {
          continue
        }
        const rect = dom.getBoundingClientRect()
        if (rect.bottom <= visibleTop || rect.top >= listRect.bottom) {
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

    // 4.3 位置修正后，让渲染范围按同样位移跟过去（局部前后挪，不按账本全量推导）
    follow() {
      const contentTop = Math.max(0, this.pos - viewport.sticky)
      let step = 0
      while (viewport.start + step > 0 && ledger.offsets[viewport.start + step] > contentTop) step--
      while (viewport.start + step < ledger.groups.length - 1 && ledger.offsets[viewport.start + step + 1] <= contentTop) step++
      if (step === 0) {
        return
      }
      if (viewport.end + step > ledger.groups.length - 1 || viewport.start + step < 0) {
        return
      }
      viewport.start += step
      viewport.end += step
      viewport.padsOnly()
    },

    // 4.4 全文件唯一的滚动位置写入处：贴底 → 锚点复位 → 兜底
    regulate(force = false) {
      if (!listDom || ledger.groups.length === 0) {
        return
      }

      // 策略一：贴着底部且会话正在回复中才跟随最新内容（AI 打字流跟随；停止时暂停自动拉底，防跟用户滚轮拔河）
      const isReplying = !!comData.getChatList(activeListId)?.replying
      if (isReplying && chatData.chatListScrollAtBottom(activeListId)) {
        listDom.scrollTop = listDom.scrollHeight - listDom.clientHeight
        this.pos = listDom.scrollTop
        this.written = listDom.scrollTop
        this.sample()
        return
      }

      // 除非是由测高明确触发的物理补偿(force)，否则用户手势期间程序不做反向补偿
      if (!force && Date.now() - this.lastUserAt < GESTURE_MS) {
        return
      }

      const anchorDom = this.anchorIndex < 0 ? null : this.doms[getGroupKey(ledger.groups[this.anchorIndex])]
      let moved = false
      if (anchorDom) {
        // 策略二：锚点还在 DOM 里，把它拉回原像素位置（同一把尺子量，最可靠）
        const delta = anchorDom.getBoundingClientRect().top - listDom.getBoundingClientRect().top - this.anchorOffset
        if (Math.abs(delta) >= 0.5) {
          listDom.scrollTop += delta
          moved = true
        }
      }

      if (!moved) {
        return
      }
      this.pos = listDom.scrollTop
      this.written = listDom.scrollTop
      this.follow() // 位置动了，范围必须跟着走，否则视口落到范围外 = 露白
      this.sample()
    },

    // 4.5 清空（切会话时用）
    clear() {
      for (const key in this.doms) delete this.doms[key]
      this.fetching.clear()
      this.pos = 0
      this.written = -1
      this.anchorIndex = -1
      this.anchorFlat = -1
      this.anchorOffset = 0
      viewport.activeUser = -1
    }
  }

  // ---------- 数据同步（数据变了才重建账本） ----------
  function syncData(chatList) {
    const listData = chatData.computedLists[chatList.id] || chatData.list
    const signature = `${listData.length}_${listData[0]?.uuid || ""}_${listData[listData.length - 1]?.uuid || ""}_${Object.keys(chatData.chatLists[chatList.id]?.pages || {}).join(",")}`
    if (signature === dataSignature) {
      return
    }
    if (listData.length < lastMessageCount) {
      // 换了一份数据（文件→新建、导入存档）：旧位置、锚点、阅读锁全丢掉，否则新消息一条都看不见
      ledger.clear()
      steward.clear()
      viewport.start = 0
      viewport.end = -1
      chatData.getSessionState(chatList.id).isAtBottom = true
    }
    lastMessageCount = listData.length
    dataSignature = signature
    // 重建前先记下锚点上方的高度，重建后立刻把差量补回滚动位置，
    // 否则新账本一换就滑到另一批卡片上，会来回加载好几轮才停
    const oldAnchorTop = steward.anchorIndex < 0 ? 0 : ledger.offsets[steward.anchorIndex]
    ledger.load(listData)
    steward.anchorIndex = steward.anchorFlat < 0 ? -1 : ledger.indexAtFlat(steward.anchorFlat)
    if (steward.anchorIndex >= 0 && listDom) {
      const delta = ledger.offsets[steward.anchorIndex] - oldAnchorTop
      if (Math.abs(delta) >= 0.5) {
        listDom.scrollTop += delta
        steward.pos += delta
        steward.written = steward.pos
      } else {
        steward.pos = listDom.scrollTop
        steward.written = listDom.scrollTop
      }
    }
    viewport.recompute()
  }

  // ---------- 拉页（严格单飞） ----------
  scheduleLoadPages = () => {
    clearTimeout(steward.loadTimer)
    steward.loadTimer = setTimeout(loadVisiblePages, 0)
  }

  // 视口里先补（离中心越近越优先），视口里没有就补上方两屏内即将滚到的那一页
  function loadVisiblePages() {
    if (steward.fetching.size > 0) {
      return
    }
    const center = (viewport.start + viewport.end) >> 1
    let target = null
    let prefetch = null
    for (let i = ledger.indexAt(Math.max(0, steward.pos - viewport.sticky - viewport.height * 2)); i <= viewport.end; i++) {
      const chat = ledger.groups[i]?.chats[0]
      if (!chat?.isPlaceholder || chat.pageIndex === undefined) {
        continue
      }
      if (i >= viewport.start) {
        if (target === null || Math.abs(i - center) < Math.abs(target - center)) {
          target = i
        }
      } else if (prefetch === null) {
        prefetch = i
      }
    }
    if (target === null) {
      target = prefetch
    }
    if (target === null) {
      return
    }
    loadPage(ledger.groups[target].chats[0].pageIndex)
  }

  async function loadPage(pageIndex) {
    const listId = activeListId
    steward.fetching.add(pageIndex)
    try {
      await chatData.chatLists[listId].pull(pageIndex)
      chatData.getHistoryList(listId)
      m.redraw()
    } catch (err) {
      console.error("[ChatList] 分页拉取失败", err)
    }
    steward.fetching.delete(pageIndex)
    scheduleLoadPages()
  }

  return {
    async oninit({ attrs }) {
      resizeObserver = new ResizeObserver(() => {
        if (!listDom) {
          return
        }
        const oldHeight = viewport.height
        viewport.height = listDom.clientHeight
        viewport.sticky = (tasksEl ? tasksEl.offsetHeight : 0) + (boxEl ? boxEl.offsetHeight : 0)
        const heightsChanged = steward.measure()
        const oldTop = viewport.topPad
        const oldBottom = viewport.bottomPad
        viewport.padsOnly()
        // 容器尺寸变了是例外：可视范围变了，范围必须重算，否则会露白
        if (viewport.height !== oldHeight) {
          viewport.recompute()
        }
        // 关键：只有在卡片尺寸真正测出变化时，才由测高驱动一次物理位置对冲，平时不干预
        if (heightsChanged) {
          steward.regulate(true)
        }
        if (viewport.topPad !== oldTop || viewport.bottomPad !== oldBottom) {
          m.redraw()
        }
      })

      activeListId = attrs.chatList.id
      try {
        chatData.initChatLists(activeListId)
        await chatData.chatLists[activeListId].pull(0)
        chatData.getHistoryList(activeListId)
        m.redraw()
      } catch (err) {
        console.error("[ChatList] 初始化拉取失败", err)
      }
    },

    onremove() {
      resizeObserver?.disconnect()
      resizeObserver = null
      clearTimeout(steward.loadTimer)
      clearTimeout(steward.settleTimer)
    },

    view({ attrs }) {
      const chatList = attrs.chatList
      const listId = chatList.id
      const session = chatData.getSessionState(listId)

      // 吸顶头会盖住列表顶部，窗口计算要扣掉它
      viewport.sticky = (tasksEl ? tasksEl.offsetHeight : 0) + (boxEl ? boxEl.offsetHeight : 0)
      viewport.height = listDom ? listDom.clientHeight : 0

      // 滚动条与主列表必须用同一把尺子：尾部常驻节点（流式气泡、审批框）与末尾哨兵不进账本，
      // 按账本高度算会让滑块少走最后一截，拖到底还差十几像素
      const barScrollHeight = listDom ? listDom.scrollHeight : 0
      const barMaxScrollTop = Math.max(0, barScrollHeight - viewport.height)
      const barVisibleRatio = barScrollHeight > 0 ? viewport.height / barScrollHeight : 1

      syncData(chatList)
      viewport.recompute()

      viewport.activeUser = ledger.userIndexAt(Math.max(0, steward.pos - viewport.sticky))
      const activeUserChat = viewport.activeUser < 0 ? null : ledger.groups[viewport.activeUser].chats[0]

      return m("", {
        style: {
          flex: 1,
          borderRadius: "3rem",
          background: getColor('消息列表背景') + "99",
          border: `0.1rem solid ${getColor('main').back}`,
          position: "relative",
          height: "100%",
          overflow: "hidden",
        }
      }, [
        m("style", `
          .chatList::-webkit-scrollbar {
            width: 0;
            height: 0;
          }
        `),

        m(".chatList", {
          "data-list-id": chatList.id,
          style: {
            height: "100%",
            width: "100%",
            overflowY: "auto",
            overflowAnchor: "none",
          },
          async onscroll(e) {
            const dom = e.target
            const oldScrollTop = steward.pos
            const oldIsAtBottom = session.isAtBottom
            steward.pos = dom.scrollTop

            // 管家自己写进去的滚动不算用户滚动，否则会把程序补偿误当成阅读意图
            if (Math.abs(steward.pos - steward.written) > 1) {
              // 用户主动上滑就立刻解除贴底，不能等离开 20px 缓冲区
              if (steward.pos < oldScrollTop - 1) {
                session.isAtBottom = false
              } else if (chatData.checkDomScrollAtBottom(listId)) {
                session.isAtBottom = true
              }
              // 手势静默锁：接下来这段时间内程序不做反向补偿（否则会跟滚轮拔河）
              steward.lastUserAt = Date.now()
              // 手势停下后补一次视口对齐，绝不反弹用户滚动的距离
              clearTimeout(steward.settleTimer)
              steward.settleTimer = setTimeout(() => {
                viewport.recompute()
                m.redraw()
              }, SETTLE_MS)
              steward.sample()
              if (session.isAtBottom && session.unreadCount > 0) {
                session.unreadCount = 0
                try {
                  await chatData.chatLists[listId].pull(0)
                  chatData.getHistoryList(listId)
                  m.redraw()
                  chatData.scrollChatListTobottom(listId)
                } catch (err) {
                  console.error("[ChatList] 回到底部补拉最新失败", err)
                }
              }
            }

            // 只有渲染范围、顶部按钮、悬浮条、底部状态真的变了才重绘
            const oldStart = viewport.start
            const oldEnd = viewport.end
            viewport.recompute()
            const nextActiveUser = ledger.userIndexAt(Math.max(0, steward.pos - viewport.sticky))
            if (viewport.start !== oldStart || viewport.end !== oldEnd ||
              (steward.pos > 200) !== (oldScrollTop > 200) ||
              nextActiveUser !== viewport.activeUser ||
              session.isAtBottom !== oldIsAtBottom) m.redraw()
            viewport.activeUser = nextActiveUser
          },
          oncreate(v) {
            listDom = v.dom
            viewport.height = v.dom.clientHeight
            steward.pos = v.dom.scrollTop
            session.chatListDom = v.dom
            resizeObserver?.observe(v.dom)
            scheduleLoadPages()
            // 首次进入停在最新一条：等第一轮实测高度落地后再贴一次底
            setTimeout(() => {
              listDom.scrollTop = listDom.scrollHeight
              steward.pos = listDom.scrollTop
              steward.written = listDom.scrollTop
              setTimeout(() => {
                listDom.scrollTop = listDom.scrollHeight
                steward.pos = listDom.scrollTop
                steward.written = listDom.scrollTop
              }, 100)
            }, 0)
          },
          onupdate(v) {
            listDom = v.dom
            session.chatListDom = v.dom
            // 重绘阶段读 rect 会强制排版，拿到的一定是新位置，修正在同一帧落地
            const beforeStart = viewport.start
            const beforeEnd = viewport.end
            steward.regulate()
            if (viewport.start !== beforeStart || viewport.end !== beforeEnd) {
              m.redraw()
            }
            scheduleLoadPages()
          },
          onremove() {
            if (chatData.getSessionState(listId).chatListDom === listDom) {
              chatData.getSessionState(listId).chatListDom = null
            }
          },
        }, [
          m(ChatTasks, {
            chatList,
            oncreate(v) {
              tasksEl = v.dom
              // 没有在跑的任务时这块不渲染，v.dom 为空，不能拿去观察
              if (tasksEl) {
                resizeObserver?.observe(tasksEl)
              }
            },
            onupdate(v) {
              tasksEl = v.dom
              if (tasksEl) {
                resizeObserver?.observe(tasksEl)
              }
            },
          }),

          m(Box, {
            isBtn: true,
            style: {
              position: "sticky",
              top: "1rem",
              zIndex: 10,
              background: getColor('main').back,
              color: getColor('main').front,
              padding: "0.5rem",
              margin: "0 1rem",
            },
            oncreate(v) {
              boxEl = v.dom
              resizeObserver?.observe(v.dom)
            },
            onupdate(v) {
              boxEl = v.dom
              resizeObserver?.observe(v.dom)
            },
            async onclick() {
              const hostListId = attrs.listId
              chatData.getSessionState(hostListId).lockedListId = null
              try {
                await settingData.fnCall("updateListConfig", [hostListId, { lockedListId: null }])
              } catch (err) {
                console.error("[ChatList] 取消锁定子会话失败", err)
              }
              m.redraw()
            },
          }, [
            chatList?.id === 0
              ? trs("通用/消息列表", { cn: "消息列表", en: "Message List" })
              : `${trs("通用/返回上一级", { cn: "返回上一级", en: "Back to Parent" })}(${trs("通用/子会话", { cn: "子会话", en: "Sub Session" })} ${chatList?.id})`
          ]),

          // 悬浮提问指示条：点击精确跳到该条消息
          activeUserChat ? m("", {
            style: {
              position: "absolute",
              top: "0",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              width: "fit-content",
              maxWidth: "20rem",
              boxSizing: "border-box",
              padding: "0.5rem 1rem",
              margin: "1rem",
              background: getColor('brown_1').back,
              borderRadius: "1rem",
              color: getColor('brown_1').front,
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              boxShadow: "0 0 1rem rgba(0,0,0,0.1)",
              textAlign: "left"
            },
            title: trs("通用/点击跳转", { cn: "点击跳转至该消息", en: "Click to jump to this message" }),
            onclick: () => {
              if (!listDom) {
                return
              }
              // 主动跳跃先解除贴底，否则会被「拉回原位」的修正撤销
              session.isAtBottom = false
              listDom.scrollTo({ top: ledger.offsets[viewport.activeUser] + viewport.sticky - 50, behavior: "auto" })
            }
          }, [
            m("span", { style: { display: "flex", alignItems: "center", marginRight: "0.5rem", flexShrink: 0 } },
              m.trust(window.iconPark.getIcon("Message", { fill: getColor('main').back }))
            ),
            m("span", {
              style: {
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
                minWidth: 0,
                color: getColor('brown_1').front,
              }
            }, activeUserChat.content ? (activeUserChat.content.length > 100 ? activeUserChat.content.slice(0, 100) + "..." : activeUserChat.content) : "")
          ]) : null,

          // 消息流：顶部占位条 + 渲染窗口 + 末尾哨兵 + 底部占位条
          m("", [
            m("", {
              style: { height: `${viewport.topPad}px`, overflowAnchor: "none" },
              oncreate(v) { resizeObserver?.observe(v.dom) },
              onupdate(v) { resizeObserver?.observe(v.dom) },
            }),

            m("", [
              ...ledger.groups.slice(viewport.start, viewport.end + 1).map((group, offsetInView) => {
                const key = getGroupKey(group)
                // 分支里只决定孩子，属性与监听统一写在外层
                let children = group.chats.map(chat => m(ChatItem, { key: chat.uuid, chat, listId: attrs.listId }))
                if (group.isTaskProcess) {
                  children = [
                    m(TaskProcessGroup, {
                      groups: group.processGroups,
                      listId: attrs.listId,
                      isReplying: !!chatList?.replying && viewport.start + offsetInView === ledger.latestProcess
                    })
                  ]
                } else if (group.toolCallGroupId) {
                  children = [
                    m(ToolCallGroup, { key: group.toolCallGroupId, chats: group.chats })
                  ]
                } else if (group.chats[0].isPlaceholder) {
                  children = [
                    m(".placeholder-skeleton", {
                      style: {
                        height: ESTIMATED_HEIGHT + "px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: getColor('main').front + '55',
                        fontSize: "0.8rem",
                        animation: "pulse 1.5s infinite",
                        overflowAnchor: "none"
                      }
                    }, "Loading...")
                  ]
                }
                return m("", {
                  key,
                  "data-id": key,
                  oncreate({ dom }) {
                    steward.doms[key] = dom
                    resizeObserver?.observe(dom)
                  },
                  onremove({ dom }) {
                    if (steward.doms[key] === dom) {
                      delete steward.doms[key]
                    }
                    resizeObserver?.unobserve(dom)
                  },
                }, children)
              }),

              // 末尾哨兵：让最后一项也有「下一个兄弟」，否则它的间距量不出来
              m("", {
                key: "__sentinel__",
                style: { height: SENTINEL_HEIGHT, overflowAnchor: "none" },
                oncreate(v) {
                  sentinelDom = v.dom
                  resizeObserver?.observe(v.dom)
                },
                onremove() {
                  sentinelDom = null
                },
              })
            ]),

            m("", {
              style: { height: `${viewport.bottomPad}px`, overflowAnchor: "none" },
              oncreate(v) { resizeObserver?.observe(v.dom) },
              onupdate(v) { resizeObserver?.observe(v.dom) },
            })
          ]),

          // 尾部常驻节点：只参与观察，不参与账本
          chatList?.replying ? m(ChatItem, {
            chat: {
              group: "preparing",
              content: chatList?.streamDisplayContent || chatList?.streamChunks,
              reasoning: chatList?.streamReasoningChunks,
              timestamp: Date.now(),
            },
            listId: attrs.listId,
            oncreate(v) { resizeObserver?.observe(v.dom) },
            onupdate(v) { resizeObserver?.observe(v.dom) },
          }) : null,

          chatList?.confirmCmds?.filter(confirmCmd => confirmCmd.confirm === "pending").map(confirmCmd => {
            return m(ChatConfirm, {
              confirmCmd,
              chatList,
              oncreate(v) { resizeObserver?.observe(v.dom) },
              onupdate(v) { resizeObserver?.observe(v.dom) },
            })
          })
        ]),

        // 自绘滚动条：平时普通拖拽（不弹窗），长按展开放大镜电视菜单，减速即预拉取
        m(ChatListScrollBar, {
          listId,
          getGroupKey,
          ledger,
          steward,
          viewport,
          total: chatData.chatLists[listId]?.allCount || ledger.groups.length,
          index: ledger.groups[viewport.start] ? ledger.groups[viewport.start].startIndex : 0,
          scrollTop: steward.pos,
          visibleRatio: barVisibleRatio,
          maxScrollTop: barMaxScrollTop,
        }),

        // 回到底部
        !session.isAtBottom ? m(".back-to-bottom", {
          style: {
            position: "absolute",
            bottom: "1.5rem",
            right: "1.5rem",
            width: "2.4rem",
            height: "2.4rem",
            borderRadius: "50%",
            zIndex: 100,
            background: session.unreadCount > 0
              ? (isHovered ? "#FFC107ee" : "#FFC107cc")
              : (isHovered ? getColor('右上角按钮背景') + "ee" : getColor('右上角按钮背景') + "cc"),
            color: getColor('右上角按钮文字'),
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            animation: "fadeIn 0.2s ease",
            backdropFilter: "blur(8px)",
            border: `0.1rem solid ${getColor('右上角按钮文字') + '22'}`,
            transition: "all 0.2s ease",
          },
          onmouseenter() { isHovered = true },
          onmouseleave() { isHovered = false },
          async onclick(e) {
            e.stopPropagation()
            const hadUnread = session.unreadCount > 0
            session.isAtBottom = true
            session.unreadCount = 0
            isHovered = false
            if (hadUnread) {
              try {
                await chatData.chatLists[listId].pull(0)
                chatData.getHistoryList(listId)
                m.redraw()
                chatData.scrollChatListTobottom(listId)
              } catch (err) {
                console.error("[ChatList] 回到底部补拉最新失败", err)
              }
              return
            }
            if (listDom) {
              chatData.scrollChatListTobottom(listId)
            }
          }
        }, [
          m.trust(window.iconPark.getIcon("Down", { size: "1.2rem", fill: session.unreadCount > 0 ? "#555" : getColor('右上角按钮文字') })),
          session.unreadCount > 0 ? m(".unread-badge", {
            style: {
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "#FF4D4F",
              color: "#FFF",
              fontSize: "0.6rem",
              fontWeight: "bold",
              padding: "0 0.3rem",
              height: "1rem",
              lineHeight: "1rem",
              borderRadius: "0.5rem",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              minWidth: "1rem",
              textAlign: "center"
            }
          }, session.unreadCount > 99 ? "99+" : session.unreadCount) : null
        ]) : null,

        // 回到顶部：主动跳跃要先解除贴底，否则会被贴底跟随拉回去
        steward.pos > 200 ? m(".back-to-top", {
          style: {
            position: "absolute",
            bottom: "4.5rem",
            right: "1.7rem",
            width: "2.0rem",
            height: "2.0rem",
            borderRadius: "50%",
            zIndex: 100,
            background: isHoveredTop ? getColor('右上角按钮背景') + "ee" : getColor('右上角按钮背景') + "cc",
            color: getColor('右上角按钮文字'),
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            animation: "fadeIn 0.2s ease",
            backdropFilter: "blur(8px)",
            border: `0.1rem solid ${getColor('右上角按钮文字') + '22'}`,
            transition: "all 0.2s ease",
          },
          onmouseenter() { isHoveredTop = true },
          onmouseleave() { isHoveredTop = false },
          onclick(e) {
            e.stopPropagation()
            if (!listDom) {
              return
            }
            session.isAtBottom = false
            listDom.scrollTop = 0
          }
        }, [
          m.trust(window.iconPark.getIcon("Up", { size: "1.0rem", fill: getColor('右上角按钮文字') }))
        ]) : null
      ])
    }
  }
}
