import settingData from "../setting/settingData.js"
import Box from "./box.js"
import Notice from "./notice.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"
import aiContext from "../titleMenu/aiContext.js"
import getColor from "./getColor.js"
import chatData from "../chat/chatData.js"

export default () => {
  // Toggle Auto Save
  const toggleAutoSave = async (forceState) => {
    if (forceState !== undefined) {
      commonData.autoSaveEnabled = forceState
    } else {
      commonData.autoSaveEnabled = !commonData.autoSaveEnabled
    }

    try {
      await settingData.fnCall("projectAutoSave", [{
        enabled: commonData.autoSaveEnabled,
        interval: commonData.autoSaveInterval * 60 * 1000
      }])
      console.log("AutoSave set to:", commonData.autoSaveEnabled)
      m.redraw()
    } catch (e) {
      console.error("AutoSave toggle failed:", e)
      commonData.autoSaveEnabled = !commonData.autoSaveEnabled // revert
    }
  }

  // Generic Action Handler
  const handleAction = async (action, saveAs = false) => {
    try {
      const funcMap = {
        save: "projectSave",
        load: "projectLoad",
        new: "projectNew"
      }
      let funcName = funcMap[action]
      let args = []
      if (action === "save") args = [{ saveAs }]
      else args = [{}]

      const res = await settingData.fnCall(funcName, args)

      if (res.ok) {
        console.log("Project action success:", action, res.path)

        chatData.updateTmStatus?.()
        m.redraw()
      } else {
        if (res.msg !== "User canceled") {
          Notice.launch({ msg: trs("系统/错误/提示") + (res.msg || "Unknown error") })
        }
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
            onclick: () => { v.attrs.delete(); handleAction("new") }
          }, trs("菜单栏/操作/新建", { cn: "新建", en: "New" })),

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
              Notice.launch({
                tip: trs("菜单栏/操作/模型请求上下文(动态视图)", { cn: "模型请求上下文 (动态视图)", en: "Model Request Context (Dynamic)" }),
                content: aiContext
              })
            }
          }, trs("菜单栏/操作/查看模型上下文", { cn: "查看模型上下文", en: "View Model Context" })),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: () => {
              v.attrs.delete()
              import("../../comData/ioSocket.js").then(m => m.default.socket.emit("sys:checkUpdate"))
            }
          }, trs("菜单栏/操作/检查更新")),

          m("div", { style: { height: "1px", background: "rgba(255,255,255,0.1)", margin: "5px 0" } }),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: async () => {
              v.attrs.delete()
              const resDialog = await settingData.fnCall("appSaveDialog", [{
                title: trs("菜单栏/操作/导出系统设置", { cn: "导出系统设置 (数据库)", en: "Export System Settings (DB)" }),
                filters: [{ name: "SQLite Database", extensions: ["sqlite"] }],
                filePath: "db_backup.sqlite"
              }])
              if (!resDialog.ok || !resDialog.filePath) return
              const resExport = await settingData.fnCall("dbExport", [{ filePath: resDialog.filePath }])
              Notice.launch({ msg: resExport.ok ? trs("系统/消息/操作成功") : resExport.msg })
            }
          }, trs("菜单栏/操作/导出系统设置", { cn: "导出系统设置", en: "Export Settings" })),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: async () => {
              v.attrs.delete()
              const resDialog = await settingData.fnCall("appOpenDialog", [{
                title: trs("菜单栏/操作/导入系统设置", { cn: "选择要导入的数据库文件", en: "Select Database to Import" }),
                filters: [{ name: "SQLite Database", extensions: ["sqlite"] }]
              }])
              if (!resDialog.ok || !resDialog.filePath) return

              Notice.launch({
                tip: trs("系统/提示/确认导入", { cn: "确认导入并重启？", en: "Confirm Import & Restart?" }),
                msg: trs("系统/消息/导入警告", { cn: "导入将覆盖当前所有设置并自动重启应用，是否继续？", en: "Importing will overwrite all settings and restart. Continue?" }),
                confirm: async () => {
                  const resImport = await settingData.fnCall("dbImport", [{ filePath: resDialog.filePath }])
                  if (!resImport.ok) Notice.launch({ msg: resImport.msg })
                }
              })
            }
          }, trs("菜单栏/操作/导入系统设置", { cn: "导入系统设置", en: "Import Settings" })),

          m("div", { style: { height: "1px", background: "rgba(255,255,255,0.1)", margin: "5px 0" } }),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left" },
            onclick: async () => {
              v.attrs.delete()

              // 1. 打开文件选择对话框
              const resDialog = await settingData.fnCall("appOpenDialog", [{
                title: trs("菜单栏/操作/导入角色包", { cn: "选择角色包 ZIP 文件", en: "Select Pet Package ZIP" }),
                filters: [{ name: "Zip Profile", extensions: ["zip"] }]
              }])

              if (!resDialog.ok || !resDialog.filePath) return

              // 2. 调用导入逻辑
              const resImport = await settingData.fnCall("petPkgImport", [{ path: resDialog.filePath }])

              if (resImport.ok) {
                // 3. 自动切换到新导入的角色包
                if (resImport.name) {
                  await settingData.fnCall("petPkgSetDefault", [{ name: resImport.name }])
                }
                Notice.launch({ msg: resImport.msg })
              } else {
                Notice.launch({ msg: resImport.msg })
              }
            }
          }, trs("菜单栏/操作/导入角色包", { cn: "导入角色包", en: "Import Pet Package" })),

          m(Box, {
            isBtn: true,
            style: { padding: "10px", textAlign: "left", display: "flex", justifyContent: "space-between" },
            onclick: () => { toggleAutoSave(); /* Don't close merely on toggle? or close? user preference. Explorer closes. Let's keep open for toggle? No, standard menu closes. */ }
          }, [
            m("span", trs("菜单栏/操作/自动保存")),
            m("span", { style: { color: commonData.autoSaveEnabled ? "#4caf50" : "transparent" } }, "✔")
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
          color: getColor("main").front,
          border: "1px solid rgba(0,0,0,0.1)",
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
