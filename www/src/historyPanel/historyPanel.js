import m from "mithril"
import debugHistory from "./historyPanelData.js"
import { JsonNode } from "../view/titleMenu/aiContext.js"

export default () => {
  let expandedIndex = -1;

  return {
    view() {
      return m("div", {
        style: {
          padding: "20px",
          color: "#abb2bf",
          fontFamily: "Consolas, 'Courier New', monospace",
          height: "100%",
          boxSizing: "border-box",
          overflowY: "auto"
        }
      }, [
        m("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "20px" } }, [
          m("h3", { style: { margin: 0, color: "#e06c75" } }, "前端行为埋点历史"),
          m("div", { style: { display: "flex", gap: "10px" } }, [
            m("button", {
              onclick: () => {
                const text = JSON.stringify(debugHistory.logs, null, 2);
                navigator.clipboard.writeText(text).then(() => {
                  alert("已复制到剪贴板");
                }).catch(err => {
                  console.error("复制失败", err);
                  alert("复制失败");
                });
              },
              style: { padding: "4px 10px", cursor: "pointer", background: "#61afef", color: "#282c34", border: "none", borderRadius: "4px" }
            }, "复制历史记录"),
            m("button", {
              onclick: () => debugHistory.clear(),
              style: { padding: "4px 10px", cursor: "pointer", background: "#e06c75", color: "#282c34", border: "none", borderRadius: "4px" }
            }, "清空记录")
          ])
        ]),

        debugHistory.logs.length === 0 
          ? m("div", { style: { color: "#5c6370", fontStyle: "italic" } }, "暂无日志...")
          : m("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, 
              debugHistory.logs.map((log, index) => {
                const isExpanded = expandedIndex === index;
                return m("div", {
                  style: {
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid #3e4451",
                    borderRadius: "4px",
                    padding: "10px"
                  }
                }, [
                  m("div", {
                    style: { display: "flex", justifyContent: "space-between", cursor: "pointer", userSelect: "none" },
                    onclick: () => { expandedIndex = isExpanded ? -1 : index; }
                  }, [
                    m("strong", { style: { color: "#61afef" } }, log.action),
                    m("span", { style: { color: "#5c6370", fontSize: "12px" } }, new Date(log.time).toLocaleTimeString())
                  ]),
                  
                  isExpanded ? m("div", { style: { marginTop: "10px", paddingTop: "10px", borderTop: "1px dashed #3e4451" } }, [
                    m("div", { style: { marginBottom: "10px" } }, [
                      m("div", { style: { color: "#98c379", marginBottom: "4px" } }, "操作详情 (Details):"),
                      m(JsonNode, { value: log.details, isLast: true, depth: 0 })
                    ]),
                    m("div", { style: { marginTop: "15px" } }, [
                      m("div", { style: { color: "#e5c07b", marginBottom: "4px" } }, "Asks 数组 (内存队列):"),
                      (log.snapshot && log.snapshot.asks)
                        ? m(JsonNode, { value: log.snapshot.asks, isLast: true, depth: 0 })
                        : m("span", { style: { color: "#e06c75" } }, "获取 Asks 失败")
                    ]),
                    m("div", { style: { marginTop: "15px", borderTop: "1px dotted #3e4451", paddingTop: "15px" } }, [
                      m("div", { style: { color: "#c678dd", marginBottom: "4px" } }, "实际发送上下文 (Chats 消息列表):"),
                      (log.snapshot && log.snapshot.chats)
                        ? m(JsonNode, { value: log.snapshot.chats, isLast: true, depth: 0 })
                        : m("span", { style: { color: "#e06c75" } }, "获取 Chats 失败")
                    ])
                  ]) : null
                ])
              })
            )
      ])
    }
  }
}
