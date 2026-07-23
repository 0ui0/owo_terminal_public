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

  // 动态平均高度估算（Dynamic Average Height Estimator）
  let totalMeasuredHeight = 0
  let measuredCount = 0
  function getEstimatedHeight() {
    return measuredCount > 0 ? Math.max(50, Math.floor(totalMeasuredHeight / measuredCount)) : 50
  }

  const BUFFER_ITEMS = 5

  let scrollTop = 0
  let viewportHeight = 800
  let lastScrollHeight = 0
  let tasksEl = null
  let boxEl = null
  let resizeObserver = null
  let isUserScrolledToBottom = true
  let lastDataLength = 0
  let currentChatListId = null
  let lastReplyingState = false
  let listDom = null
  let isHovered = false
  let isHoveredTop = false
  let lastProgrammaticScrollTime = 0
  let lastChatListHeadUuid = null

  // 缓存缓存 Key 与计算产物
  let lastCacheKey = ""
  let cachedScrollState = { visibleGroups: [], topPadding: 0, bottomPadding: 0 }

  // 虚拟滚动区间计算器（带依赖缓存保护）
  function getVirtualScrollState(chatList, headerHeight) {
    const listId = chatList?.id || 0
    const listData = chatData.computedLists[listId] || chatData.list || []
    const dataLength = listData.length
    const heightsCount = Object.keys(heightsMap).length

    // 组装缓存依赖 Key (加入列表首尾消息的 uuid，防止内容更替但长度不变时错误命中缓存)
    const headUuid = listData[0]?.uuid || ""
    const tailUuid = listData[listData.length - 1]?.uuid || ""
    const cacheKey = `${dataLength}_${scrollTop}_${viewportHeight}_${headerHeight}_${heightsCount}_${headUuid}_${tailUuid}`

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

    // 写入缓存
    lastCacheKey = cacheKey
    cachedScrollState = { visibleGroups, topPadding, bottomPadding }
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
            if (oldHeight !== undefined) {
              totalMeasuredHeight += (newHeight - oldHeight)
            } else {
              totalMeasuredHeight += newHeight
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
      isUserScrolledToBottom = true
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
      const { visibleGroups, topPadding, bottomPadding } = getVirtualScrollState(chatList, headerHeight)

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
            isUserScrolledToBottom = dom.scrollHeight - dom.scrollTop - dom.clientHeight < 250

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
                  // 补偿高度，保持相对浏览视口不动
                  requestAnimationFrame(() => {
                    dom.scrollTop = dom.scrollHeight - oldScrollHeight
                  })
                }
              }

              // 判断滚动方向：
              if (newScrollTop < scrollTop - 1) {
                if (Date.now() - lastProgrammaticScrollTime > 300) {
                  isUserScrolledToBottom = false
                }
              }
              else if (newScrollTop > scrollTop + 1) {
                if (distToBottom < 250) {
                  isUserScrolledToBottom = true
                }
              }

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
              isUserScrolledToBottom = true
              chatData.initChatLists(listId)
              chatData.chatLists[listId].pull().then(() => {
                chatData.getHistoryList(listId)
                m.redraw()
                requestAnimationFrame(() => {
                  dom.scrollTop = dom.scrollHeight
                })
              })
            }

            // 当列表增加新消息时
            const listData = chatData.computedLists[currentChatListId] || chatData.list || []
            const currentDataLength = listData.length
            if (currentDataLength > lastDataLength) {
              const headUuid = listData[0]?.uuid
              const isHistoryPull = lastDataLength > 0 && headUuid !== lastChatListHeadUuid
              if (isHistoryPull) {
                isUserScrolledToBottom = false
              } else {
                isUserScrolledToBottom = true
              }
              lastDataLength = currentDataLength
            } else if (currentDataLength < lastDataLength) {
              lastDataLength = currentDataLength
              if (isUserScrolledToBottom) {
                lastProgrammaticScrollTime = Date.now()
                requestAnimationFrame(() => {
                  if (dom) dom.scrollTop = dom.scrollHeight
                })
              }
            }
            lastChatListHeadUuid = (chatData.computedLists[currentChatListId] || chatData.list || [])[0]?.uuid

            const isReplying = chatList?.replying || false
            if (isReplying && !lastReplyingState) {
              isUserScrolledToBottom = true
            }
            lastReplyingState = isReplying

            if (lastScrollHeight !== dom.scrollHeight) {
              if (isUserScrolledToBottom) {
                lastProgrammaticScrollTime = Date.now()
                requestAnimationFrame(() => {
                  if (dom) dom.scrollTop = dom.scrollHeight
                })
              }
              lastScrollHeight = dom.scrollHeight
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

          // 核心消息流（应用虚拟滚动）
          m("", [
            // 虚拟滚动上方占位
            m("", { key: "top-spacer", style: { height: `${topPadding}px` } }),
            ...visibleGroups.map(chatGroup => {
              const itemId = chatGroup.toolCallGroupId ? (chatGroup.toolCallGroupId + "_" + chatGroup.chats[0].uuid) : chatGroup.chats[0].uuid
              return m("", {
                key: itemId,
                "data-id": itemId,
                oncreate(itemVnode) {
                  resizeObserver.observe(itemVnode.dom)
                },
                onbeforeremove(itemVnode) {
                  resizeObserver.unobserve(itemVnode.dom)
                }
              }, [
                chatGroup.toolCallGroupId ?
                  m(ToolCallGroup, { key: chatGroup.toolCallGroupId, chats: chatGroup.chats }) :
                  chatGroup.chats[0].isPlaceholder ?
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
                    }, "Loading...") :
                    chatGroup.chats.map((chat) =>
                      chat.tool_calls ? null : m(ChatItem, {
                        key: chat.uuid,
                        chat,
                      })
                    )
              ])
            }),
            // 虚拟滚动下方占位
            m("", { key: "bottom-spacer", style: { height: `${bottomPadding}px` } }),
          ]),

          // AI 正在打字状态
          chatList?.replying ?
            m(ChatItem, {
              chat: {
                group: "preparing",
                content: chatList?.streamDisplayContent || chatList?.streamChunks,
                reasoning: chatList?.streamReasoningChunks,
                timestamp: Date.now(),
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
        !isUserScrolledToBottom ? m(".back-to-bottom", {
          style: {
            position: "absolute",
            bottom: "1.5rem",
            right: "1.5rem",
            width: "2.4rem",
            height: "2.4rem",
            borderRadius: "50%",
            zIndex: 100,
            background: isHovered ? getColor('右上角按钮背景') + "ee" : getColor('右上角按钮背景') + "cc",
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
            isUserScrolledToBottom = true
            isHovered = false
            lastProgrammaticScrollTime = Date.now()
            if (listDom) {
              listDom.scrollTop = listDom.scrollHeight
            }
          }
        }, [
          m.trust(window.iconPark.getIcon("Down", { size: "1.2rem", fill: getColor('右上角按钮文字') }))
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