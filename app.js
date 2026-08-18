import { app, BrowserWindow, Menu, dialog } from "electron"
import fs from "fs-extra"
import { exec } from "child_process"
import pkgUpdater from "electron-updater"
const { autoUpdater } = pkgUpdater
import serve from "./server/serve.js"
import pathLib from "path"
import { fileURLToPath, pathToFileURL } from 'url';
import projectManager from "./server/managers/projectManager.js"
import ioServer from "./server/ioServer/ioServer.js"
import { trs } from "./server/tools/i18n.js"
import comData from "./server/comData/comData.js"
import projectSave from "./server/crossFuncs/projectSave.js"
import projectLoad from "./server/crossFuncs/projectLoad.js"
import tempPath from "./server/tools/tempPath.js"

// --- Portable Mode Detection (便携模式检测) ---
// 存在 .portable 标记文件或 owo_data 文件夹时，自动重定向用户数据根目录至 ./owo_data (参考 VSCode Portable 规范)
const hasPortableFlag = fs.existsSync(pathLib.resolve("./.portable"))
const hasDataDir = fs.existsSync(pathLib.resolve("./owo_data"))
if (hasPortableFlag || hasDataDir) {
  const portableDataDir = pathLib.resolve("./owo_data")
  fs.ensureDirSync(portableDataDir)
  app.setPath("userData", portableDataDir)
  console.log("[App] 激活便携模式，userData 已重定向至:", portableDataDir)
}

// --- Auto Updater Configuration ---
autoUpdater.autoDownload = false // 2026-02-06 Changed to false for manual confirmation
autoUpdater.autoInstallOnAppQuit = true
// 显式注入版本号与配置绝对路径，杜绝工作目录切换至 server/ 导致的寻址偏离
try {
  autoUpdater.currentVersion = app.getVersion()
  if (process.resourcesPath) {
    const ymlPath = pathLib.join(process.resourcesPath, "app-update.yml")
    if (fs.existsSync(ymlPath)) {
      autoUpdater.updateConfigPath = ymlPath
    }
  }
} catch (e) { }

autoUpdater.setFeedURL({
  provider: "github",
  owner: "0ui0",
  repo: "owo_terminal_public"
})




let serveDir = pathLib.dirname(fileURLToPath(import.meta.url))
process.chdir(pathLib.join(serveDir, "/server/"))

// 生命周期标志：指示是否正处于应用整体退出流程，避免更新重启被 isDirty 拦截
let isQuitting = false

app.on('before-quit', () => {
  isQuitting = true
})

// 退出清理：仅精准清理当前实例专属的 temp/{pid} 临时目录
app.on('will-quit', () => {
  try {
    tempPath.clean()
  } catch (e) {
    console.warn("[App] will-quit 清理异常:", e)
  }
})



let port

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    icon: pathLib.resolve("./icon.png"),
    title: "宅喵终端",
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: pathLib.join(serveDir, "server/preload.js")
    }
  })

  //win.loadFile('www/dist/index.html')
  win.loadURL(`http://localhost:${port}`)

  // === Close Confirmation ===
  let forceClose = false
  win.on('close', async (e) => {
    if (forceClose || isQuitting) return

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
  let latestUpdateInfo = null
  const broadcastStatus = (status) => {
    // console.log("Broadcast:", status)
    if (ioServer.io) {
      ioServer.io.emit("sys:updateStatus", status)
    }
  }

  // Helper: Handle successful update ready (Manual flow)
  const handleManualUpdateReady = (savePath) => {
    win.setProgressBar(-1)
    broadcastStatus({ state: "downloaded", msg: trs("系统/消息/下载完成", { cn: "下载完成", en: "Download complete" }) })

    const isArchive = savePath.endsWith('.zip')

    dialog.showMessageBox(win, {
      type: 'info',
      title: trs("系统/消息/更新就绪", { cn: "更新就绪", en: "Update Ready" }),
      message: trs("系统/更新/就绪提示详细", {
        cn: `程序包已下载完毕。\n保存位置：${savePath}\n\n建议操作：\n1. 点击“启动安装并退出”，系统将拉起向导并安全退出本程序，以免占用文件。\n2. 或者仅打开下载目录查看文件。`,
        en: `Update downloaded to:\n${savePath}\n\nSuggested actions:\n1. Click 'Install & Quit' to launch installer and safely quit app.\n2. Or just open download folder.`
      }),
      buttons: [
        isArchive ? trs("系统/动作/打开并解压", { cn: "打开目录并手动解压", en: "Open & Extract" }) : trs("系统/动作/启动安装并退出", { cn: "启动安装并退出", en: "Install & Quit" }),
        trs("系统/动作/前往目录", { cn: "仅前往下载目录", en: "Open Download Folder" }),
        trs("系统/动作/稍后", { cn: "稍后", en: "Later" })
      ],
      cancelId: 2
    }).then((result) => {
      if (result.response === 0) { // 启动安装并退出 / 打开解压
        import("electron").then(async ({ shell }) => {
          if (isArchive) {
            shell.showItemInFolder(savePath)
            app.quit()
          } else {
            await shell.openPath(savePath)
            if (process.platform === 'darwin') {
              setTimeout(() => exec("open -a Finder"), 500)
            }
            app.quit() // 无论是 Mac 还是 Win，启动向导后直接退出本程序腾出文件句柄
          }
        })
      } else if (result.response === 1) { // 仅前往下载目录
        import("electron").then(({ shell }) => shell.showItemInFolder(savePath))
      }
    })
  }

  // Handle manual downloads (for macOS DMG update & Windows manual flow)
  win.webContents.session.on('will-download', (event, item, webContents) => {
    item.on('updated', (event, state) => {
      if (win.isDestroyed()) return
      if (!item.getSavePath()) return // Don't show progress until path selected
      if (state === 'interrupted') {
        broadcastStatus({ state: "error", msg: "下载被中断 / Download interrupted" })
      } else if (state === 'progressing') {
        if (!item.isPaused()) {
          const progress = item.getReceivedBytes() / item.getTotalBytes() * 100
          win.setProgressBar(progress / 100)
          broadcastStatus({
            state: "downloading",
            progress: progress,
            msg: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." }) + ` ${Math.round(progress)}%`
          })
        }
      }
    })
    item.once('done', (event, state) => {
      if (win.isDestroyed()) return
      if (state === 'completed') {
        const savePath = item.getSavePath()
        handleManualUpdateReady(savePath)
      } else {
        win.setProgressBar(-1)
        broadcastStatus({ state: "error", msg: `Download failed: ${state}` })
      }
    })
  })

  autoUpdater.on('checking-for-update', () => {
    broadcastStatus({ state: "checking", msg: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }) })
  })

  autoUpdater.on('update-available', (info) => {
    latestUpdateInfo = info
    broadcastStatus({
      state: "available",
      msg: trs("系统/更新/发现新版本", { cn: "发现新版本", en: "New version found" }) + ` ${info.version}`
    })

    let releaseNotes = info.releaseNotes || ''
    if (typeof releaseNotes !== 'string') {
      try {
        releaseNotes = releaseNotes.toString()
      } catch (e) {}
    }
    if (releaseNotes) {
      releaseNotes = releaseNotes.replace(/<[^>]+>/g, '').trim()
    }
    const detailText = releaseNotes ? trs("系统/更新/更新说明", { cn: "更新说明：\n", en: "Release Notes:\n" }) + releaseNotes : undefined

    // 发现新版本时不静默下载，弹窗询问用户确认
    dialog.showMessageBox(win, {
      type: 'info',
      title: trs("系统/更新/发现新版本", { cn: "发现新版本", en: "New version found" }),
      message: trs("系统/更新/发现新版本提示", { cn: `发现新版本 ${info.version}，是否立即更新？`, en: `New version ${info.version} found. Update now?` }),
      detail: detailText,
      buttons: [trs("系统/动作/立即更新", { cn: "立即更新", en: "Update Now" }), trs("通用/取消", { cn: "取消", en: "Cancel" })],
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        // 动态获取下载链接 (EXE or DMG or ZIP)
        let downloadUrl
        if (info.files && Array.isArray(info.files)) {
          let isMac = process.platform === 'darwin'
          let isWin = process.platform === 'win32'
          let archStr = process.arch === 'arm64' ? 'arm64' : 'x64'
          
          let fileEntry = info.files.find(f => {
            let url = f.url || ''
            if (isMac && url.endsWith('.dmg') && url.includes(archStr)) return true
            if (isWin && url.endsWith('.exe') && url.includes(archStr)) return true
            return false
          })
          
          if (!fileEntry) {
            fileEntry = info.files.find(f => isMac ? f.url.endsWith('.dmg') : (isWin ? f.url.endsWith('.exe') : false))
          }
          if (!fileEntry) {
            fileEntry = info.files.find(f => isWin ? f.url.endsWith('.zip') : false)
          }

          if (fileEntry) {
            let filename = fileEntry.url
            if (filename.startsWith('http')) {
              downloadUrl = filename
            } else {
              downloadUrl = `https://github.com/0ui0/owo_terminal_public/releases/download/v${info.version}/${filename}`
            }
          }
        }

        // 极限情况回退（以防 info.files 解析出错）
        if (!downloadUrl) {
          const arch = process.arch === 'arm64' ? (process.platform === 'darwin' ? '-arm64' : 'arm64') : (process.platform === 'darwin' ? '' : 'x64')
          const platform = process.platform === 'win32' ? 'win' : 'mac'
          const ext = process.platform === 'win32' ? 'exe' : 'dmg'
          const filename = process.platform === 'darwin' ? `owo-terminal-${info.version}${arch}.${ext}` : `owo-terminal-${info.version}-${platform}-${arch}.${ext}`
          downloadUrl = `https://github.com/0ui0/owo_terminal_public/releases/download/v${info.version}/${filename}`
        }

        broadcastStatus({
          state: "downloading",
          progress: 0,
          msg: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." })
        })
        win.webContents.downloadURL(downloadUrl)
      }
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    win.setProgressBar(progressObj.percent / 100) // Keep taskbar progress
    broadcastStatus({
      state: "downloading",
      progress: progressObj.percent,
      msg: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." }) + ` ${Math.round(progressObj.percent)}%`
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    broadcastStatus({
      state: "up-to-date",
      msg: trs("系统/更新/已是最新", { cn: "当前已是最新版本", en: "Already up to date" }) + ` (${info.version})`
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    // 理论上由于接管了 downloadURL，此原生流不会被触发，作为兜底
    win.setProgressBar(-1)
    broadcastStatus({ state: "downloaded", msg: trs("系统/消息/下载完成", { cn: "下载完成", en: "Download complete" }) })
  })

  autoUpdater.on('error', (err) => {
    win.setProgressBar(-1)
    let missAppUpdate = ""
    const errStr = String(err)
    if (errStr.includes('app-update.yml') || errStr.includes('ENOENT')) {
      missAppUpdate = "\n" + trs("系统/更新/绿色版提示", {
        cn: "（提示，当前为绿色版，无法自动检测更新）",
        en: "(Note: This is a portable version, and cannot auto-check for updates.)"
      })
    }
    const errorMsg = trs("系统/错误/提示", { cn: "更新出错：", en: "Update Error: " }) + (err.message || String(err)) + missAppUpdate
    broadcastStatus({ state: "error", msg: errorMsg })
  })

  // 监听前端更新与重启安装请求
  if (ioServer.io) {
    ioServer.io.on('connection', (socket) => {
      socket.on('sys:checkUpdate', async () => {
        broadcastStatus({ state: "checking", msg: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }) })
        const result = await autoUpdater.checkForUpdatesAndNotify()
        if (!result && !app.isPackaged) {
          broadcastStatus({ state: "error", msg: trs("系统/更新/开发环境", { cn: "开发环境跳过检查", en: "Skipped in Dev Mode" }) })
        }
      })

      socket.on('sys:startDownload', () => {
        broadcastStatus({
          state: "downloading",
          progress: 0,
          msg: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." })
        })
        autoUpdater.downloadUpdate()
      })

      socket.on('sys:quitAndInstall', () => {
        isQuitting = true
        autoUpdater.quitAndInstall()
      })
    })
  }

  const template = [
    {
      label: process.platform === 'darwin' ? app.name : trs("菜单栏/分类/文件"), // Use trs for menu
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
    // === Installation Path & Permission Check ===
    const exePath = process.execPath
    const isWin = process.platform === 'win32'
    const isInProgramFiles = isWin && (/[a-zA-Z]:\\Program Files/i.test(exePath) || /[a-zA-Z]:\\Program Files \(x86\)/i.test(exePath))

    if (isInProgramFiles) {
      let hasWriteAccess = false
      try {
        const testFile = pathLib.join(pathLib.dirname(exePath), '.permission_test')
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
        hasWriteAccess = true
      } catch (e) {
        hasWriteAccess = false
      }

      if (!hasWriteAccess) {
        await dialog.showMessageBox({
          type: "error",
          title: trs("系统/提示/权限不足", { cn: "权限不足", en: "Insufficient Permissions" }),
          message: trs("系统/消息/无法读写", { cn: "无法在当前目录读写数据", en: "Cannot read/write in current directory" }),
          detail: trs("系统/消息/系统目录警告", {
            cn: "检测到程序安装在 Program Files 且没有管理员权限。由于本软件需要在程序目录下读写数据库（db.sqlite），在当前位置运行会导致配置无法保存。\n\n建议：\n1. 将程序文件夹移动到桌面或非系统盘运行（推荐）；\n2. 或者右键点击程序，选择“以管理员身份运行”。",
            en: "Detected installation in Program Files without admin rights. Since the app needs write access to its directory for the database (db.sqlite), running here may cause data loss.\n\nSuggestions:\n1. Move the folder to Desktop or a non-system drive (Recommended);\n2. Right-click and 'Run as Administrator'."
          }),
          buttons: [trs("通用/退出", { cn: "退出程序", en: "Quit" })]
        })
        app.quit()
        return
      }
    }

    const serveResult = await serve()
    port = serveResult.port

    // 在 server 启动后注册 Loader Hook（动态注册，避免 Electron 初始化阶段的 data: URL 冲突）
    try {
      const { register } = await import("node:module")
      const { MessageChannel } = await import("worker_threads")
      const { setLoaderPort } = await import("./server/apps/moduleRegistry.js")

      const { port1, port2 } = new MessageChannel()
      const loaderUrl = pathToFileURL(pathLib.join(serveDir, "server/apps/moduleRegistry.js")).href

      register(loaderUrl, {
        parentURL: import.meta.url,
        data: { port: port2 },
        transferList: [port2]
      })

      setLoaderPort(port1)
      console.log("[HMR] Loader hook registered with MessageChannel")
    } catch (e) {
      console.warn("[HMR] Loader hook not supported:", e.message)
    }

    // 脏检查：利用 DynamicData 原生的观察者机制，当 comData 数据变动时标记项目为脏
    if (comData.data) {
      comData.data.addObserver('markProjectDirty', () => projectManager.markDirty())
    }

    // 启动自动保存定时器 (内部会根据 currentProjectPath 是否存在来决定是否执行写入)
    projectManager.startAutoSave()

    createWindow()
    autoUpdater.checkForUpdatesAndNotify()
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      dialog.showErrorBox(trs("系统/错误/启动失败"), trs("系统/错误/端口占用"))
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