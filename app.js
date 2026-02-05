import { app, BrowserWindow, Menu, dialog } from "electron"
import pkgUpdater from "electron-updater"
const { autoUpdater } = pkgUpdater
import serve from "./server/serve.js"
import pathLib from "path"
import { fileURLToPath } from 'url';
import path from "path";
import projectManager from "./server/managers/projectManager.js"
import ioServer from "./server/ioServer/ioServer.js"
import { trs } from "./server/tools/i18n.js"

// --- Auto Updater Configuration ---
autoUpdater.autoDownload = false // 2026-02-06 Changed to false for manual confirmation
autoUpdater.autoInstallOnAppQuit = true



let serveDir = pathLib.dirname(fileURLToPath(import.meta.url))
process.chdir(pathLib.join(serveDir, "/server/"))

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1152,
    height: 864,
    icon: pathLib.resolve("./icon.png"),
    title: "宅喵终端",
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      webviewTag: true,
    }
  })

  //win.loadFile('www/dist/index.html')
  win.loadURL("http://localhost:9501")

  // === Close Confirmation ===
  let forceClose = false
  win.on('close', async (e) => {
    if (forceClose) return

    if (projectManager.isDirty) {
      e.preventDefault()
      const { response } = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["保存并退出", "直接退出 (不保存)", "取消"],
        title: "退出确认",
        message: "当前项目有未保存的更改，要在退出前保存吗？",
        defaultId: 0,
        cancelId: 2
      })
      if (response === 0) { // Save
        let savePath = projectManager.currentProjectPath
        if (!savePath) {
          const { filePath } = await dialog.showSaveDialog(win, { title: "保存项目", filters: [{ name: "Owo Project", extensions: ["owo", "json"] }] })
          savePath = filePath
        }
        if (savePath) {
          await projectManager.save(savePath)
          forceClose = true
          win.close()
        }
      } else if (response === 1) { // Don't Save & Exit
        forceClose = true
        app.exit(0) // 强制退出整个应用
      }
    }
  })


  // --- Auto Updater Events ---
  const broadcastStatus = (status) => {
    // console.log("Broadcast:", status)
    if (ioServer.io) {
      ioServer.io.emit("sys:updateStatus", status)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    broadcastStatus({ state: "checking", msg: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }) })
  })

  autoUpdater.on('update-available', (info) => {
    broadcastStatus({
      state: "available",
      msg: trs("系统/更新/发现新版本", { cn: "发现新版本", en: "New version found" }) + ` ${info.version}`
    })

    // Ask user to download
    dialog.showMessageBox(win, {
      type: 'info',
      title: trs("系统/更新/发现新版本", { cn: "发现新版本", en: "New version found" }),
      message: trs("系统/更新/发现新版本提示", { cn: `发现新版本 ${info.version}，是否立即更新？`, en: `New version ${info.version} found. Update now?` }),
      buttons: [trs("系统/动作/立即更新", { cn: "立即更新", en: "Update Now" }), trs("通用/取消", { cn: "取消", en: "Cancel" })],
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        broadcastStatus({ state: "downloading", msg: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." }) })
        autoUpdater.downloadUpdate()
      }
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    win.setProgressBar(progressObj.percent / 100) // Keep taskbar progress
    broadcastStatus({
      state: "downloading",
      progress: progressObj.percent,
      msg: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." }) + ` ${Math.round(progressObj.percent)}%`
      // bytesPerSecond: progressObj.bytesPerSecond
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    broadcastStatus({
      state: "up-to-date",
      msg: trs("系统/更新/已是最新", { cn: "当前已是最新版本", en: "Already up to date" }) + ` (${info.version})`
    })
    // If manually checked (how to track?), show dialog. 
    // Just broadcast for now, UI can decide to show toast.
  })

  autoUpdater.on('update-downloaded', (info) => {
    win.setProgressBar(-1)
    broadcastStatus({ state: "downloaded", msg: trs("系统/消息/下载完成") }) // Using global key

    dialog.showMessageBox(win, {
      type: 'info',
      title: trs("系统/消息/更新就绪"),
      message: trs("系统/消息/下载完成").replace('。', ` (${info.version})。`), // Small hack to inject version if needed, or just append
      buttons: [trs("系统/动作/现在重启"), trs("系统/动作/稍后提醒")]
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    win.setProgressBar(-1)
    const errorMsg = trs("系统/错误/提示") + (err.message || "Error")
    broadcastStatus({ state: "error", msg: errorMsg })
    dialog.showErrorBox(trs("系统/错误/标题", { cn: "更新出错", en: "Update Error" }), errorMsg)
  })

  // Listen for frontend check request
  // We need to wait for ioServer to be ready. It is ready after serve().
  // But we can just set up the listener on connection.
  // Ideally this should be in ioServer logic, but app.js controls autoUpdater.
  // We'll rely on global ioServer.io being set.
  if (ioServer.io) {
    ioServer.io.on('connection', (socket) => {
      socket.on('sys:checkUpdate', async () => {
        broadcastStatus({ state: "checking", msg: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }) })
        const result = await autoUpdater.checkForUpdatesAndNotify()
        if (!result && !app.isPackaged) {
          broadcastStatus({ state: "error", msg: trs("系统/更新/开发环境", { cn: "开发环境跳过检查", en: "Skipped in Dev Mode" }) })
        }
      })

      socket.on('sys:quitAndInstall', () => {
        autoUpdater.quitAndInstall()
      })
    })
  }


  const template = [
    {
      label: process.platform === 'darwin' ? app.name : trs("菜单栏/分类/文件"), // Use trs for menu
      submenu: [
        {
          label: trs("菜单栏/操作/检查更新", { cn: "检查更新", en: "Check for Updates" }),
          click: async () => {
            broadcastStatus({ state: "checking", msg: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }) })
            const result = await autoUpdater.checkForUpdatesAndNotify()
            if (!result && !app.isPackaged) {
              broadcastStatus({ state: "error", msg: trs("系统/更新/开发环境", { cn: "开发环境跳过检查", en: "Skipped in Dev Mode" }) })
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
        { role: 'pasteAndMatchStyle', label: trs("菜单栏/编辑/粘贴样式", { cn: "粘贴并匹配样式", en: "Paste and Match Style" }) }, // macOS 特有
        { role: 'delete', label: trs("菜单栏/编辑/删除", { cn: "删除", en: "Delete" }) }, // Note: "删除" key was "通用/删除" or specific? i18n.js has "通用/删除" but let's check menu section
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
            win.webContents.reload()
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
            win.webContents.toggleDevTools()
          }
        }
      ]
    }
  ]


  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)



}


app.whenReady().then(async () => {
  try {
    await serve()
    createWindow()
    autoUpdater.checkForUpdatesAndNotify()

    // Listen for frontend check requests
    if (ioServer.io) {
      ioServer.io.on('connection', (socket) => {
        socket.on('sys:checkUpdate', async () => {
          // Trigger check
          if (ioServer.io) ioServer.io.emit("sys:updateStatus", {
            state: "checking",
            msg: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." })
          })
          const result = await autoUpdater.checkForUpdatesAndNotify()
          if (!result && !app.isPackaged) {
            if (ioServer.io) ioServer.io.emit("sys:updateStatus", {
              state: "error",
              msg: trs("系统/更新/开发环境", { cn: "开发环境跳过检查", en: "Skipped in Dev Mode" })
            })
          }
        })
      })
    }
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      dialog.showErrorBox('启动失败', '端口 9501 被占用，请检查是否已打开另一个实例。')
      app.quit()
    } else {
      dialog.showErrorBox('启动错误', err.message || '未知错误')
      app.quit()
    }
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})