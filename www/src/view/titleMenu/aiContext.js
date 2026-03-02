import m from "mithril"
import Box from "../common/box.js"

// 递归节点组件 (闭包工厂模式)
const JsonNode = () => {
  let expanded = true // 本地闭包状态，代替 vnode.state

  return {
    view({ attrs }) {
      const { keyName, value, isLast, depth = 0 } = attrs
      const isObject = value !== null && typeof value === "object"
      const isArray = Array.isArray(value)

      const toggle = (e) => {
        e.stopPropagation()
        expanded = !expanded
      }

      const renderKey = () => {
        if (keyName === undefined) return null
        return m("span", { style: { color: "#e06c75", marginRight: "4px" } }, `"${keyName}":`)
      }

      // 格式化基础值
      const renderValue = (val) => {
        if (val === null) return m("span", { style: { color: "#d19a66" } }, "null")
        if (typeof val === "boolean") return m("span", { style: { color: "#d19a66" } }, val ? "true" : "false")
        if (typeof val === "number") return m("span", { style: { color: "#d19a66" } }, val)
        if (typeof val === "string") {
          // --- 核心：尝试解析被字符串化的 JSON ---
          let parsed = null
          const strTrim = val.trim()
          if ((strTrim.startsWith("{") && strTrim.endsWith("}")) || (strTrim.startsWith("[") && strTrim.endsWith("]"))) {
            try {
              parsed = JSON.parse(strTrim)
            } catch (e) { }
          }

          if (parsed !== null && typeof parsed === "object") {
            return m("div", {
              style: { display: "inline-block", verticalAlign: "top", borderLeft: "2px solid #56b6c2", paddingLeft: "8px", marginLeft: "4px", background: "rgba(86, 182, 194, 0.05)" }
            }, [
              m("div", { style: { fontSize: "11px", color: "#56b6c2", marginBottom: "4px", userSelect: "none" } }, "// [Parsed Stringified JSON]"),
              m(JsonNode, { value: parsed, isLast: true })
            ])
          }

          return m("span", { style: { color: "#98c379", whiteSpace: "pre-wrap" } }, `"${val}"`)
        }
        return m("span", String(val))
      }

      if (isObject) {
        const keys = Object.keys(value)
        const isEmpty = keys.length === 0
        const openBrace = isArray ? "[" : "{"
        const closeBrace = isArray ? "]" : "}"

        if (isEmpty) {
          return m("div", { style: { paddingLeft: depth > 0 ? "20px" : "0" } }, [
            renderKey(),
            m("span", `${openBrace}${closeBrace}${isLast ? "" : ","}`)
          ])
        }

        return m("div", { style: { paddingLeft: depth > 0 ? "24px" : "0px", position: "relative" } }, [
          m("span", {
            style: { display: "inline-block", width: "16px", height: "16px", lineHeight: "16px", textAlign: "center", cursor: "pointer", userSelect: "none", color: "#61afef", position: "absolute", left: depth > 0 ? "2px" : "-20px", top: "2px" },
            onclick: toggle
          }, expanded ? "[-]" : "[+]"),

          renderKey(),
          m("span", openBrace),

          expanded ? m("div", null, keys.map((k, idx) => {
            return m(JsonNode, {
              keyName: isArray ? undefined : k,
              value: value[k],
              isLast: idx === keys.length - 1,
              depth: depth + 1
            })
          })) : m("span", {
            style: { color: "#5c6370", cursor: "pointer", fontStyle: "italic", padding: "0 4px" },
            onclick: toggle
          }, `... ${keys.length} items ...`),

          m("div", { style: { paddingLeft: depth === 0 ? "0" : "0" } }, [
            m("span", closeBrace),
            m("span", isLast ? "" : ",")
          ])
        ])
      }

      return m("div", { style: { paddingLeft: depth > 0 ? "20px" : "0", lineHeight: "1.5" } }, [
        renderKey(),
        renderValue(value),
        m("span", isLast ? "" : ",")
      ])
    }
  }
}

// 主面板组件 (闭包工厂模式)
export default () => {
  let data = null
  let error = null
  let isFetching = false
  let viewMode = "chats" // 'chats' | 'asks'

  const fetchData = async () => {
    isFetching = true
    error = null
    m.redraw()
    try {
      // 通过加上时间戳防止部分低版本浏览器内核 GET 缓存
      const endpoint = viewMode === "chats" ? "chats/get" : "asks/get"
      const res = await m.request({
        method: "GET",
        url: `http://${window.location.hostname}:9501/api/aiAsk/${endpoint}?_t=${Date.now()}`
      })
      data = res
    } catch (e) {
      error = e.message
    } finally {
      isFetching = false
      m.redraw()
    }
  }

  return {
    async oninit() {
      await fetchData()
    },

    view() {
      if (error) {
        return m("div", { style: { padding: "20px", color: "red" } }, "网络请求失败或解析出错: " + error)
      }

      if (!data && isFetching) {
        return m("div", {
          style: { padding: "20px", color: "#aaa", display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }
        }, [
          m("span", { class: "fa fa-spinner fa-spin", style: { marginRight: "10px" } }),
          "正在拉取模型数据..."
        ])
      }

      return m("div", {
        style: {
          width: "800px", height: "600px", maxWidth: "90vw", maxHeight: "85vh",
          overflowX: "hidden", overflowY: "auto", padding: "45px 15px 15px 30px", // 改成强制隐藏横向滚动条，只允许纵向
          background: "#282c34", color: "#abb2bf", fontFamily: "Consolas, 'Courier New', monospace",
          fontSize: "14px", boxSizing: "border-box", position: "relative",
          wordBreak: "break-all", whiteSpace: "pre-wrap" // 增加硬换行
        }
      }, [
        // 右上角按钮栏
        m("div", {
          style: {
            position: "absolute",
            top: "10px", right: "20px",
            display: "flex",
            gap: "10px",
            zIndex: 10
          }
        }, [
          // 悬浮切换按钮
          m(Box, {
            isBtn: true,
            style: {
              padding: "4px 12px",
              margin: "0",
              background: "rgba(152, 195, 121, 0.2)",
              color: "#98c379",
              border: "1px solid #98c379",
              borderRadius: "4px",
              fontSize: "12px",
              whiteSpace: "nowrap"
            },
            onclick: (e) => {
              if (e && e.stopPropagation) e.stopPropagation()
              if (isFetching) return
              viewMode = viewMode === "chats" ? "asks" : "chats"
              data = null // 清空老数据引发重新渲染缓冲
              fetchData()
            }
          }, viewMode === "chats" ? "查看 Asks 队列" : "返回 Chats 上下文"),

          // 悬浮刷新按钮
          m(Box, {
            isBtn: true,
            style: {
              padding: "4px 12px",
              margin: "0", // 抵消 Box 默认自带的 margin，避免影响计算
              background: "rgba(97, 175, 239, 0.2)",
              color: "#61afef",
              border: "1px solid #61afef",
              borderRadius: "4px",
              fontSize: "12px",
              whiteSpace: "nowrap"
            },
            onclick: (e) => {
              if (e && e.stopPropagation) e.stopPropagation()
              if (!isFetching) fetchData()
            }
          }, isFetching ? "刷新中..." : "刷新数据")
        ]),

        data ? m(JsonNode, { value: data, isLast: true, depth: 0 }) : null
      ])
    }
  }
}
