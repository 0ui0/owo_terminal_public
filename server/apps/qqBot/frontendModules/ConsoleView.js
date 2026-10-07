/* ConsoleView.js - 控制台页：日志级别筛选 + 等宽日志流 */

const LEVELS = [
  { key: "all", cn: "全部", en: "All" },
  { key: "trigger", cn: "触发", en: "Trigger" },
  { key: "block", cn: "拦截", en: "Block" },
  { key: "energy", cn: "能量", en: "Energy" },
  { key: "conn", cn: "连接", en: "Connection" },
  { key: "error", cn: "错误", en: "Error" }
];

const LEVEL_COLOR = {
  trigger: "green_1",
  block: "yellow_1",
  energy: "blue_1",
  conn: "gray_2",
  error: "pink_1",
  info: "gray_4"
};

const levelDict = (level) => {
  const hit = LEVELS.find(item => item.key === level);
  return { cn: hit ? hit.cn : level, en: hit ? hit.en : level };
};

export default {
  view: (vnode) => {
    const { m, Tag, getColor, trs, logs = [], filterLevel = "all", autoScroll = true, onFilter, onClear, onToggleScroll } = vnode.attrs;

    const list = filterLevel === "all" ? logs : logs.filter(item => item.level === filterLevel);

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      },
      [
        m("div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
              margin: "0.5rem 0.5rem 1rem 0.5rem"
            }
          },
          [
            ...LEVELS.map(item => m(Tag,
              {
                isBtn: true,
                color: filterLevel === item.key ? "main" : "gray_4",
                styleExt: {
                  margin: "0",
                  cursor: "pointer"
                },
                onclick: () => onFilter(item.key)
              },
              trs(`QQBot/日志级别/${item.key}`, { cn: item.cn, en: item.en })
            )),
            m("div",
              {
                style: {
                  flex: "1"
                }
              }
            ),
            m(Tag,
              {
                isBtn: true,
                color: autoScroll ? "main" : "gray_4",
                styleExt: {
                  margin: "0",
                  cursor: "pointer"
                },
                onclick: () => onToggleScroll(!autoScroll)
              },
              trs("QQBot/控制台/自动滚底", { cn: "自动滚底", en: "Auto Scroll" })
            ),
            m(Tag,
              {
                isBtn: true,
                color: "gray_4",
                styleExt: {
                  margin: "0",
                  cursor: "pointer"
                },
                onclick: () => onClear()
              },
              trs("QQBot/控制台/清空", { cn: "清空", en: "Clear" })
            )
          ]
        ),

        m("div",
          {
            style: {
              height: "46rem",
              overflowY: "auto",
              overflowAnchor: "none",
              padding: "1rem",
              borderRadius: "1.5rem",
              background: getColor("gray_4").back,
              color: getColor("gray_4").front,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "1.2rem",
              lineHeight: "2rem"
            },
            onupdate: (vn) => {
              if (autoScroll) vn.dom.scrollTop = vn.dom.scrollHeight;
            }
          },
          list.length === 0
            ? m("div",
              {
                style: {
                  textAlign: "center",
                  opacity: "0.5",
                  padding: "4rem 1rem"
                }
              },
              trs("QQBot/控制台/暂无日志", { cn: "暂无日志", en: "No logs yet" })
            )
            : list.map(item => m("div",
              {
                key: item.id,
                style: {
                  display: "flex",
                  gap: "0.8rem",
                  alignItems: "baseline",
                  padding: "0.1rem 0"
                }
              },
              [
                m("span",
                  {
                    style: {
                      opacity: "0.4",
                      flex: "none"
                    }
                  },
                  new Date(item.time).toLocaleTimeString()
                ),
                m(Tag,
                  {
                    color: LEVEL_COLOR[item.level] || "gray_4",
                    styleExt: {
                      margin: "0",
                      flex: "none",
                      fontSize: "1.1rem"
                    }
                  },
                  trs(`QQBot/日志级别/${item.level}`, levelDict(item.level))
                ),
                m("span",
                  {
                    style: {
                      wordBreak: "break-all",
                      whiteSpace: "pre-wrap"
                    }
                  },
                  item.text
                )
              ]
            ))
        )
      ]
    );
  }
};
