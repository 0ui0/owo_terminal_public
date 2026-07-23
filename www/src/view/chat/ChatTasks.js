import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import Notice from "../common/notice.js"
import ChatNote from "./ChatNote.js"
import Tag from "../common/tag.js"

export default () => {
  let expanded = false;
  return {
    view({ attrs }) {
      const { chatList } = attrs;



      const notes = chatList?.notes || [];
      const hasGraph = chatList?.graph?.nodes && Object.keys(chatList.graph.nodes).length > 0;

      if ((!chatList?.tasks || chatList.tasks.length === 0) && notes.length === 0 && !hasGraph) return null;

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
                fill: task.status === "已完成" ? getColor('green').back : (task.status === "执行中" ? getColor('main').back : getColor('gray_8').back),
                size: depth === 0 ? "1.1rem" : "0.9rem",
                spin: task.status === "执行中"
              }
            )),
            m(".task-info", { style: { flex: 1 } }, [
              m(".task-name", {
                style: {
                  fontSize: depth === 0 ? "0.85rem" : "0.78rem",
                  color: getColor('gray_4').front,
                  fontWeight: depth === 0 ? "600" : "400"
                }
              }, task.name),
              m(".task-status-row", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.2rem" } }, [
                m(".task-status-tag", {
                  style: {
                    fontSize: "0.6rem",
                    padding: "0.02rem 0.3rem",
                    borderRadius: "0.2rem",
                    background: (task.status === "执行中" ? getColor('main').back : (task.status === "已完成" ? getColor('green').back : getColor('gray_8').back)) + '22',
                    color: task.status === "执行中" ? getColor('main').back : (task.status === "已完成" ? getColor('green').back : getColor('gray_8').back)
                  }
                }, task.status),
                m(".task-process-num", { style: { fontSize: "0.65rem", opacity: 0.6, color: getColor('gray_4').front } }, `${task.process}%`)
              ])
            ])
          ]),
          // 渲染子任务
          task.subtasks && task.subtasks.length > 0
            ? task.subtasks.map(sub => renderTaskEntry(sub, depth + 1))
            : null
        ]);
      };

      let tasks = chatList.tasks || [];
      let activeTask = tasks.find(t => t.status === "执行中") || tasks[0];

      return m(".task-board", {
        style: {
          position: "sticky",
          top: "0.5rem",
          right: "1.5rem",
          zIndex: 500,
          width: expanded ? "22rem" : "14rem",
          transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          float: "right",
          marginBottom: "-2.5rem",
        }
      }, [
        // 胶囊主体 (仅在有任务时显示)
        tasks.length > 0 ? m(".task-capsule", {
          style: {
            padding: "0.25rem 0.6rem 0.25rem 0.4rem",
            borderRadius: "2rem",
            background: getColor('右上角按钮背景') + 'dd',
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            border: `0.1rem solid ${getColor('右上角按钮文字') + '33'}`,
            width: "fit-content",
            maxWidth: "100%",
          },
          onclick: (e) => {
            e.stopPropagation();
            expanded = !expanded;
          }
        }, [
          m.trust(window.iconPark.getIcon(expanded ? "DocDetail" : "LoadingThree", {
            fill: getColor('右上角按钮文字'),
            size: "1.1rem",
            spin: !expanded
          })),
          m("span", {
            style: {
              fontSize: "0.85rem",
              color: getColor('右上角按钮文字'),
              fontWeight: "600",
              maxWidth: "8rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }
          }, activeTask?.name || ""),
          m(".progress-pill", {
            style: {
              padding: "0.1rem 0.5rem",
              background: getColor('右上角按钮文字'),
              color: getColor('右上角按钮背景'),
              borderRadius: "1rem",
              fontSize: "0.75rem",
              fontWeight: "900",
              letterSpacing: "0.05rem",
            }
          }, `${activeTask?.process || 0}%`)
        ]) : null,

        // 笔记按钮 (当有笔记历史或有网点图时显示)
        (notes.length > 0 || hasGraph) ? m(Tag, {
          isBtn: true,
          styleExt: {
            background: getColor('右上角按钮背景'),
            color: getColor('右上角按钮文字'),
            marginTop: "0.4rem",
            width: "fit-content",
            animation: "fadeIn 0.5s ease",
            display: "inline-flex",
            alignItems: "center"
          },
          ext: {
            onclick: (e) => {
              e.stopPropagation();
              Notice.launch({
                title: trs("组件/笔记/标题", { cn: "结构化笔记", en: "Structured Note" }),
                content: {
                  view: () => m(ChatNote, { notes, graph: chatList.graph })
                }
              });
            }
          }
        }, [
          m.trust(window.iconPark.getIcon("Notes", { size: "1.1rem", fill: "currentColor" })),
          m("span", {
            style: {
              fontSize: "0.85rem",
              fontWeight: "600",
              marginLeft: "0.3rem"
            }
          }, trs("组件/笔记/查看", { cn: "查看笔记", en: "View Note" }))
        ]) : null,

        // 展开的任务清单卡片 (支持 Tree)
        expanded ? m(".task-list-card", {
          style: {
            marginTop: "0.8rem",
            width: "100%",
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
              fontSize: "0.9rem",
              fontWeight: "bold",
              marginBottom: "0.8rem",
              display: "flex",
              justifyContent: "space-between",
              color: getColor('gray_4').front
            }
          }, [
            m("span", trs("聊天/任务清单", { cn: "任务明细", en: "Task Details" })),
            m("span", { style: { opacity: 0.6 } }, `${chatList.tasks.length}`)
          ]),
          m(".task-tree-container", chatList.tasks.map(task => renderTaskEntry(task)))
        ]) : null
      ]);
    }
  }
}
