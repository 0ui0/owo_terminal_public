import { app, Menu, dialog } from "electron"
import pkgUpdater from "electron-updater"
const { autoUpdater } = pkgUpdater
import crypto from "crypto"
import { trs } from "./i18n.js"
import projectLoad from "../crossFuncs/projectLoad.js"
import projectSave from "../crossFuncs/projectSave.js"

/**
 * 设置 Electron 系统级原生菜单栏
 * 核心职责：
 * 1. 维系操作系统级剪贴板管道（撤销、剪切、复制、粘贴、全选等 role）；
 * 2. 绑定全局核心快捷键（CmdOrCtrl+O 打开, CmdOrCtrl+S 保存, CmdOrCtrl+R 刷新, DevTools 等）；
 * 3. 支撑 macOS 顶栏标准系统菜单。
 * 
 * @param {BrowserWindow} win - 主窗口实例
 * @param {Function} pushUpdateMessage - 更新消息推送回调
 * @returns {Menu} 构建的应用菜单实例
 */
export function setupAppMenu(win, pushUpdateMessage) {
  const template = [
    {
      label: process.platform === 'darwin' ? app.name : trs("菜单栏/分类/文件"),
      submenu: [
        {
          label: trs("菜单栏/操作/打开"),
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await projectLoad.func({})
          }
        },
        {
          label: trs("菜单栏/操作/保存"),
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            await projectSave.func({ saveAs: false })
          }
        },
        {
          label: trs("菜单栏/操作/另存为"),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            await projectSave.func({ saveAs: true })
          }
        },
        { type: 'separator' },
        {
          label: trs("菜单栏/操作/检查更新", { cn: "检查更新", en: "Check for Updates" }),
          click: async () => {
            if (typeof pushUpdateMessage === 'function') {
              pushUpdateMessage({
                id: crypto.randomUUID(),
                title: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }),
                type: "info",
                content: trs("系统/更新/连接中", { cn: "正在与发布服务器通信...", en: "Communicating with release server..." }),
                isRead: false,
                tag: "sys-update",
                merge: "cover"
              })
            }
            const result = await autoUpdater.checkForUpdatesAndNotify()
            if (!result && !app.isPackaged) {
              if (typeof pushUpdateMessage === 'function') {
                pushUpdateMessage({
                  id: crypto.randomUUID(),
                  title: trs("系统/更新/开发环境", { cn: "开发环境跳过检查", en: "Skipped in Dev Mode" }),
                  type: "error",
                  content: trs("系统/更新/打包后可用", { cn: "仅打包后的版本可执行自动更新", en: "Only packaged app supports auto-update" }),
                  isRead: false,
                  tag: "sys-update",
                  merge: "cover"
                })
              }
              dialog.showMessageBox({
                type: 'info',
                title: trs("系统/更新/开发环境标题", { cn: "开发环境", en: "Dev Environment" }),
                message: trs("系统/更新/开发环境提示", { cn: "当前处于开发环境，已跳过更新检查。请打包后测试更新功能。", en: "Skipped update check in dev mode. Please package the app to test." }),
                buttons: [trs("通用/确认", { cn: "确定", en: "OK" })]
              })
            }
          }
        },
        { type: 'separator' },
        {
          role: 'quit',
          label: trs("菜单栏/操作/退出", { cn: "退出", en: "Quit" })
        }
      ]
    },

    {
      label: trs("菜单栏/分类/编辑", { cn: "编辑", en: "Edit" }),
      submenu: [
        { role: 'undo', label: trs("菜单栏/编辑/撤销", { cn: "撤销", en: "Undo" }) },
        { role: 'redo', label: trs("菜单栏/编辑/重做", { cn: "重做", en: "Redo" }) },
        { type: 'separator' },
        { role: 'cut', label: trs("菜单栏/编辑/剪切", { cn: "剪切", en: "Cut" }) },
        { role: 'copy', label: trs("菜单栏/编辑/复制", { cn: "复制", en: "Copy" }) },
        { role: 'paste', label: trs("菜单栏/编辑/粘贴", { cn: "粘贴", en: "Paste" }) },
        { role: 'pasteAndMatchStyle', label: trs("菜单栏/编辑/粘贴样式", { cn: "粘贴并匹配样式", en: "Paste and Match Style" }) },
        { role: 'delete', label: trs("菜单栏/编辑/删除", { cn: "删除", en: "Delete" }) },
        { role: 'selectAll', label: trs("菜单栏/编辑/全选", { cn: "全选", en: "Select All" }) }
      ]
    },

    {
      label: trs("菜单栏/分类/视图", { cn: "视图", en: "View" }),
      submenu: [
        {
          label: trs("菜单栏/操作/刷新", { cn: "刷新", en: "Reload" }),
          accelerator: process.platform === 'darwin' ? 'Command+R' : 'Ctrl+R',
          click: () => {
            if (win && !win.isDestroyed()) win.webContents.reload()
          }
        }
      ]
    },
    {
      label: trs("菜单栏/分类/开发", { cn: "开发", en: "Develop" }),
      submenu: [
        {
          label: trs("菜单栏/操作/调试工具", { cn: "开发者工具", en: "Developer Tools" }),
          accelerator: process.platform === 'darwin' ? 'Command+Option+I' : 'Ctrl+Shift+I',
          click: () => {
            if (win && !win.isDestroyed()) win.webContents.toggleDevTools()
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  return menu
}

export default setupAppMenu
