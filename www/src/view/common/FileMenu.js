import settingData from "../setting/settingData.js"
import Box from "./box.js"
import Notice from "./notice.js"
import commonData from "./commonData.js"
import { trs } from "./i18n.js"
import aiContext from "../titleMenu/aiContext.js"
import getColor from "./getColor.js"
import chatData from "../chat/chatData.js"
import comData from "../../comData/comData.js"
import Setting from "../setting/setting.js"
import sysMenu from "./sysMenu.js"

export default () => {
  // 项目 load/save 后遍历所有队列刷新时光机状态
  const refreshAllTmStatus = async () => {
    const lists = comData.data.get().chatLists
    for (const list of lists) {
      await chatData.updateTmStatus(list.id)
    }
    m.redraw()
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

        await refreshAllTmStatus()
      } else if (res.msg === "VERSION_MISMATCH") {
        // 存档版本不匹配：询问用户是否以兼容模式继续导入
        Notice.launch({
          tip: trs("项目/版本不匹配", { cn: "存档版本不匹配", en: "Version Mismatch" }),
          msg: trs("项目/版本不匹配详情", { cn: `存档版本 (${res.savedVersion}) 与当前版本 (${res.currentVersion}) 不一致，是否以兼容模式继续导入？`, en: `Archive version (${res.savedVersion}) differs from current (${res.currentVersion}). Continue in compatibility mode?` }),
          confirm: async () => {
            const retry = await settingData.fnCall("projectLoad", [{ path: res.path, forceConvert: true }])
            if (retry.ok) {
              await refreshAllTmStatus()
            } else {
              Notice.launch({ msg: trs("系统/错误/提示") + (retry.msg || "Unknown error") })
            }
            return undefined
          }
        })
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

    // Position: attempt to align with button
    const rect = e.target.getBoundingClientRect()
    const x = rect.left
    const y = rect.bottom + 5

    Notice.launch({
      group: "fileMenu",
      width: 180,
      win: { x, y }, // 支持强制更新位置
      tip: trs("菜单栏/分类/文件"),
      content: {
        view: (v) => m(sysMenu, {
          menuItems: [
            {
              name: trs("菜单栏/操作/新建", { cn: "新建", en: "New" }),
              onclick: () => { v.attrs.delete(); handleAction("new") }
            },
            {
              name: trs("菜单栏/操作/打开"),
              onclick: () => { v.attrs.delete(); handleAction("load") }
            },
            {
              name: trs("菜单栏/操作/保存"),
              onclick: () => { v.attrs.delete(); handleAction("save") }
            },
            {
              name: trs("菜单栏/操作/另存为"),
              onclick: () => { v.attrs.delete(); handleAction("save", true) }
            },
            {
              name: trs("菜单栏/操作/查看模型上下文", { cn: "查看模型上下文", en: "View Model Context" }),
              onclick: () => {
                v.attrs.delete()
                Notice.launch({
                  tip: trs("菜单栏/操作/模型请求上下文(动态视图)", { cn: "模型请求上下文 (动态视图)", en: "Model Request Context (Dynamic)" }),
                  content: aiContext
                })
              }
            },
            {
              name: trs("菜单栏/操作/检查更新"),
              onclick: () => {
                v.attrs.delete()
                import("../../comData/ioSocket.js").then(m => m.default.socket.emit("sys:checkUpdate"))
              }
            },
            {
              name: trs("菜单栏/操作/打开数据目录", { cn: "打开数据目录", en: "Open Data Directory" }),
              onclick: async () => {
                v.attrs.delete()
                const res = await settingData.fnCall("openDataDir", [])
                if (!res.ok) {
                  Notice.launch({ msg: res.msg, type: "error" })
                }
              }
            },
            {
              name: trs("菜单栏/操作/系统设置", { cn: "系统设置", en: "System Settings" }),
              onclick: () => {
                v.attrs.delete()
                Notice.launch({
                  sign: "setting_main",
                  tip: trs("输入栏/提示/设置中心", { cn: "设置中心", en: "Settings" }),
                  content: Setting
                })
              }
            },
            "sep",
            {
              name: trs("菜单栏/操作/导出系统设置", { cn: "导出系统设置", en: "Export Settings" }),
              onclick: async () => {
                v.attrs.delete()
                const resDialog = await settingData.fnCall("appSaveDialog", [{
                  title: trs("菜单栏/操作/导出系统设置", { cn: "导出系统设置 (数据库)", en: "Export System Settings (DB)" }),
                  filters: [{ name: "SQLite Database", extensions: ["sqlite"] }],
                  filePath: "db_backup.sqlite"
                }])
                if (!resDialog.ok || !resDialog.filePath) return
                const resExport = await settingData.fnCall("dbExport", [{ filePath: resDialog.filePath }])
                if (!resExport.ok) Notice.launch({ msg: resExport.msg })
              }
            },
            {
              name: trs("菜单栏/操作/导入系统设置", { cn: "导入系统设置", en: "Import Settings" }),
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
            },
            "sep",
            {
              name: trs("菜单栏/操作/导入角色包", { cn: "导入角色包", en: "Import Pet Package" }),
              onclick: async () => {
                v.attrs.delete()
                const resDialog = await settingData.fnCall("appOpenDialog", [{
                  title: trs("菜单栏/操作/导入角色包", { cn: "选择角色包 ZIP 文件", en: "Select Pet Package ZIP" }),
                  filters: [{ name: "Zip Profile", extensions: ["zip"] }]
                }])

                if (!resDialog.ok || !resDialog.filePath) return

                const resImport = await settingData.fnCall("petPkgImport", [{ path: resDialog.filePath }])
                if (resImport.ok) {
                  if (resImport.name) {
                    await settingData.fnCall("petPkgSetDefault", [{ name: resImport.name }])
                  }
                } else {
                  Notice.launch({ msg: resImport.msg })
                }
              }
            }
          ]
        })
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
          borderRadius: "3rem",
          fontSize: "13px",
          fontWeight: "500",
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          color: getColor("main").front,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(255,255,255,0.05)",
          "-webkit-app-region": "no-drag",
          marginLeft: "10px",
          transition: "background 0.2s ease"
        },
        ext: {
          onpointerenter: function () {
            this.style.background = "rgba(128, 128, 128, 0.18)"
          },
          onpointerleave: function () {
            this.style.background = "rgba(255, 255, 255, 0.05)"
          }
        },
        onclick: (_, e) => showFileMenu(e)
      }, [
        m("span", trs("菜单栏/分类/文件"))
      ])
    }
  }
}
