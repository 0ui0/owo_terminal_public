import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import Tag from "../common/tag.js"
import mermaid from "mermaid"
import format from "../common/format.js"

// 初始化 Mermaid 配置，使用暗色主题适配终端
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'monospace',
  themeVariables: {
    primaryColor: getColor('main').back,
    primaryTextColor: getColor('main').front,
    lineColor: getColor('main').back + '88',
  }
});

/**
 * 结构化笔记查看器
 * 集成了 Mermaid 渲染引擎的战术沙盘
 */
export default () => {
  let expandedStates = {};

  // 生成 Mermaid 源码
  const buildMermaidCode = (graph) => {
    if (!graph || !graph.nodes || Object.keys(graph.nodes).length === 0) return null;
    let res = "graph TD\n";
    for (const id in graph.nodes) {
      const label = (graph.nodes[id].label || "").replace(/"/g, "'");
      res += `  ${id}["${label}"]\n`;
    }
    if (graph.links) {
      graph.links.forEach(l => {
        // 兼容新旧格式，优先使用 from/to
        const from = l.from || l.source;
        const to = l.to || l.target;
        if (from && to) {
          res += `  ${from} --> ${to}\n`;
        }
      });
    }
    return res;
  };

  // 渲染 Mermaid 到 DOM 的辅助函数
  const renderGraph = (dom, code) => {
    if (!code) return;
    const id = "mermaid_" + Math.random().toString(36).slice(2, 9);
    try {
      mermaid.render(id, code).then(({ svg }) => {
        dom.innerHTML = svg;
        m.redraw(); // 渲染完成后通知 Mithril 重绘，确保高度被捕捉
      }).catch(err => {
        console.error("Mermaid 渲染失败:", err);
        dom.innerText = "沙盘渲染故障喵: " + err.message;
        m.redraw();
      });
    } catch (e) {
      console.error(e);
    }
  };

  return {
    view({ attrs }) {
      const { notes = [], graph = null } = attrs;
      const mermaidCode = buildMermaidCode(graph);

      return m("", {
        style: {
          padding: "1.5rem",
          background: getColor('gray_4').back,
          minHeight: "20rem",
          maxHeight: "85vh",
          overflowY: "auto",
          color: getColor('gray_4').front,
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem"
        }
      }, [
        // 1. 顶部：战术沙盘 (Mermaid 实时渲染)
        mermaidCode ? m("", {
          style: {
            padding: "1.2rem",
            background: "#0d1117",
            borderRadius: "1.2rem",
            border: `0.1rem solid ${getColor('main').back + '44'}`,
            position: "relative",
            minHeight: "150px",
            flexShrink: 0, // 防止被内容挤压
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)",
            overflow: "hidden" // 确保背景网格不溢出
          }
        }, [
          // 装饰背景网格
          m("", {
            style: {
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(${getColor('main').back + '11'} 1px, transparent 1px), linear-gradient(90deg, ${getColor('main').back + '11'} 1px, transparent 1px)`,
              backgroundSize: "20px 20px",
              pointerEvents: "none"
            }
          }),
          // 标题
          m("", {
            style: {
              width: "100%",
              fontSize: "0.85rem",
              fontWeight: "bold",
              color: getColor('main').back,
              marginBottom: "1rem",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }
          }, [
            m.trust(window.iconPark.getIcon("TrendTwo", { size: "1rem" })),
            "TACTICAL SANDBOX / 战术沙盘拓扑"
          ]),
          // Mermaid 容器
          m(".mermaid-viewer", {
            style: {
              width: "100%",
              display: "block", // 改为 block 配合 flex-column 撑开高度
              zIndex: 2,
              paddingBottom: "1.5rem" // 为底部节点预留呼吸空间
            },
            oncreate: (vnode) => renderGraph(vnode.dom, mermaidCode)
          })
        ]) : null,

        // 2. 笔记长廊
        notes.length === 0 ? m("", {
          style: { padding: "4rem 0", textAlign: "center", opacity: 0.5 }
        }, "暂无笔记数据喵...") : notes.map((memoryItem, mIdx) => {
          const note = memoryItem.note;
          if (!note) return null;
          const isStringNote = typeof note === "string";

          return m("", {
            key: mIdx,
            style: { borderBottom: `0.1rem dashed ${getColor('main').back + '22'}`, paddingBottom: "1.5rem" }
          }, [
            m("", {
              style: { fontSize: "0.8rem", opacity: 0.5, marginBottom: "1rem", display: "flex", justifyContent: "space-between" }
            }, [
              m("span", `[MSG_ID: ${memoryItem.id}]`),
              m("span", memoryItem.time ? new Date(memoryItem.time).toLocaleString() : "")
            ]),

            isStringNote ? m(".article", {
              style: {
                padding: "1.2rem",
                background: getColor('gray_8').back + '44',
                borderRadius: "1rem",
                border: `0.05rem solid ${getColor('main').back + '22'}`,
                lineHeight: "1.7",
                fontSize: "1.1rem",
                color: getColor('gray_4').front
              }
            }, m.trust(format(note, "markdown"))) : [
              m("", [
                m("", {
                  style: { fontSize: "1rem", fontWeight: "bold", borderLeft: `0.3rem solid ${getColor('main').back}`, paddingLeft: "0.8rem", marginBottom: "0.8rem" }
                }, trs("组件/笔记/交互记忆", { cn: "交互记忆", en: "Interaction Memory" })),
                m("", {
                  style: { padding: "1rem", background: getColor('gray_8').back + '66', borderRadius: "1rem", border: `0.05rem solid ${getColor('main').back + '33'}`, lineHeight: "1.6", fontSize: "1.1rem" }
                }, [
                  note.memory ? [
                    note.memory.when && m("", [m(Tag, trs("组件/笔记/时间", { cn: "时间", en: "when" })), m("span", note.memory.when)]),
                    note.memory.where && m("", [m(Tag, trs("组件/笔记/地点", { cn: "地点", en: "where" })), m("span", note.memory.where)]),
                    note.memory.who && m("", [m(Tag, trs("组件/笔记/人物", { cn: "人物", en: "who" })), m("span", note.memory.who)]),
                    note.memory.why && m("", [m(Tag, trs("组件/笔记/起因", { cn: "起因", en: "why" })), m("span", note.memory.why)]),
                    note.memory.how && m("", [m(Tag, trs("组件/笔记/经过", { cn: "经过", en: "how" })), m("span", note.memory.how)]),
                    note.memory.what && m("", [m(Tag, trs("组件/笔记/结果", { cn: "结果", en: "what" })), m("span", note.memory.what)])
                  ] : "无结构化记忆"
                ])
              ]),

              note.focus ? m("", { style: { marginTop: "1rem" } }, [
                m("", {
                  style: { fontSize: "1rem", fontWeight: "bold", borderLeft: `0.3rem solid ${getColor('main').back}`, paddingLeft: "0.8rem", marginBottom: "0.8rem" }
                }, trs("组件/笔记/关注项", { cn: "核心关注点", en: "Key Focus" })),
                m("", { style: { display: "flex", flexDirection: "column", gap: "1rem" } }, note.focus.map((item, fIdx) => {
                  const uniqueIdx = `${mIdx}_${fIdx}`;
                  const isExpanded = !!expandedStates[uniqueIdx];
                  return m("", {
                    key: fIdx,
                    style: {
                      background: getColor('gray_8').back,
                      borderRadius: "1.2rem",
                      border: `0.05rem solid ${isExpanded ? getColor('main').back : getColor('main').back + '11'}`,
                      overflow: "hidden"
                    }
                  }, [
                    m("", {
                      style: {
                        padding: "0.8rem 1.2rem",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: isExpanded ? getColor('main').back + '11' : "transparent"
                      },
                      onclick: () => expandedStates[uniqueIdx] = !isExpanded
                    }, [
                      m("", { style: { display: "flex", gap: "0.8rem", alignItems: "center" } }, [
                        m("", {
                          style: {
                            fontSize: "0.85rem",
                            background: getColor('main').back,
                            color: getColor('main').front,
                            padding: "0.1rem 0.6rem",
                            borderRadius: "2rem",
                            fontWeight: "bold"
                          }
                        }, item.target),
                        m("", { style: { fontSize: "0.95rem", opacity: 0.8 } }, item.step)
                      ]),
                      m.trust(window.iconPark.getIcon(isExpanded ? "Up" : "Down", { size: "1rem", fill: getColor('gray_4').front }))
                    ]),
                    isExpanded ? m("", {
                      style: { padding: "1rem 1.2rem", borderTop: `0.05rem solid ${getColor('main').back + '11'}` }
                    }, [
                      item.code ? (
                        item.code.content !== "无代码" ? m("", [
                          m("", { style: { fontSize: "0.75rem", opacity: 0.5, marginBottom: "0.3rem" } }, `L${item.code.lineS} - L${item.code.lineE}`),
                          m("pre", {
                            style: {
                              background: "#282c34",
                              color: "#abb2bf",
                              padding: "0.8rem",
                              borderRadius: "0.5rem",
                              fontSize: "0.9rem",
                              overflowX: "auto",
                              margin: "0 0 1rem 0",
                              wordWrap: "break-all",
                              whiteSpace: "pre-wrap"
                            }
                          }, item.code.content)
                        ]) : m("", {
                          style: {
                            fontSize: "0.8rem",
                            opacity: 0.3,
                            marginBottom: "1rem",
                            fontStyle: "italic",
                            padding: "0.5rem",
                            border: `0.05rem dashed ${getColor('main').back + '33'}`,
                            borderRadius: "0.5rem",
                            textAlign: "center"
                          }
                        }, trs("组件/笔记/无代码快照", { cn: "(无关联代码快照)", en: "(No related code snapshot)" }))
                      ) : null,
                      m("", (item.comments || []).map((c, cIdx) =>
                        m("", {
                          key: cIdx,
                          style: { paddingLeft: "1rem", position: "relative", marginBottom: "0.8rem" }
                        }, [
                          m("", { style: { position: "absolute", left: "0", top: "0.4rem", width: "0.4rem", height: "0.4rem", borderRadius: "50%", background: getColor('main').back } }),
                          m("", [
                            m("span", { style: { fontWeight: "bold", color: getColor('main').back } }, `[${c.order}] `),
                            m("span", { style: { opacity: 0.8 } }, trs("组件/笔记/因为", { cn: "【因为】", en: "[Since] " })),
                            m("span", { style: { fontSize: "1.2rem" } }, c.since),
                            m("br"),
                            m("span", { style: { opacity: 0.8 } }, trs("组件/笔记/所以", { cn: "【所以】", en: "[Therefore] " })),
                            m("span", { style: { fontSize: "1.2rem" } }, c.therefore),
                            m("br"),
                            m("span", { style: { opacity: 0.8 } }, trs("组件/笔记/依据", { cn: "【依据】", en: "[By] " })),
                            m("span", { style: { fontSize: "1.2rem" } }, c.by),
                            c.comment && m("", [
                              m("span", { style: { opacity: 0.5, fontSize: "0.85rem", fontStyle: "italic" } }, ` (${c.comment})`)
                            ])
                          ])
                        ])
                      ))
                    ]) : null
                  ]);
                }))
              ]) : null
            ]
          ]);
        })
      ]);
    }
  }
}
