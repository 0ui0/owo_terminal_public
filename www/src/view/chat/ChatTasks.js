import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import Notice from "../common/notice.js"
import ChatNote from "./ChatNote.js"
import Tag from "../common/tag.js"
import comData from "../../comData/comData.js"
import IconTag from "../common/iconTag.js"

export default () => {
  const renderTaskEntry = (task, depth = 0) => {
    const itemKey = (task.taskid || task.subtaskid) + "_" + depth;
    return m.fragment({ key: itemKey }, [
      m(".task-item", {
        style: {
          display: "flex",
          alignItems: "flex-start",
          gap: "0.8rem",
          padding: "0.6rem 0",
          paddingLeft: `${depth * 1.5}rem`,
          borderBottom: (depth === 0) ? `0.05rem solid ${getColor('gray_4').front + '11'}` : "none",
          position: "relative",
          opacity: task.status === "已完成" ? 0.6 : 1,
        }
      }, [
        // 引导线
        depth > 0 ? m(".indent-line", {
          style: {
            position: "absolute",
            left: `${(depth - 1) * 1.5 + 0.5}rem`,
            top: 0,
            bottom: "50%",
            width: "0.05rem",
            borderLeft: `0.05rem dashed ${getColor('gray_4').front + '44'}`,
          }
        }) : null,

        m.trust(window.iconPark.getIcon(
              task.status === "已完成" ? "CheckOne" : (task.status === "执行中" ? "LoadingOne" : "Timer"),
              {
                fill: task.status === "已完成" ? getColor('green_1').back : (task.status === "执行中" ? getColor('main').back : getColor('gray_8').back),
                size: "1.6rem",
                spin: task.status === "执行中"
              }
            )),
        m(".task-info", { style: { flex: 1, minWidth: "0" } }, [
          m(".task-name", {
            style: {
              // 默认字号（不设 fontSize），文字色用高对比 front
              color: getColor('gray_1').front,
              fontWeight: depth === 0 ? "600" : "400",
              wordBreak: "break-word"
            }
          }, task.name),
          m(".task-status-row", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.2rem" } }, [
            m(".task-status-tag", {
              style: {
                // 默认字号；背景用同色 back（实色），文字用同色 front，保证对比清晰
                padding: "0.05rem 0.4rem",
                borderRadius: "0.2rem",
                background: task.status === "执行中" ? getColor('main').back : (task.status === "已完成" ? getColor('green_1').back : getColor('gray_3').back),
                color: task.status === "执行中" ? getColor('main').front : (task.status === "已完成" ? getColor('green_1').front : getColor('gray_3').front)
              }
            }, task.status),
            m(".task-process-num", { style: { color: getColor('gray_1').front } }, `${task.process}%`)
          ])
        ])
      ]),
      // 渲染子任务
      task.subtasks && task.subtasks.length > 0
        ? task.subtasks.map(sub => renderTaskEntry(sub, depth + 1))
        : null
    ]);
  };

  // 通过 Notice 弹出任务明细（参考 FileMenu 的坐标定位方式）
  const showTaskMenu = (e, chatList) => {
    e.stopPropagation();
    const listId = chatList.id;
    const rect = e.currentTarget.getBoundingClientRect();
    const winW = 360;
    Notice.launch({
      group: "taskMenu",
      width: winW,
      hideBtn: 2,
      // 胶囊在右上角：窗口右缘对齐胶囊右缘，向下弹出，避免超出屏幕右侧
      win: { x: rect.right - winW, y: rect.bottom + 5 },
      tip: trs("聊天/任务清单", { cn: "任务明细", en: "Task Details" }),
      content: {
        view: (vnode) => {
          // 每次渲染从 comData 实时读取（comData 更新后 chatLists 引用会替换，必须实时取）
          const tasks = comData.getChatList(vnode.attrs.listId)?.tasks || [];
          return m(".task-list-card", {
            style: {
              maxHeight: "32rem",
              overflowY: "auto",
              background: getColor('gray_4').back + 'f2',
              backdropFilter: "blur(20px)",
              borderRadius: "1.5rem",
              padding: "1rem",
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              border: `0.1rem solid ${getColor('main').back + '66'}`,
              animation: "slideIn 0.3s ease-out"
            }
          }, [
            m(".task-header", {
              style: {
                fontWeight: "bold",
                marginBottom: "0.8rem",
                display: "flex",
                justifyContent: "space-between",
                color: getColor('gray_1').front
              }
            }, [
              m("span", trs("聊天/任务清单", { cn: "任务明细", en: "Task Details" })),
              m("span", {}, `${tasks.length}`)
            ]),
            m(".task-tree-container", tasks.map(task => renderTaskEntry(task)))
          ])
        }
      },
      contentAttrs: { listId }
    })
  }

  return {
    view({ attrs }) {
      const { chatList } = attrs;
      const notes = chatList?.notes || [];
      const hasGraph = chatList?.graph?.nodes && Object.keys(chatList.graph.nodes).length > 0;

      if ((!chatList?.tasks || chatList.tasks.length === 0) && notes.length === 0 && !hasGraph) return null;

      let tasks = chatList.tasks || [];
      let activeTask = tasks.find(t => t.status === "执行中") || tasks[0];

      return m(".task-board", {
        style: {
          position: "sticky",
          top: "1rem",
          right: "1.5rem",
          zIndex: 500,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          float: "right",
          marginTop:"1rem",
          marginBottom: "-2.5rem",
        }
      }, [
        // 胶囊主体 (点击弹出任务明细)
        tasks.length > 0 ? m(IconTag, {
          iconName:"DocDetail",

          bgColor: getColor('red_2').back,
          fgColor: getColor('red_2').front,

          styleExt:{
            transform: "scale(0.8)",
            transformOrigin: "right center",
          },

          ext:{
            onclick: (e) => showTaskMenu(e, chatList)
          }
          
        }, [
          m("span",activeTask?.name || ""),

          m(".progress-pill", {
            style: {
              padding: "0.1rem 0.5rem",
              background:"rgba(255,255,255,0.5)",
              color:"#333",
              borderRadius: "1rem",
              marginLeft:"0 0.5rem",
            }
          }, `${activeTask?.process || 0}%`)
        ]) : null,

        // 笔记按钮 (当有笔记历史或有网点图时显示)
        (notes.length > 0 || hasGraph) ? m(IconTag, {
          iconName: "Notes",
          isBtn: true,
          bgColor: getColor('red_1').back,
          fgColor: getColor('red_1').front,
          styleExt:{
            transform: "scale(0.8)",
            transformOrigin: "right center",
          },
          ext: {
            onclick: (e) => {
              e.stopPropagation();
              Notice.launch({
                tip: trs("组件/笔记/标题", { cn: "结构化笔记", en: "Structured Note" }),
                content: {
                  view: (vnode) => {
                    // 每次渲染从 comData 实时读取，AI 更新笔记/网点图后弹窗同步刷新
                    const list = comData.getChatList(vnode.attrs.listId);
                    return m(ChatNote, { notes: list?.notes || [], graph: list?.graph });
                  }
                },
                contentAttrs: { listId: chatList.id }
              });
            }
          }
        }, [
          m("span",trs("组件/笔记/查看", { cn: "查看笔记", en: "View Note" }))
        ]) : null
      ]);
    }
  }
}
