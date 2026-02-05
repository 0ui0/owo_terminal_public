import m from "mithril"
import commonData from "./commonData.js"
import ioSocket from "../../comData/ioSocket.js"
import Notice from "./notice.js"
import { trs } from "./i18n.js"

export default {
  view: () => {
    const status = commonData.updateStatus
    if (status.state === "idle") return null

    const isDownloading = status.state === "downloading"
    const isError = status.state === "error"
    const isUpToDate = status.state === "up-to-date"
    const isChecking = status.state === "checking"
    const isDownloaded = status.state === "downloaded"

    const progress = status.progress || 0
    const radius = 8
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (progress / 100) * circumference

    return m("div", {
      style: {
        display: "flex", alignItems: "center", gap: "6px",
        background: "rgba(0,0,0,0.1)", padding: "2px 8px", borderRadius: "12px",
        fontSize: "12px",
        color: isDownloading || isUpToDate ? "#4caf50" : isError ? "#ff5252" : isDownloaded ? "#2196f3" : "#ddd",
        cursor: isError || isDownloaded ? "pointer" : "help",
        transition: "all 0.3s",
        "-webkit-app-region": "no-drag"
      },
      title: status.msg,
      onclick: isError ? () => {
        Notice.launch({
          sign: "update-error-notice",
          title: trs("系统/错误/标题", { cn: "更新出错", en: "Update Error" }),
          msg: status.msg,
          confirm: () => { commonData.updateStatus = { state: "idle" } },
          cancel: () => { }
        })
      } : isDownloaded ? () => {
        Notice.launch({
          sign: "update-restart-confirm",
          title: trs("系统/消息/更新就绪"),
          msg: trs("系统/提示/确认重启更新", { cn: "确认现在重启以安装更新吗？", en: "Restart now to install update?" }),
          confirm: () => ioSocket.socket.emit("sys:quitAndInstall"),
          cancel: () => { }
        })
      } : null
    }, [
      isDownloading ? m("svg", {
        width: "18", height: "18", viewBox: "0 0 20 20",
        style: { transform: "rotate(-90deg)" }
      }, [
        m("circle", { cx: "10", cy: "10", r: radius, fill: "transparent", stroke: "rgba(255,255,255,0.2)", "stroke-width": "2" }),
        m("circle", {
          cx: "10", cy: "10", r: radius,
          fill: "transparent", stroke: "#4caf50", "stroke-width": "2",
          "stroke-dasharray": circumference,
          "stroke-dashoffset": offset,
          style: { transition: "stroke-dashoffset 0.3s ease" }
        })
      ]) : isChecking ? m("div", {
        className: "loading-spinner", style: {
          width: "14px", height: "14px",
          border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }
      }) : isError ? m("span", { style: { fontSize: "14px", fontWeight: "bold" } }, "!")
        : isUpToDate ? m("span", { style: { fontSize: "14px", fontWeight: "bold" } }, "✔")
          : isDownloaded ? m("span", { style: { fontSize: "14px", fontWeight: "bold" } }, "↻")
            : m("span", { style: { fontSize: "14px", fontWeight: "bold" } }, "⬇"),

      isError ? null : m("span", status.msg || status.state)
    ])
  }
}
