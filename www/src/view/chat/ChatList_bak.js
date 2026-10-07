// 消息列表（虚拟滚动）
//
// 不变式：
//   1. 列表总高 = 吸顶头高度 + Σ(每项占位高度) + 尾部常驻节点高度。渲染过的项用实测占位高度，没渲染过的只能用估算值
//   2. 所以总高误差只来自“未渲染项用估算”这件事，渲染窗口每滑动一格误差就跳变一次
//   3. 任何布局变化后，只要把锚点项拉回它在视口里的原像素位置，用户就看不到跳
//
// 三层职责（互不越界）：
//   测量层 ResizeObserver 只量高度写 heightsMap；偏移层 前缀和 + 二分只算渲染窗口；
//   调节层：所有“把画面拉回原位”的补偿只走一处口径——按锚点上方高度差补偿；
//   平时由 regulate 在布局变化后执行，账本（占位符换真消息）重建时由 syncData 原子执行
//
// 函数住哪里只看一件事：要不要读写本实例的状态。
//   不碰状态（纯输入输出）→ 写在 export default 外面，全模块只创建一份
//   读写状态（高度账/锚点/窗口/DOM 引用）→ 写在闭包里，因为 ChatList 会被嵌套，每个会话各有一套状态
//
// 同帧约束：修正必须落在“排版完成、画面还没绘制”的同一帧内。
//   一处在 ResizeObserver 回调里，一处在 onupdate 末尾（读 rect 会强制排版，拿到的一定是新位置）
//
// 尾部节点（打字气泡、审批框）常驻渲染不参与虚拟化，不进高度账，但要观察，让贴底能被它们驱动

import chatData from "./chatData.js"
import settingData from "../setting/settingData.js"
import ChatItem from "./ChatItem.js"
import ChatTasks from "./ChatTasks.js"
import ChatConfirm from "./ChatConfirm.js"
import ToolCallGroup from "./ToolCallGroup.js"
import TaskProcessGroup from "./TaskProcessGroup.js"
import Box from "../common/box.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"

// ===== 纯函数区：不碰实例状态，全模块只创建一份 =====

const BUFFER_ITEMS = 8 // 渲染窗口上下各多渲染几项，避免滚动时露白
const ESTIMATED_HEIGHT = 100 // 未渲染项的高度估算值（含项与项之间的间距）
const SENTINEL_HEIGHT = "0.1rem" // 末尾哨兵必须非零，否则最后一项的间距会被外边距折叠吃掉

// 分组键：任务过程组用自身 id，工具组用组号拼接条消息 uuid，其余用消息 uuid
const getGroupKey = (group) => group.isTaskProcess
  ? group.id
  : group.toolCallGroupId
    ? group.toolCallGroupId + "_" + group.chats[0].uuid
    : group.chats[0].uuid

// 是否为外部用户提问起点：UI 上是我方气泡、物理上非系统注入、非工具链附属、非屏蔽通知
const isUserTurnTrigger = (chat) => {
  if (!chat) return false
  if (chat.group !== "user") return false
  if (chat.isSystem || chat.ask?.isSystem) return false
  if (chat.ask?.toolCallGroupId) return false
  if (chat.ask?.ignore === 1) return false
  return true
}

// 通信角色：优先标准契约 role，其次兼容旧的 group 字段
const getMsgRole = (chat) => {
  const role = chat?.ask?.role || chat?.role
  if (role) return role
  if (chat?.group === "user") return "user"
  if (chat?.group === "agent") return "assistant"
  if (chat?.group === "tip") return "tool"
  return "system"
}

const hasToolCalls = (chat) => !!(chat?.toolCalls?.length || chat?.ask?.toolCalls?.length || chat?.ask?.tool_call_id)

// 把消息数组编译成分组数组：先按 toolCallGroupId 聚合，再把“用户提问到最终回复之间”的执行过程包成宏观折叠组
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

  const groupsArr = []
  let i = 0
  while (i < rawGroups.length) {
    const group = rawGroups[i]
    groupsArr.push(group)
    i++
    if (!isUserTurnTrigger(group.chats[0])) continue

    // 收集本轮从用户提问后到下一个用户提问（或未加载占位符）之间的所有组
    const turnGroups = []
    while (i < rawGroups.length) {
      const nextChat = rawGroups[i].chats[0]
      if (isUserTurnTrigger(nextChat) || nextChat?.isPlaceholder) break
      turnGroups.push(rawGroups[i])
      i++
    }
    if (turnGroups.length === 0) continue

    // 本轮没有工具调用，原样平铺
    const hasTools = turnGroups.some(tg => tg.toolCallGroupId || tg.chats.some(c => getMsgRole(c) === "tool" || hasToolCalls(c)))
    if (!hasTools) {
      turnGroups.forEach(tg => groupsArr.push(tg))
      continue
    }

    // 从后往前找本轮最后一条常规的最终回复，它之前的全部归入执行过程
    let finalIndex = -1
    for (let j = turnGroups.length - 1; j >= 0; j--) {
      const chat = turnGroups[j].chats[0]
      if (getMsgRole(chat) === "assistant" && !hasToolCalls(chat) && !turnGroups[j].toolCallGroupId) {
        finalIndex = j
        break
      }
    }
    const processGroups = finalIndex === -1 ? turnGroups : turnGroups.slice(0, finalIndex)
    const firstProcessChat = processGroups[0].chats[0]
    groupsArr.push({
      isTaskProcess: true,
      startIndex: processGroups[0].startIndex,
      processGroups,
      id: "proc_" + (firstProcessChat.uuid || firstProcessChat.id),
      chats: [firstProcessChat]
    })
    if (finalIndex !== -1) turnGroups.slice(finalIndex).forEach(tg => groupsArr.push(tg))
  }
  return groupsArr
}

export default () => {
  let activeListId = 0
  let listDom = null
  let tasksEl = null
  let boxEl = null
  let sentinelDom = null
  let resizeObserver = null

  // 高度账：分组键 → 实测占位高度（含项与项之间的间距）
  const heightsMap = {}
  let seedSum = 0 // 未渲染项估算高度的取样
  let seedCount = 0
  let seededHeight = ESTIMATED_HEIGHT
  const domMap = {}
  const fetchingPages = new Set() // 正在拉取的页号，避免同一页重复请求
  let loadPagesTimer = null // 拉页延时器
  let scheduleLoadPages = null // 拉页排期函数（在下面赋值；先声明以满足“从上到下”的阅读顺序）
  let groupsArr = []
  let userGroupIndexArr = []
  let offsetsArr = []
  let dataSignature = ""
  let lastMessageCount = 0 // 上一次的消息总数：变小＝换了一份数据（新建/导入）

  // 渲染窗口
  let scrollTop = 0
  let regulatedScrollTop = -1 // 上一次由调节层写入的 scrollTop，用来区分用户滚动
  let viewportHeight = 0
  let stickyHeight = 0
  let renderStart = 0
  let renderEnd = -1
  let topPadding = 0
  let bottomPadding = 0

  // 锚点：跨分页稳定的是“首条消息下标”，不是会随分组漂移的分组键
  let anchorIndex = -1
  let anchorFlatIndex = -1
  let anchorOffset = 0

  let activeUserIndex = -1
  let lastUserScrollTime = 0 // 最近一次用户手势滚动的时间戳：手势期间程序不做反向补偿
  let settleTimer = null // 手势停下后的对齐定时器
  let latestProcessIndex = -1
  let isHovered = false
  let isHoveredTop = false

  // ===== 以下都在闭包里：它们要读写本实例的状态（嵌套子会话各有一套） =====

  // ---------- 偏移层 ----------

  // 未渲染项的估算高度：拿“已量过的卡片均值”当种子（比死写 100 靠谱一个量级）。
  // 量够 10 张就把种子冻住，免得估算值自己一直在变、把总高和滚动条搅得跳来跳去
  const getEstimatedHeight = () => seededHeight
  const seedEstimate = (advance) => {
    if (seedCount >= 10) return
    seedSum += advance
    seedCount++
    if (seedCount === 10) seededHeight = Math.min(Math.max(seedSum / seedCount, 60), 600)
  }

  // 单项估算：占位符按骨架屏自身高度算（100），真消息没测过才用均值种子。
  // 两者必须和“实际渲染出来的高度”对齐，否则骨架与真消息互换时总高会突变（滚动条乱跳）
  const getItemEstimate = (group) => group.chats[0].isPlaceholder ? ESTIMATED_HEIGHT : getEstimatedHeight()

  // 重建前缀和：offsetsArr[i] 为前 i 项的合计高度。只在数据或实测高度变化时重建，滚动过程中不重建
  const updateOffsets = (fromIndex) => {
    let sum = fromIndex === 0 ? 0 : offsetsArr[fromIndex]
    for (let i = fromIndex; i < groupsArr.length; i++) {
      offsetsArr[i] = sum
      sum += heightsMap[getGroupKey(groupsArr[i])] || getItemEstimate(groupsArr[i])
    }
    offsetsArr[groupsArr.length] = sum
  }

  // 二分查找：内容坐标 contentTop 落在第几项上
  const findIndexByOffset = (contentTop) => {
    let low = 0
    let high = groupsArr.length - 1
    let result = 0
    while (low <= high) {
      const mid = (low + high) >> 1
      if (offsetsArr[mid] <= contentTop) {
        result = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return result
  }

  // 由“首条消息下标”反查分组下标：分组结构变化后锚点依然有效
  const findIndexByFlatIndex = (flatIndex) => {
    let low = 0
    let high = groupsArr.length - 1
    let result = -1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (groupsArr[mid].startIndex <= flatIndex) {
        result = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return result
  }

  // 悬浮提问条目标：视口上方最近的一条我方提问
  const findActiveUserIndex = (contentTop) => {
    let low = 0
    let high = userGroupIndexArr.length - 1
    let result = -1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (offsetsArr[userGroupIndexArr[mid]] <= contentTop) {
        result = userGroupIndexArr[mid]
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return result
  }

  // ---------- 数据与窗口 ----------

  // 上下占位条高度：跟着账本走，窗口不变时只重算这个
  const updatePaddings = () => {
    if (renderEnd < renderStart) {
      topPadding = 0
      bottomPadding = 0
      return
    }
    topPadding = offsetsArr[renderStart]
    bottomPadding = offsetsArr[groupsArr.length] - offsetsArr[renderEnd + 1]
  }

  // 由 scrollTop 求渲染窗口：只在“用户滚动”与“数据变了”时调用。
  // 卡片测高不能反过来推窗口，否则每量一张就滑一次窗，会来回加载好几轮才停
  const updateWindow = () => {
    if (groupsArr.length === 0) {
      renderStart = 0
      renderEnd = -1
      updatePaddings()
      return
    }
    const contentTop = Math.max(0, scrollTop - stickyHeight)
    // 视口高度还拿不到时（首帧刚挂载）按一屏算，避免算出过小的窗口
    const viewRange = Math.max(viewportHeight, 600)
    const firstIndex = findIndexByOffset(contentTop)
    const lastIndex = findIndexByOffset(contentTop + viewRange)
    renderStart = Math.max(0, firstIndex - BUFFER_ITEMS)
    renderEnd = Math.min(groupsArr.length - 1, Math.max(lastIndex, firstIndex) + BUFFER_ITEMS)
    // 绝对别切出空数组：宁可多渲染一屏，也绝不让列表留白
    if (renderEnd < renderStart) renderEnd = Math.min(groupsArr.length - 1, renderStart + BUFFER_ITEMS * 2)
    updatePaddings()
  }

  // 占位符换真消息、新消息到达、分页拉取完成，才会走到这里重建全表
  const syncData = (chatList) => {
    const listData = chatData.computedLists[chatList.id] || chatData.list
    const pagesKey = Object.keys(chatData.chatLists[chatList.id]?.pages || {}).join(",")
    const signature = `${listData.length}_${listData[0]?.uuid || ""}_${listData[listData.length - 1]?.uuid || ""}_${pagesKey}`
    if (signature === dataSignature) return
    // 消息总数变小 = 换了一份数据（文件→新建、导入存档）：旧的位置、锚点与阅读锁必须丢掉。
    // 否则“仍在阅读历史”的锁会把新会话的自动贴底挡住，新消息一条都看不见
    if (listData.length < lastMessageCount) {
      resetAll()
      chatData.getSessionState(chatList.id).isAtBottom = true
    }
    lastMessageCount = listData.length
    dataSignature = signature
    // 重建前先记下锚点上方的高度，重建后立刻把差量补回 scrollTop：
    // 不这么做的话，新账本一换、窗口就会滑到另一批卡片上，会来回加载好几轮才停
    const oldAnchorTop = anchorIndex < 0 ? 0 : offsetsArr[anchorIndex]
    groupsArr = buildGroups(listData)
    userGroupIndexArr = []
    latestProcessIndex = -1
    for (let i = 0; i < groupsArr.length; i++) {
      if (groupsArr[i].chats[0].group === "user") userGroupIndexArr.push(i)
      if (groupsArr[i].isTaskProcess) latestProcessIndex = i
    }
    updateOffsets(0)
    anchorIndex = anchorFlatIndex < 0 ? -1 : findIndexByFlatIndex(anchorFlatIndex)
    if (anchorIndex >= 0 && listDom) {
      const delta = offsetsArr[anchorIndex] - oldAnchorTop
      if (Math.abs(delta) >= 0.5) listDom.scrollTop += delta
      scrollTop = listDom.scrollTop
      regulatedScrollTop = listDom.scrollTop
    }
    // 数据变了才重算窗口，且必须在上面把 scrollTop 补正之后再算，两边基准才一致
    updateWindow()
  }

  // 向上翻页的入口：严格一次只发一个请求（单飞），等它落地再排下一个
  const loadPage = async (pageIndex) => {
    const listId = activeListId
    fetchingPages.add(pageIndex)
    try {
      await chatData.chatLists[listId].pull(pageIndex)
      chatData.getHistoryList(listId)
      m.redraw()
    } catch (err) {
      console.error("[ChatList] 分页拉取失败", err)
    }
    fetchingPages.delete(pageIndex)
    // 一页落地后再看看还要不要补别的页
    scheduleLoadPages()
  }

  // 拉页：视口里先补（离中心越近越优先），再补视口上方两屏内即将滚到的页。
  // 严格单飞：一次只发一个请求，等它落地再排下一个（多个请求同时回来会连着改账本，滚动条就连跳几下）
  const loadVisiblePages = () => {
    if (fetchingPages.size > 0) return
    const centerIndex = (renderStart + renderEnd) >> 1
    const prefetchStart = findIndexByOffset(Math.max(0, scrollTop - stickyHeight - viewportHeight * 2))
    const inViewPages = []
    const prefetchPages = []
    for (let i = prefetchStart; i <= renderEnd; i++) {
      const chat = groupsArr[i]?.chats[0]
      if (!chat?.isPlaceholder) continue
      if (i >= renderStart) {
        if (chat.pageIndex !== undefined && !inViewPages.some(item => item.pageIndex === chat.pageIndex)) {
          inViewPages.push({ index: i, pageIndex: chat.pageIndex })
        }
      } else if (chat.pageIndex !== undefined && !prefetchPages.includes(chat.pageIndex)) {
        prefetchPages.push(chat.pageIndex)
      }
    }
    inViewPages.sort((a, b) => Math.abs(a.index - centerIndex) - Math.abs(b.index - centerIndex))
    const target = inViewPages.length > 0 ? inViewPages[0].pageIndex : prefetchPages[0]
    if (target !== undefined) loadPage(target)
  }

  // 排到下一个宏任务执行：既不在渲染/测量回调里同步发请求，也不故意拖延，
  // 骨架屏因此根本来不及被用户看到（单飞，不会互相踩账本）
  scheduleLoadPages = () => {
    clearTimeout(loadPagesTimer)
    loadPagesTimer = setTimeout(loadVisiblePages, 0)
  }

  // ---------- 测量层 ----------

  // 用“相邻兄弟的 offsetTop 差”当占位高度：它天然把外边距与间距算进去，且不受滚动位置影响
  // 每一项都有下一个兄弟（下一项，或末尾哨兵），所以窗口内每一项都能量
  const measureWindow = () => {
    let changedFrom = offsetsArr.length
    for (let i = renderStart; i <= renderEnd; i++) {
      const group = groupsArr[i]
      const key = getGroupKey(group)
      const dom = domMap[key]
      if (!dom) continue
      const nextGroup = groupsArr[i + 1]
      const nextDom = nextGroup ? domMap[getGroupKey(nextGroup)] || sentinelDom : sentinelDom
      if (!nextDom || nextDom === dom) continue
      const advance = nextDom.offsetTop - dom.offsetTop
      if (advance <= 0) continue
      if (heightsMap[key] !== advance) {
        // 只拿真消息当种子：骨架屏自身就是 100px，拿它当种子等于没改进
        if (heightsMap[key] === undefined && !group.chats[0].isPlaceholder) seedEstimate(advance)
        heightsMap[key] = advance
        if (i < changedFrom) changedFrom = i
      }
    }
    if (changedFrom < offsetsArr.length) updateOffsets(changedFrom)
  }

  // ---------- 调节层：全文件唯一写 scrollTop 的地方 ----------

  // 采样锚点：只认真正和可见区相交的已渲染项
  // （整窗在头顶或脚下时不能当锚点，否则拿着屏幕外很远的项当基准，一修正就把画面甩飞）
  const sampleAnchor = () => {
    if (!listDom) return
    const contentTop = Math.max(0, scrollTop - stickyHeight)
    // 先用账本二分直取“视口顶部那一项”，只测它一个（最多再试一个），把一帧的几何读取从二十次降到一两次
    const first = findIndexByOffset(contentTop)
    const listRect = listDom.getBoundingClientRect()
    const visibleTop = listRect.top + stickyHeight
    for (let step = 0; step < 2; step++) {
      const i = Math.min(Math.max(first + step, renderStart), renderEnd)
      if (i < 0) break
      const dom = domMap[getGroupKey(groupsArr[i])]
      if (!dom) continue
      const rect = dom.getBoundingClientRect()
      if (rect.bottom <= visibleTop || rect.top >= listRect.bottom) continue
      anchorIndex = i
      anchorFlatIndex = groupsArr[i].startIndex
      anchorOffset = rect.top - listRect.top
      return
    }
    anchorIndex = -1
    anchorFlatIndex = -1
    anchorOffset = 0
  }

  // 修正完 scrollTop 后，让渲染窗口按同样位移跟过去（只做局部前后挪，
  // 不按账本重新全量推导，免得估算误差把窗口一路推走又去拉新页）
  const followScrollWindow = () => {
    const contentTop = Math.max(0, scrollTop - stickyHeight)
    let step = 0
    while (renderStart + step > 0 && offsetsArr[renderStart + step] > contentTop) step--
    while (renderStart + step < groupsArr.length - 1 && offsetsArr[renderStart + step + 1] <= contentTop) step++
    if (step === 0) return
    if (renderEnd + step > groupsArr.length - 1 || renderStart + step < 0) return
    renderStart += step
    renderEnd += step
    updatePaddings()
  }

  // 贴底跟随的前提是“是否在底部”由用户滚动方向实时判定（见 onscroll），
  // 不是 120px 缓冲区，所以这里可以放心地每次都跟随底部状态
  const regulate = () => {
    if (!listDom || groupsArr.length === 0) return

    // 策略一：贴着底部就跟随最新内容（打字流、审批框撑高全靠它）
    if (chatData.chatListScrollAtBottom(activeListId)) {
      listDom.scrollTop = listDom.scrollHeight - listDom.clientHeight
      scrollTop = listDom.scrollTop
      regulatedScrollTop = listDom.scrollTop
      sampleAnchor()
      return
    }

    // 用户手势还在进行中（300ms 内还有滚动）：只让滚轮说话，
    // 程序绝不做反向补偿，否则用户往上滚、程序往下拽，滚动条会原地抽搐
    if (Date.now() - lastUserScrollTime < 300) return

    const anchorDom = anchorIndex < 0 ? null : domMap[getGroupKey(groupsArr[anchorIndex])]
    let moved = false
    if (anchorDom) {
      // 策略二：锚点项还在 DOM 里，把它拉回原像素位置（同一把尺子量，最可靠）
      const delta = anchorDom.getBoundingClientRect().top - listDom.getBoundingClientRect().top - anchorOffset
      if (Math.abs(delta) >= 0.5) {
        listDom.scrollTop += delta
        moved = true
      }
    } else if (anchorIndex >= 0) {
      // 策略三：锚点项被回收了，按累计高度反推；此时它上方全是未渲染项，
      // 占位条高度就是账本里这些估算值之和，两边同一把尺子，所以算得准
      const expectedScrollTop = offsetsArr[anchorIndex] + stickyHeight - anchorOffset
      if (Math.abs(expectedScrollTop - listDom.scrollTop) >= 0.5) {
        listDom.scrollTop = expectedScrollTop
        moved = true
      }
    }
    if (moved) {
      scrollTop = listDom.scrollTop
      regulatedScrollTop = listDom.scrollTop
      // 位置变了，渲染窗口必须跟着走，否则视口会落到渲染范围之外（露白）
      followScrollWindow()
      // 只有真动了才重新采样基准；没动就别每帧去读一堆 rect（打字流时很贵）
      sampleAnchor()
    }
  }

  // 切换会话：高度账、锚点、窗口必须整体换一套，否则上一条会话会污染新会话
  const resetAll = () => {
    Object.keys(heightsMap).forEach(key => delete heightsMap[key])
    Object.keys(domMap).forEach(key => delete domMap[key])
    seedSum = 0
    seedCount = 0
    seededHeight = ESTIMATED_HEIGHT
    groupsArr = []
    userGroupIndexArr = []
    offsetsArr = []
    dataSignature = ""
    anchorIndex = -1
    anchorFlatIndex = -1
    anchorOffset = 0
    activeUserIndex = -1
    latestProcessIndex = -1
    scrollTop = 0
    regulatedScrollTop = -1
    renderStart = 0
    renderEnd = -1
    topPadding = 0
    bottomPadding = 0
  }

  return {
    async oninit({ attrs }) {
      resizeObserver = new ResizeObserver(() => {
        // 量 -> 算 -> 动，三步在同一帧、绘制之前完成，所以用户看不到跳
        if (!listDom) return
        const oldStart = renderStart
        const oldEnd = renderEnd
        const oldViewport = viewportHeight
        viewportHeight = listDom.clientHeight
        stickyHeight = (tasksEl ? tasksEl.offsetHeight : 0) + (boxEl ? boxEl.offsetHeight : 0)
        measureWindow()
        const oldTop = topPadding
        const oldBottom = bottomPadding
        // 这里故意不重算窗口：测高只该改账本，不该反过来推窗口，
        // 否则每量一张就滑一次窗，来回好几轮（就是“等 5 秒”的病根）
        updatePaddings()
        // 容器尺寸变了（比如拖窗口）是例外：可视范围变了，窗口必须重算，否则会露白
        if (viewportHeight !== oldViewport) updateWindow()
        regulate()
        // 位置 / 窗口 / 占位条 任一变了都要重绘（窗口会被 regulate 带动）
        if (renderStart !== oldStart || renderEnd !== oldEnd || topPadding !== oldTop || bottomPadding !== oldBottom) m.redraw()
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

    onbeforeremove() {
      resizeObserver?.disconnect()
      resizeObserver = null
      clearTimeout(loadPagesTimer)
      clearTimeout(settleTimer)
    },

    view({ attrs }) {
      const chatList = attrs.chatList
      const listId = chatList.id
      const session = chatData.getSessionState(listId)

      // 吸顶头会盖住列表顶部，窗口计算必须扣掉它
      stickyHeight = (tasksEl ? tasksEl.offsetHeight : 0) + (boxEl ? boxEl.offsetHeight : 0)
      viewportHeight = listDom ? listDom.clientHeight : 0

      syncData(chatList)
      // 铁律：每一帧绘制都必须按“当前的 scrollTop”锁定渲染范围。
      // 少了这一句，拖动滚动条后范围会留在原处，巨大的上下占位条会把卡片顶出视口 → 整片空白
      updateWindow()

      const contentTop = Math.max(0, scrollTop - stickyHeight)
      activeUserIndex = findActiveUserIndex(contentTop)
      const activeUserChat = activeUserIndex < 0 ? null : groupsArr[activeUserIndex].chats[0]
      const activeUserChatOffset = activeUserIndex < 0 ? 0 : offsetsArr[activeUserIndex] + stickyHeight
      const latestProcessGroup = latestProcessIndex < 0 ? null : groupsArr[latestProcessIndex]
      const visibleGroups = groupsArr.slice(renderStart, renderEnd + 1)

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
          .chatList::-webkit-scrollbar-thumb {
            min-height: 24px;
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
            const oldScrollTop = scrollTop
            const oldIsAtBottom = session.isAtBottom
            scrollTop = dom.scrollTop

            // 调节层自己写进去的滚动不算用户滚动，否则会把程序补偿误当成阅读意图
            if (Math.abs(scrollTop - regulatedScrollTop) > 1) {
              // 用户主动上滑就立刻解除贴底：不能等离开 120px 缓冲区，
              // 否则“贴底跟随”会在下一次重绘把你拽回去，永远滚不出那 120px
              if (scrollTop < oldScrollTop - 1) session.isAtBottom = false
              else if (chatData.checkDomScrollAtBottom(listId)) session.isAtBottom = true
              // 记下用户手势时间：接下来 300ms 内程序不做反向补偿（避免跟滚轮拔河）
              lastUserScrollTime = Date.now()
              // 手势停下后补一次静态对齐：不补的话，手势期间攒下的高度差会让渲染范围
              // 与账本错位，表现为“内容只出来一半，再滚一下才补齐”
              clearTimeout(settleTimer)
              settleTimer = setTimeout(() => {
                regulate()
                updateWindow()
                m.redraw()
              }, 320)
              sampleAnchor()
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

            // 只有渲染窗口、顶部按钮、悬浮条、底部状态真的变了才重绘，不给每一下滚动都重画全表
            const oldStart = renderStart
            const oldEnd = renderEnd
            updateWindow()
            const nextActiveUserIndex = findActiveUserIndex(contentTop)
            const needRedraw = renderStart !== oldStart || renderEnd !== oldEnd ||
              (scrollTop > 200) !== (oldScrollTop > 200) ||
              nextActiveUserIndex !== activeUserIndex ||
              session.isAtBottom !== oldIsAtBottom
            activeUserIndex = nextActiveUserIndex
            if (needRedraw) m.redraw()
          },
          oncreate(v) {
            listDom = v.dom
            viewportHeight = v.dom.clientHeight
            scrollTop = v.dom.scrollTop
            session.chatListDom = v.dom
            resizeObserver?.observe(v.dom)
            scheduleLoadPages()
            // 首次进入停在最新一条：等第一轮实测高度落地后再贴一次底
            setTimeout(() => {
              listDom.scrollTop = listDom.scrollHeight
              scrollTop = listDom.scrollTop
              regulatedScrollTop = listDom.scrollTop
              setTimeout(() => {
                listDom.scrollTop = listDom.scrollHeight
                scrollTop = listDom.scrollTop
                regulatedScrollTop = listDom.scrollTop
              }, 100)
            }, 0)
          },
          onupdate(v) {
            listDom = v.dom
            session.chatListDom = v.dom
            if (listId === activeListId) {
              // 重绘阶段读 rect 强制排版，拿到的一定是新位置，修正在同一帧落地
              const beforeStart = renderStart
              const beforeEnd = renderEnd
              regulate()
              // 修正带动了窗口变化时需要再重绘一次，否则会露白（下一轮 moved 已是 false，不会成环）
              if (renderStart !== beforeStart || renderEnd !== beforeEnd) m.redraw()
              scheduleLoadPages()
              return
            }
            activeListId = listId
            resetAll()
            session.isAtBottom = true
            session.unreadCount = 0
            chatData.initChatLists(listId)
            chatData.chatLists[listId].pull(0).then(() => {
              chatData.getHistoryList(listId)
              m.redraw()
              setTimeout(() => {
                listDom.scrollTop = listDom.scrollHeight
                scrollTop = listDom.scrollTop
                regulatedScrollTop = listDom.scrollTop
              }, 100)
            }).catch(err => console.error("[ChatList] 切换会话拉取失败", err))
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
              if (tasksEl) resizeObserver?.observe(tasksEl)
            },
            onupdate(v) {
              tasksEl = v.dom
              if (tasksEl) resizeObserver?.observe(tasksEl)
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
              if (!listDom) return
              // 主动跳跃同样要先解除贴底，否则会被“拉回原位”的修正撤销
              session.isAtBottom = false
              listDom.scrollTo({ top: activeUserChatOffset - 50, behavior: "auto" })
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
              style: { height: `${topPadding}px` },
              oncreate(v) { resizeObserver?.observe(v.dom) },
              onupdate(v) { resizeObserver?.observe(v.dom) },
            }),

            m("", [
              ...visibleGroups.map(group => {
                const key = getGroupKey(group)
                // 分支里只决定孩子，属性与监听统一写在外层
                let children = group.chats.map(chat => m(ChatItem, { key: chat.uuid, chat, listId: attrs.listId }))
                if (group.isTaskProcess) {
                  children = [
                    m(TaskProcessGroup, {
                      groups: group.processGroups,
                      listId: attrs.listId,
                      isReplying: !!chatList?.replying && group === latestProcessGroup
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
                        animation: "pulse 1.5s infinite"
                      }
                    }, "Loading...")
                  ]
                }
                return m("", {
                  key,
                  "data-id": key,
                  oncreate({ dom }) {
                    domMap[key] = dom
                    resizeObserver?.observe(dom)
                  },
                  onbeforeremove({ dom }) {
                    if (domMap[key] === dom) delete domMap[key]
                    resizeObserver?.unobserve(dom)
                  },
                }, children)
              }),

              // 末尾哨兵：让最后一项也有“下一个兄弟”，否则它的间距量不出来
              m("", {
                key: "__sentinel__",
                style: { height: SENTINEL_HEIGHT },
                oncreate(v) {
                  sentinelDom = v.dom
                  resizeObserver?.observe(v.dom)
                },
                onbeforeremove() {
                  sentinelDom = null
                },
              })
            ]),

            m("", {
              style: { height: `${bottomPadding}px` },
              oncreate(v) { resizeObserver?.observe(v.dom) },
              onupdate(v) { resizeObserver?.observe(v.dom) },
            })
          ]),

          // 尾部常驻节点：只参与观察，不参与高度账
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
            if (listDom) chatData.scrollChatListTobottom(listId)
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

        // 回到顶部：滚到 0 后由占位符嗅探自动拉取最早的一页
        scrollTop > 200 ? m(".back-to-top", {
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
            if (!listDom) return
            // 主动跳到顶部：先解除贴底（否则贴底跟随会把这一跳撤销），
            // 再交给滚动事件去重算窗口与锚点，不要自己伪造 regulatedScrollTop
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
