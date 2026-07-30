import data from "./chatData.js"
import ChatItem from "./ChatItem.js"
import comData from "../../comData/comData.js"
import chatData from "./chatData.js"
import Box from "../common/box.js"
import ChatConfirm from "./ChatConfirm.js"
import ChatTerm from "./ChatTerm.js"
import ToolCallGroup from "./ToolCallGroup.js"
import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import ChatTasks from "./ChatTasks.js"

export default () => {
  // 实例闭包私有变量
  const heightsMap = {}
  const fetchingPages = new Set() // 追踪正在获取的页面

  // 动态平均高度估算
  let totalHeight = 0
  let measuredCount = 0
  function getEstimatedHeight() {
    return measuredCount > 0 ? Math.max(50, Math.floor(totalHeight / measuredCount)) : 50
  }

  const BUFFER_ITEMS = 8

  let scrollTop = 0
  let viewportHeight = 800
  let lastScrollHeight = 0
  let tasksEl = null
  let boxEl = null
  let resizeObserver = null
  let atBottom = true
  let userHasScrolledUp = false
  let lastScrollTopVal = 0
  let lastDataLength = 0
  let currentChatListId = null
  let listDom = null
  let isHovered = false
  let isHoveredTop = false
  let lastScrollTime = 0
  let lastHeadId = null

  // 缓存依赖 Key 与计算产物
  let lastCacheKey = ""
  let cachedScrollState = { visibleGroups: [], topPadding: 0, bottomPadding: 0 }

  // 节点监听解耦辅助函数
  const observeItem = ({ dom }) => resizeObserver?.observe(dom)
  const unobserveItem = ({ dom }) => resizeObserver?.unobserve(dom)

  // 虚拟滚动区间计算器（带依赖缓存保护）
  function getVirtualScrollState(chatList, headerHeight) {
    const listId = chatList?.id || 0
    const listData = chatData.computedLists[listId] || chatData.list || []
    const dataLength = listData.length
    const heightsCount = Object.keys(heightsMap).length

    // 组装缓存依赖 Key (加入列表首尾消息的 uuid 和 totalMeasuredHeight，防止尺寸变更误命中缓存)
    const headUuid = listData[0]?.uuid || ""
    const tailUuid = listData[listData.length - 1]?.uuid || ""
    const cacheKey = `${dataLength}_${scrollTop}_${viewportHeight}_${headerHeight}_${heightsCount}_${totalHeight}_${headUuid}_${tailUuid}`

    if (cacheKey === lastCacheKey) {
      return cachedScrollState
    }

    // 1. 分组消息
    let chatGroups = []
    let currentToolCallGroup = null
    listData.forEach((chat) => {
      const toolCallGroupId = chat.ask?.toolCallGroupId
      if (toolCallGroupId) {
        if (!currentToolCallGroup || currentToolCallGroup.toolCallGroupId !== toolCallGroupId) {
          currentToolCallGroup = { toolCallGroupId: toolCallGroupId, chats: [chat] }
          chatGroups.push(currentToolCallGroup)
        } else {
          currentToolCallGroup.chats.push(chat)
        }
      } else {
        currentToolCallGroup = null
        chatGroups.push({ toolCallGroupId: null, chats: [chat] })
      }
    })

    // 2. 虚拟滚动可见区间计算
    const relativeScrollTop = Math.max(0, scrollTop - headerHeight)
    let accumulatedHeight = 0
    let startIndex = 0
    let endIndex = chatGroups.length - 1

    for (let i = 0; i < chatGroups.length; i++) {
      const group = chatGroups[i]
      const itemId = group.toolCallGroupId ? (group.toolCallGroupId + "_" + group.chats[0].uuid) : group.chats[0].uuid
      const itemHeight = heightsMap[itemId] || getEstimatedHeight()

      if (accumulatedHeight + itemHeight < relativeScrollTop) {
        startIndex = i + 1
      }
      if (accumulatedHeight < relativeScrollTop + viewportHeight) {
        endIndex = i
      }
      accumulatedHeight += itemHeight
    }

    // 3. 应用上下缓冲区
    const renderStartIndex = Math.max(0, startIndex - BUFFER_ITEMS)
    const renderEndIndex = Math.min(chatGroups.length - 1, endIndex + BUFFER_ITEMS)

    // 4. 计算 top/bottom spacer 的高度
    let topPadding = 0
    for (let i = 0; i < renderStartIndex; i++) {
      const group = chatGroups[i]
      const itemId = group.toolCallGroupId ? (group.toolCallGroupId + "_" + group.chats[0].uuid) : group.chats[0].uuid
      topPadding += heightsMap[itemId] || getEstimatedHeight()
    }

    let bottomPadding = 0
    for (let i = renderEndIndex + 1; i < chatGroups.length; i++) {
      const group = chatGroups[i]
      const itemId = group.toolCallGroupId ? (group.toolCallGroupId + "_" + group.chats[0].uuid) : group.chats[0].uuid
      bottomPadding += heightsMap[itemId] || getEstimatedHeight()
    }

    const visibleGroups = chatGroups.slice(renderStartIndex, renderEndIndex + 1)

    // Debug 重复 Key 嗅探
    const debugSeenKeys = new Set()
    visibleGroups.forEach(group => {
      const itemId = group.toolCallGroupId
        ? (group.toolCallGroupId + "_" + group.chats[0].uuid)
        : group.chats[0].uuid
      if (debugSeenKeys.has(itemId)) {
        console.error("[Debug 警告] 重复 Key 组内容:", group)
      }
      debugSeenKeys.add(itemId)
    })

    // 5. 自动嗅探需要拉取的页面占位符
    const pagesToLoad = new Set()
    visibleGroups.forEach(group => {
      const chat = group.chats[0]
      if (chat.isPlaceholder && chat.pageIndex !== undefined) {
        pagesToLoad.add(chat.pageIndex)
      }
    })

    pagesToLoad.forEach(pageIndex => {
      if (!fetchingPages.has(pageIndex)) {
        fetchingPages.add(pageIndex)
        // 使用 setTimeout 避免在渲染循环中直接发请求阻塞UI
        setTimeout(async () => {
          try {
            const rows = chatData.chatLists[listId]
            if (rows) {
              await rows.pull(pageIndex)
              chatData.getHistoryList(listId)
              m.redraw()
            }
          } catch (err) {
            console.error("Failed to fetch page", pageIndex, err)
          } finally {
            fetchingPages.delete(pageIndex)
          }
        }, 0)
      }
    })

    // 6. 查找当前处于吸顶状态的我方消息
    let activeUserChat = null
    let activeUserChatOffset = 0
    let currentHeight = 0
    for (let i = 0; i < chatGroups.length; i++) {
      const group = chatGroups[i]
      const itemId = group.toolCallGroupId ? (group.toolCallGroupId + "_" + group.chats[0].uuid) : group.chats[0].uuid
      const itemHeight = heightsMap[itemId] || getEstimatedHeight()

      if (currentHeight <= relativeScrollTop) {
        if (group.chats[0].group === "user") {
          activeUserChat = group.chats[0]
          activeUserChatOffset = currentHeight
        }
      } else {
        break
      }
      currentHeight += itemHeight
    }

    // 写入缓存
    lastCacheKey = cacheKey
    cachedScrollState = { visibleGroups, topPadding, bottomPadding, activeUserChat, activeUserChatOffset }
    return cachedScrollState
  }

  return {
    async oninit(vnode) {
      // 实例化 ResizeObserver 测高
      resizeObserver = new ResizeObserver((entries) => {
        let changed = false
        for (let entry of entries) {
          const id = entry.target.getAttribute("data-id")
          const newHeight = entry.target.offsetHeight
          if (newHeight > 0 && heightsMap[id] !== newHeight) {
            const oldHeight = heightsMap[id]
            const delta = oldHeight !== undefined ? (newHeight - oldHeight) : 0

            // 滚动锚定与高度差物理补偿：
            // 当卡片在非贴底（上翻历史）状态下变高（展开）或变矮（折叠）时，
            // 自动补偿 scrollTop，消解高度跳变，保持当前视口视效稳定且卡片不出界
            if (!atBottom && listDom && delta > 0) {
              const itemRect = entry.target.getBoundingClientRect()
              const listRect = listDom.getBoundingClientRect()
              if (itemRect.top < listRect.top) {
                listDom.scrollTop += delta
                scrollTop = listDom.scrollTop
              }
            }

            if (oldHeight !== undefined) {
              totalHeight += (newHeight - oldHeight)
            } else {
              totalHeight += newHeight
              measuredCount++
            }
            heightsMap[id] = newHeight
            changed = true
          }
        }
        if (changed) {
          m.redraw()
        }
      })

      const listId = vnode.attrs.chatList?.id || 0
      currentChatListId = listId
      lastDataLength = 0
      atBottom = true
      try {
        chatData.initChatLists(listId)
        await chatData.chatLists[listId].pull()
        chatData.getHistoryList(listId)
        m.redraw()
      } catch (e) {
        console.error("[ChatList] initChatLists failed:", e)
      }
    },

    onbeforeremove(vnode) {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    },

    view({ attrs }) {
      let chatList = attrs.chatList

      // 动态计算 Header 高度
      const headerHeight = (tasksEl ? tasksEl.offsetHeight : 0) + (boxEl ? boxEl.offsetHeight : 0)

      // 从缓存获取计算状态，高频重绘下 O(1) 瞬间返回
      const { visibleGroups, topPadding, bottomPadding, activeUserChat, activeUserChatOffset } = getVirtualScrollState(chatList, headerHeight)

      return m("", {
        style: {
          flex: 1,
          marginBottom: "1rem",
          borderRadius: "3rem",
          background: getColor('gray_4').back + '99',
          border: `0.1rem solid ${getColor('main').back}`,
          position: "relative",
          height: "100%",
          width: "100%",
          overflow: "hidden",
        }
      }, [
        m("style", `
          .chatList::-webkit-scrollbar-thumb {
            min-height: 24px;
          }
        `),
        m(".chatList", {
          style: {
            height: "100%",
            width: "100%",
            overflowY: "auto",
          },
          oncreate(scrollVnode) {
            listDom = scrollVnode.dom
            viewportHeight = scrollVnode.dom.clientHeight
            scrollTop = scrollVnode.dom.scrollTop
            const dom = scrollVnode.dom

            // 初始判定是否在底部
            atBottom = chatData.chatListScrollAtBottom()

            requestAnimationFrame(() => {
              dom.scrollTop = dom.scrollHeight
            })

            scrollVnode.dom.addEventListener("scroll", async () => {
              const newScrollTop = scrollVnode.dom.scrollTop
              const distToBottom = dom.scrollHeight - newScrollTop - dom.clientHeight

              // 触顶自动拉取上一页数据
              if (newScrollTop === 0 && currentChatListId !== null) {
                const rows = chatData.chatLists[currentChatListId]
                if (rows && !rows.isToEnd()) {
                  const oldScrollHeight = dom.scrollHeight
                  rows.clickFn()
                  await rows.pull()
                  chatData.getHistoryList(currentChatListId)
                  m.redraw()
                  requestAnimationFrame(() => {
                    dom.scrollTop = dom.scrollHeight - oldScrollHeight
                  })
                }
              }

              const isNowAtBottom = chatData.chatListScrollAtBottom()
              if (isNowAtBottom !== atBottom) {
                atBottom = isNowAtBottom
                if (atBottom) {
                  chatData.chatListUnreadCount = 0
                }
              }

              // 物理判定：只要 scrollTop 减小（用户向上划），立刻标记用户主动上划
              if (newScrollTop < lastScrollTopVal) {
                userHasScrolledUp = true
              }
              if (isNowAtBottom) {
                userHasScrolledUp = false
              }
              lastScrollTopVal = newScrollTop

              scrollTop = newScrollTop
              viewportHeight = scrollVnode.dom.clientHeight
              m.redraw()
            })
          },
          onupdate(scrollVnode) {
            const dom = scrollVnode.dom
            listDom = scrollVnode.dom

            // 切换会话时重置状态
            const listId = chatList?.id || 0
            if (currentChatListId !== listId) {
              currentChatListId = listId
              lastDataLength = 0
              atBottom = true
              chatData.chatListUnreadCount = 0
              chatData.initChatLists(listId)
              chatData.chatLists[listId].pull().then(() => {
                chatData.getHistoryList(listId)
                m.redraw()
                requestAnimationFrame(() => {
                  dom.scrollTop = dom.scrollHeight
                })
              })
            }
          }
        }, [
          // 渲染任务，挂载真实 DOM 到闭包局部变量以便计算高度
          m(ChatTasks, {
            chatList,
            oncreate(v) { tasksEl = v.dom },
            onupdate(v) { tasksEl = v.dom }
          }),

          m(Box, {
            oncreate(v) { boxEl = v.dom },
            onupdate(v) { boxEl = v.dom },
            isBtn: true,
            style: {
              position: "sticky",
              top: "0",
              zIndex: 10,
              background: getColor('main').back,
              color: getColor('main').front,
              padding: "0.5rem",
              margin: "1rem",
            },
            async onclick() {
              if (chatList?.id && chatList.id !== 0) {
                await comData.data.edit(d => d.targetChatListId = chatList.linkid || 0);
              } else {
                await comData.data.edit(() => { })
                await comData.pullData()
              }
            },
          }, [
            chatList?.id === 0
              ? trs("通用/消息列表", { cn: "消息列表", en: "Message List" })
              : `${trs("通用/返回上一级", { cn: "返回上一级", en: "Back to Parent" })}(${trs("通用/子会话", { cn: "子会话", en: "Sub Session" })} ${chatList?.id})`
          ]),

          // 悬浮提问指示条（精简气泡版）
          activeUserChat ? m("", {
            style: {
              position: "absolute",
              top: "0",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              width: "fit-content",       // 短文本自适应收缩，长文本服从 maxWidth
              maxWidth: "20rem",          // 严格限制最大宽度，防止撑破容器
              boxSizing: "border-box",
              padding: "0.4rem 0.8rem",
              margin: "1rem",
              background: getColor('brown_1').back + 'ee',
              borderRadius: "1rem",       // 胶囊形圆角
              color: getColor('brown_1').front,
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
              textAlign: "left"           // 保证内部文本左对齐
            },
            title: trs("通用/点击跳转", { cn: "点击跳转至该消息", en: "Click to jump to this message" }),
            onclick: () => {
              if (listDom) {
                // 统一使用精确的绝对坐标跳转，不再使用行为难测的 scrollIntoView
                // 扣减 50px 裕量，使其定位在气泡下方舒适的阅读区域
                listDom.scrollTo({
                  top: activeUserChatOffset + (headerHeight || 0) - 50,
                  behavior: "auto"
                });
              }
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
                color: getColor('gray_8').front,
                minWidth: 0 // 核心修复：防止被超长文本撑破 flex 容器导致 maxWidth 失效
              }
            }, activeUserChat.content)
          ]) : null,

          // 核心消息流（应用虚拟滚动）
          m("", [
            // 1. 顶部占位（外层节点全不带 key，遵循 none have keys 规范）
            m("", { style: { height: `${topPadding}px` } }),

            // 2. 独立的核心消息组容器（内层节点全带 key，遵循 all have keys 规范）
            m("",
              visibleGroups.map(chatGroup => {
                const itemId = chatGroup.toolCallGroupId
                  ? (chatGroup.toolCallGroupId + "_" + chatGroup.chats[0].uuid)
                  : chatGroup.chats[0].uuid

                // 分支 1：工具调用组
                if (chatGroup.toolCallGroupId) {
                  return m("", {
                    key: itemId,
                    "data-id": itemId,
                    oncreate: observeItem,
                    onbeforeremove: unobserveItem
                  }, [
                    m(ToolCallGroup, { key: chatGroup.toolCallGroupId, chats: chatGroup.chats })
                  ])
                }

                // 分支 2：骨架屏占位
                if (chatGroup.chats[0].isPlaceholder) {
                  return m("", {
                    key: itemId,
                    "data-id": itemId,
                    oncreate: observeItem,
                    onbeforeremove: unobserveItem
                  }, [
                    m(".placeholder-skeleton", {
                      style: {
                        height: getEstimatedHeight() + "px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: getColor('main').front + '55',
                        fontSize: "0.8rem",
                        animation: "pulse 1.5s infinite"
                      }
                    }, "Loading...")
                  ])
                }

                // 分支 3：标准消息卡片列表
                return m("", {
                  key: itemId,
                  "data-id": itemId,
                  oncreate: observeItem,
                  onbeforeremove: unobserveItem
                }, [
                  chatGroup.chats.map((chat) => {
                    return m(ChatItem, {
                      key: chat.uuid,
                      chat
                    })
                  })
                ])
              })
            ),

            // 3. 底部占位（外层节点全不带 key，遵循 none have keys 规范）
            m("", { style: { height: `${bottomPadding}px` } })
          ]),

          // AI 正在打字状态
          chatList?.replying ?
            m(ChatItem, {
              chat: {
                group: "preparing",
                content: chatList?.streamDisplayContent || chatList?.streamChunks,
                reasoning: chatList?.streamReasoningChunks,
                timestamp: Date.now(),
              },
              onupdate() {
                // 思考流/打字流持续推进：只要用户没有主动向上划，持续保持吸底
                if (!userHasScrolledUp) {
                  chatData.scrollChatListTobottom()
                }
              }
            }) : null,

          // 挂起指令确认框
          chatList?.confirmCmds?.filter(confirmCmd => confirmCmd.confirm === "pending").map((confirmCmd) => {
            return m(ChatConfirm, {
              confirmCmd,
              chatList
            })
          })
        ]),

        // 回到底部按钮
        !atBottom ? m(".back-to-bottom", {
          style: {
            position: "absolute",
            bottom: "1.5rem",
            right: "1.5rem",
            width: "2.4rem",
            height: "2.4rem",
            borderRadius: "50%",
            zIndex: 100,
            background: chatData.chatListUnreadCount > 0
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
          onclick() {
            atBottom = true
            chatData.chatListUnreadCount = 0
            isHovered = false
            lastScrollTime = Date.now()
            if (listDom) {
              listDom.scrollTop = listDom.scrollHeight
            }
          }
        }, [
          m.trust(window.iconPark.getIcon("Down", { size: "1.2rem", fill: chatData.chatListUnreadCount > 0 ? "#555" : getColor('右上角按钮文字') })),
          chatData.chatListUnreadCount > 0 ? m(".unread-badge", {
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
          }, chatData.chatListUnreadCount > 99 ? "99+" : chatData.chatListUnreadCount) : null
        ]) : null,

        // 回到顶部按钮
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
          onmouseenter: () => { isHoveredTop = true },
          onmouseleave: () => { isHoveredTop = false },
          onclick: async (e) => {
            e.stopPropagation()
            if (listDom) {
              listDom.scrollTop = 0
            }
          }
        }, [
          m.trust(window.iconPark.getIcon("Up", { size: "1.0rem", fill: getColor('右上角按钮文字') }))
        ]) : null,


      ])
    }
  }
}