import settingData from "../setting/settingData.js"
import Box from "./box.js"
import Notice from "./notice.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"

export default () => {
  let autoSaveEnabled = false
  let autoSaveInterval = 5 // minutes

  // Init: Fetch current path
  settingData.fnCall("projectGetPath").then(res => {
    if (res.ok && res.path) {
      commonData.currentProject = res.path
      m.redraw()
    }
  })

  // Toggle Auto Save
  const toggleAutoSave = async () => {
    autoSaveEnabled = !autoSaveEnabled
    try {
      await settingData.fnCall("projectAutoSave", [{
        enabled: autoSaveEnabled,
        interval: autoSaveInterval * 60 * 1000
      }])
      console.log("AutoSave set to:", autoSaveEnabled)
    } catch (e) {
      console.error("AutoSave toggle failed:", e)
      autoSaveEnabled = !autoSaveEnabled // revert
    }
  }

  // Generic Action Handler
  const handleAction = async (action, saveAs = false) => {
    try {
      let funcName = action === "save" ? "projectSave" : "projectLoad"
      let args = []
      if (action === "save") args = [{ saveAs }]
      else args = [{}]

      const res = await settingData.fnCall(funcName, args)

      if (res.ok) {
        console.log("Project action success:", action, res.path)
        if (res.path) commonData.currentProject = res.path
        m.redraw()
        Notice.launch({ msg: action === "load" ? trs("系统/消息/载入成功") : trs("系统/消息/操作成功") })
      } else {
        Notice.launch({ msg: trs("系统/错误/提示") + (res.msg || "Unknown error") })
      }

    } catch (e) {
      console.error(action, e)
      Notice.launch({ msg: trs("系统/错误/提示") + e.message })
    }
  }

  const showFileMenu = (e) => {
    e.preventDefault() // Prevent default if context menu

    // Prevent multiple menus (optional, Notice handles groups)

    // Position: attempt to align with button
    const rect = e.target.getBoundingClientRect()
    // Notice x/y usually centers if not provided or uses top-left. 
    // Explorer uses clientX/Y. We can use rect.left and rect.bottom
    const x = rect.left
    const y = rect.bottom + 5

    Notice.launch({
      group: "fileMenu",
      width: 180,
      win: { x, y }, // 支持强制更新位置
      tip: trs("菜单栏/分类/文件"),
      content: {
        view: (v) => m(Box, {
          style: { display: "flex", flexDirection: "column", padding: "5px" }
        }, [
          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: () => { v.attrs.delete(); handleAction("load") }
          }, trs("菜单栏/操作/打开")),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: () => { v.attrs.delete(); handleAction("save") }
          }, trs("菜单栏/操作/保存")),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: () => { v.attrs.delete(); handleAction("save", true) }
          }, trs("菜单栏/操作/另存为")),

          m("div", { style: { height: "1px", background: "rgba(255,255,255,0.1)", margin: "5px 0" } }),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: () => {
              v.attrs.delete()
              import("../../comData/ioSocket.js").then(m => m.default.socket.emit("sys:checkUpdate"))
            }
          }, trs("菜单栏/操作/检查更新")),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left", display: "flex", justifyContent: "space-between" },
            onclick: () => { toggleAutoSave(); /* Don't close merely on toggle? or close? user preference. Explorer closes. Let's keep open for toggle? No, standard menu closes. */ }
          }, [
            m("span", trs("菜单栏/操作/自动保存")),
            m("span", { style: { color: autoSaveEnabled ? "#4caf50" : "transparent" } }, "✔")
          ])
        ])
      }
    })
  }

  return {
    view() {
      return m(Box, {
        tagName: "div",
        isBtn: true,
        color: "transparent",
        noValue: true,
        style: {
          padding: "6px 12px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: "500",
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          color: "#ddd",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.05)",
          "-webkit-app-region": "no-drag",
          marginLeft: "10px"
        },
        onclick: (_, e) => showFileMenu(e)
      }, [
        m("span", trs("菜单栏/分类/文件"))
      ])
    }
  }
}
