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
  const DEFAULT_HEIGHT = 150
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
  let lastProgrammaticScrollTime = 0
  let lastChatListHeadUuid = null

  // 缓存缓存 Key 与计算产物
  let lastCacheKey = ""
  let cachedScrollState = { visibleGroups: [], topPadding: 0, bottomPadding: 0 }

  // 虚拟滚动区间计算器（带依赖缓存保护）
  function getVirtualScrollState(chatList, headerHeight) {
    const listData = chatData.list || []
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
      const itemId = group.toolCallGroupId || group.chats[0].uuid
      const itemHeight = heightsMap[itemId] || DEFAULT_HEIGHT

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
      const itemId = group.toolCallGroupId || group.chats[0].uuid
      topPadding += heightsMap[itemId] || DEFAULT_HEIGHT
    }

    let bottomPadding = 0
    for (let i = renderEndIndex + 1; i < chatGroups.length; i++) {
      const group = chatGroups[i]
      const itemId = group.toolCallGroupId || group.chats[0].uuid
      bottomPadding += heightsMap[itemId] || DEFAULT_HEIGHT
    }

    const visibleGroups = chatGroups.slice(renderStartIndex, renderEndIndex + 1)

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
        chatData.initChatRows(listId)
        await chatData.chatRows.pull()
        chatData.list = chatData.getHistoryList()
        m.redraw()
      } catch (e) {
        console.error("[ChatList] initChatRows failed:", e)
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
          height: "100%",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr",
          overflow: "hidden",
          position: "relative",
        }
      }, [
        m(`#chatList_${chatList?.id || 0}.chatList`, {
          style: {
            height: "100%",
            overflowY: "auto",
            position: "relative",
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
              if (newScrollTop === 0) {
                if (chatData.chatRows && !chatData.chatRows.isToEnd()) {
                  const oldScrollHeight = dom.scrollHeight
                  chatData.chatRows.clickFn()
                  await chatData.chatRows.pull()
                  chatData.list = chatData.getHistoryList()
                  m.redraw()
                  // 补偿高度，保持相对浏览视口不动
                  requestAnimationFrame(() => {
                    dom.scrollTop = dom.scrollHeight - oldScrollHeight
                  })
                }
              }

              // 判断滚动方向：
              // 只要向上滚动，立即解除置底锁定，避免用户被吸附在底部（摆脱 250px 的引力井）
              if (newScrollTop < scrollTop - 1) {
                if (Date.now() - lastProgrammaticScrollTime > 300) {
                  isUserScrolledToBottom = false
                }
              }
              // 如果向下滚动，只要触底就恢复 true；如果没触底（可能是由于程序强制置底但由于高度再次突增导致没贴到底），则保持原状态
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
              chatData.initChatRows(listId)
              chatData.chatRows.pull().then(() => {
                chatData.list = chatData.getHistoryList()
                m.redraw()
                requestAnimationFrame(() => {
                  dom.scrollTop = dom.scrollHeight
                })
              })
            }

            // 当列表增加新消息时
            const currentDataLength = chatData.list.length
            if (currentDataLength > lastDataLength) {
              const headUuid = chatData.list[0]?.uuid
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
                // 撤销导致消息变少时，且用户本来就在底部，则强锁时间戳并异步重新置底，防止浏览器自动回弹触发滚动事件误判
                lastProgrammaticScrollTime = Date.now()
                requestAnimationFrame(() => {
                  if (dom) dom.scrollTop = dom.scrollHeight
                })
              }
            }
            lastChatListHeadUuid = chatData.list[0]?.uuid

            // 当 AI 开始回复时，会出现一个临时的 preparing 节点（流式输出/思考中框框）
            // 由于该节点不在 chatList.data 中，所以需要通过 replying 状态的变化来捕捉它
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
                console.log("chatLists", comData.data.get().chatLists)
              }
            },
          }, [
            chatList?.id === 0
              ? trs("通用/消息列表", { cn: "消息列表", en: "Message List" })
              : `${trs("通用/返回上一级", { cn: "返回上一级", en: "Back to Parent" })}(${trs("通用/子会话", { cn: "子会话", en: "Sub Session" })} ${chatList?.id})`
          ]),

          // 核心消息流（应用虚拟滚动）
          m("", [
            // 虚拟滚动上方占位，维持滚动条行程与高度
            m("", { key: "top-spacer", style: { height: `${topPadding}px` } }),
            ...visibleGroups.map(chatGroup => {
              const itemId = chatGroup.toolCallGroupId || chatGroup.chats[0].uuid
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
                  m(ChatItem, {
                    key: chatGroup.chats[0].uuid,
                    chat: chatGroup.chats[0],
                  })
              ])
            }),
            // 虚拟滚动下方占位，维持滚动条行程与高度
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

        // 回到底部按钮（当用户向上滚动脱离置底状态时显示）
        !isUserScrolledToBottom ? m(".back-to-bottom", {
          style: {
            position: "absolute",
            bottom: "1.5rem",
            right: "1.5rem",
            width: "2.4rem",
            height: "2.4rem",
            borderRadius: "50%",
            zIndex: 100,
            background: isHovered ? getColor('main').back + "b0" : getColor('main').back + "80",
            color: getColor('main').front,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            animation: "fadeIn 0.2s ease",
            backdropFilter: "blur(8px)",
            border: `0.1rem solid ${getColor('main').front + '22'}`,
            transition: "all 0.2s ease",
          },
          onmouseenter() {
            isHovered = true
          },
          onmouseleave() {
            isHovered = false
          },
          onclick() {
            isUserScrolledToBottom = true
            isHovered = false
            lastProgrammaticScrollTime = Date.now()
            if (listDom) {
              listDom.scrollTop = listDom.scrollHeight
            }
          }
        }, [
          m.trust(window.iconPark.getIcon("Down", { size: "1.2rem", fill: getColor('main').front }))
        ]) : null,


      ])
    }
  }
}