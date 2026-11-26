// 会话任务进度与笔记快捷入口（嵌入消息列表顶部悬浮栏） + 任务明细弹窗

import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import Notice from "../common/notice.js"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import IconTag from "../common/iconTag.js"
import ChatNote from "./ChatNote.js"
import comData from "../../comData/comData.js"

const getStatusColorName = (statusStr) => statusStr === "执行中"
  ? "main"
  : statusStr === "已完成"
    ? "green_1"
    : "gray_2"

const getStatusIconName = (statusStr) => statusStr === "已完成"
  ? "CheckOne"
  : statusStr === "执行中"
    ? "LoadingOne"
    : "Timer"

// 递归渲染任务树条目（保留简洁圆环状态图标 + 原生 Tag + 百分比）
const renderTaskEntry = (task, depthNum = 0, isLastBool = true) => {
  const statusColorStr = getStatusColorName(task.status)
  const pctNum = Math.max(0, Math.min(100, Number(task.process) || 0))
  const isDoneBool = task.status === "已完成" || pctNum >= 100
  const hasSubtasksBool = Boolean(task.subtasks && task.subtasks.length > 0)

  return m.fragment(
    {
      key: `${task.taskid || task.subtaskid}_${depthNum}`
    },
    [
      m(
        "",
        {
          style: {
            display: "flex",
            alignItems: "flex-start",
            gap: `${getSize(1)}rem`,
            paddingTop: `${getSize(1)}rem`,
            paddingBottom: `${getSize(1)}rem`,
            paddingLeft: `${getSize(depthNum * 3)}rem`,
            borderBottom: isLastBool && !hasSubtasksBool
              ? "none"
              : `${getSize(0.25)}rem solid rgba(0,0,0,0.12)`,
            opacity: isDoneBool ? 0.78 : 1,
            minWidth: 0
          }
        },
        [
          m(
            "span",
            {
              style: {
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                marginTop: `${getSize(1)}rem`
              }
            },
            m.trust(window.iconPark.getIcon(
              getStatusIconName(task.status),
              {
                fill: isDoneBool
                  ? getColor("green_1").back
                  : task.status === "执行中"
                    ? getColor("main").back
                    : getColor("gray_3").front,
                size: `${getSize(5)}rem`,
                spin: task.status === "执行中"
              }
            ))
          ),
          m(
            "",
            {
              style: {
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(1)}rem`
              }
            },
            [
              m(
                "",
                {
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    lineHeight: `${getSize(4)}rem`,
                    color: getColor("gray_3").front,
                    overflowWrap: "anywhere",
                    wordBreak: "break-word"
                  }
                },
                task.name
              ),
              m(
                "",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: `${getSize(1)}rem`
                  }
                },
                [
                  m(
                    Tag,
                    {
                      color: statusColorStr
                    },
                    task.status
                  ),
                  m(
                    "span",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        color: getColor("gray_3").front,
                        whiteSpace: "nowrap"
                      }
                    },
                    `${pctNum}%`
                  )
                ]
              )
            ]
          )
        ]
      ),
      hasSubtasksBool
        ? task.subtasks.map((sub, idxNum) => renderTaskEntry(sub, depthNum + 1, idxNum === task.subtasks.length - 1))
        : null
    ]
  )
}

// 弹出任务明细 Notice 窗口（外层先铺一层系统默认 Box，任务卡片铺 gray_3 大圆角底）
const showTaskMenu = (e, chatList) => {
  e.stopPropagation()
  // 锤定触发胶囊：窗口右缘对齐胶囊右缘、向下弹出，保持「右上角小窗」形态（参见 aiDocs/Notice说明.md）
  const rectAnchor = e.currentTarget.getBoundingClientRect()
  const winWNum = getSize(90) * 10
  const winHNum = getSize(80) * 10
  Notice.launch({
    sign: `chat_tasks_${chatList.id}`,
    hideBtn: 2,
    width: winWNum,
    height: winHNum,
    win: {
      x: rectAnchor.right - winWNum,
      y: rectAnchor.bottom + 5
    },
    tip: trs("聊天/任务清单", { cn: "任务明细", en: "Task Details" }),
    content: {
      view(vnode) {
        const listObj = comData.getChatList(vnode.attrs.listId)
        const tasksArr = listObj && listObj.tasks ? listObj.tasks : []

        return m(
          Box,
          {
            isBlock: true,
            style: {
              width: "100%",
              margin: 0,
              boxSizing: "border-box",
              padding: `${getSize(3)}rem`,
              display: "flex",
              flexDirection: "column",
              gap: `${getSize(3)}rem`
            }
          },
          [
            m(
              "",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: `${getSize(2)}rem`,
                  flexShrink: 0
                }
              },
              [
                m(
                  "span",
                  {
                    style: {
                      fontSize: `${getSize(4)}rem`
                    }
                  },
                  trs("聊天/任务清单", { cn: "任务明细", en: "Task Details" })
                ),
                m(
                  Tag,
                  {
                    color: "main"
                  },
                  `${tasksArr.length}`
                )
              ]
            ),
            tasksArr.length === 0
              ? m(
                "",
                {
                  style: {
                    flexShrink: 0,
                    background: getColor("gray_3").back,
                    color: getColor("gray_3").front,
                    borderRadius: `${getSize(8)}rem`,
                    padding: `${getSize(3)}rem`,
                    textAlign: "center",
                    fontSize: `${getSize(3)}rem`
                  }
                },
                trs("聊天/暂无任务", { cn: "暂无任务记录", en: "No tasks yet" })
              )
              : m(
                "",
                {
                  style: {
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: `${getSize(3)}rem`,
                    minWidth: 0
                  }
                },
                tasksArr.map(task => m(
                  "",
                  {
                    key: task.taskid || task.subtaskid || task.name,
                    style: {
                      flexShrink: 0,
                      background: getColor("gray_3").back,
                      color: getColor("gray_3").front,
                      borderRadius: `${getSize(8)}rem`,
                      padding: `${getSize(3)}rem`,
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0
                    }
                  },
                  renderTaskEntry(task, 0, true)
                ))
              )
          ]
        )
      }
    },
    contentAttrs: {
      listId: chatList.id
    }
  })
}

export default () => ({
  view({ attrs }) {
    const chatList = attrs.chatList
    const tasksArr = chatList && chatList.tasks ? chatList.tasks : []
    const notesArr = chatList && chatList.notes ? chatList.notes : []
    const hasGraphBool = Boolean(chatList && chatList.graph && chatList.graph.nodes && Object.keys(chatList.graph.nodes).length > 0)

    if (tasksArr.length === 0 && notesArr.length === 0 && !hasGraphBool) {
      return null
    }

    const activeTask = tasksArr.find(t => t.status === "执行中") || tasksArr[0]
    const isCompactBool = attrs.isCompact !== undefined ? Boolean(attrs.isCompact) : Boolean(window.Mob)

    return m(
      "",
      {
        style: {
          display: "flex",
          flexDirection: isCompactBool ? "row" : "column",
          alignItems: isCompactBool ? "center" : "flex-end",
          gap: `${getSize(1)}rem`,
          flexShrink: 0,
          pointerEvents: "auto"
        }
      },
      [
        tasksArr.length > 0
          ? m(
            IconTag,
            {
              iconName: "DocDetail",
              bgColor: "transparent",
              fgColor: getColor("消息列表前景"),
              ext: {
                title: activeTask && activeTask.name
                  ? `${activeTask.name} (${activeTask.process || 0}%)`
                  : trs("聊天/任务清单", { cn: "任务明细", en: "Task Details" }),
                onclick(e) {
                  showTaskMenu(e, chatList)
                }
              }
            },
            [
              !isCompactBool
                ? m(
                  "span",
                  {
                    style: {
                      maxWidth: `${getSize(36)}rem`,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }
                  },
                  activeTask && activeTask.name ? activeTask.name : ""
                )
                : null,
              `${activeTask && activeTask.process ? activeTask.process : 0}%`
            ]
          )
          : null,

        notesArr.length > 0 || hasGraphBool
          ? m(
            IconTag,
            {
              iconName: "Notes",
              isBtn: true,
              bgColor: "transparent",
              fgColor: getColor("消息列表前景"),
              ext: {
                title: trs("组件/笔记/查看", { cn: "笔记", en: "Note" }),
                onclick(e) {
                  e.stopPropagation()
                  Notice.launch({
                    sign: `chat_note_${chatList.id}`,
                    hideBtn: 2,
                    tip: trs("组件/笔记/标题", { cn: "笔记", en: "Notes" }),
                    content: {
                      view(vnode) {
                        const listObj = comData.getChatList(vnode.attrs.listId)
                        return m(ChatNote, {
                          notes: listObj && listObj.notes ? listObj.notes : [],
                          graph: listObj ? listObj.graph : null
                        })
                      }
                    },
                    contentAttrs: {
                      listId: chatList.id
                    }
                  })
                }
              }
            },
            !isCompactBool ? trs("组件/笔记/查看", { cn: "笔记", en: "Note" }) : ""
          )
          : null
      ]
    )
  }
})
