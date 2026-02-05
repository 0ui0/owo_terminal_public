import { app, BrowserWindow, Menu, dialog } from "electron"
import { exec } from "child_process"
import crypto from "crypto"
import { createReadStream, existsSync } from "fs"
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
  let latestUpdateInfo = null
  const broadcastStatus = (status) => {
    // console.log("Broadcast:", status)
    if (ioServer.io) {
      ioServer.io.emit("sys:updateStatus", status)
    }
  }

  // Helper: Verify file hash (SHA512 Base64)
  const validateFileHash = (filePath, expectedHash) => {
    return new Promise((resolve) => {
      if (!expectedHash) return resolve({ valid: false, error: "No expected hash" })
      const hash = crypto.createHash('sha512')
      const stream = createReadStream(filePath)
      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => {
        const fileHash = hash.digest('base64')
        console.log(`[Hash Check] File: ${filePath}`)
        console.log(`[Hash Check] Calculated: ${fileHash}`)
        console.log(`[Hash Check] Expected:   ${expectedHash}`)
        if (fileHash !== expectedHash) {
          console.log(`[Hash Check] Mismatch!`)
        }
        resolve({ valid: fileHash === expectedHash, calculated: fileHash, expected: expectedHash })
      })
      stream.on('error', (err) => {
        console.error(`[Hash Check] Error reading file: ${err}`)
        resolve({ valid: false, error: err.message })
      })
    })
  }

  // Helper: Handle successful update ready (Manual flow)
  const handleManualUpdateReady = (savePath) => {
    win.setProgressBar(-1)
    broadcastStatus({ state: "downloaded", msg: trs("系统/消息/下载完成") })

    // Mac: Mount DMG
    if (process.platform === 'darwin' && savePath.endsWith('.dmg')) {
      import("electron").then(async ({ shell }) => {
        await shell.openPath(savePath)
        setTimeout(() => exec("open -a Finder"), 500)
      })
    }
    // Win/Linux: Open Folder
    else if (savePath.endsWith('.zip')) {
      import("electron").then(async ({ shell }) => {
        shell.showItemInFolder(savePath)
      })
    }

    dialog.showMessageBox(win, {
      type: 'info',
      title: trs("系统/消息/更新就绪"),
      message: process.platform === 'darwin'
        ? trs("系统/更新/手动安装提示", { cn: "下载已完成。已为您打开安装包，请将图标拖入应用程序文件夹以完成覆盖安装。", en: "Download complete. Installer opened. Please drag the icon to Applications to overwrite." })
        : trs("系统/更新/手动安装提示", { cn: "下载已完成。已为您选中压缩包，请解压并覆盖原软件以完成更新。", en: "Download complete. File selected. Please unzip and overwrite the app to update." }),
      buttons: [trs("系统/动作/退出应用", { cn: "退出应用", en: "Quit App" }), trs("系统/动作/稍后", { cn: "稍后", en: "Later" })]
    }).then((result) => {
      if (result.response === 0) {
        app.quit()
      }
    })
  }

  // Handle manual downloads (for macOS DMG update)
  win.webContents.session.on('will-download', (event, item, webContents) => {
    item.on('updated', (event, state) => {
      if (win.isDestroyed()) return
      if (!item.getSavePath()) return // Don't show progress until path selected
      if (state === 'interrupted') {
        console.log('Download is interrupted but can be resumed')
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download is paused')
        } else {
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

        // Validate Hash post-download
        const checkAndOpen = () => {
          if ((process.platform === 'darwin' && savePath.endsWith('.dmg')) || savePath.endsWith('.zip')) {
            handleManualUpdateReady(savePath)
          }
        }

        if (latestUpdateInfo) {
          const expectedHash = latestUpdateInfo.selectedHash || latestUpdateInfo.sha512
          if (expectedHash) {
            broadcastStatus({ state: "checking", msg: trs("系统/更新/校验中", { cn: "正在校验文件...", en: "Verifying..." }) })
            validateFileHash(savePath, expectedHash).then((result) => {
              if (result.valid) {
                checkAndOpen()
              } else {
                broadcastStatus({ state: "error", msg: "Hash mismatch" })
                dialog.showErrorBox(
                  trs("系统/错误/标题", { cn: "更新出错", en: "Update Error" }),
                  trs("系统/错误/校验失败", { cn: "文件完整性校验失败。", en: "Integrity check failed." }) +
                  `\nE: ${result.expected?.substring(0, 8)}...\nC: ${result.calculated?.substring(0, 8)}...`
                )
              }
            })
          } else {
            checkAndOpen()
          }
        } else {
          checkAndOpen()
        }
      } else {
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

    // Ask user to download
    dialog.showMessageBox(win, {
      type: 'info',
      title: trs("系统/更新/发现新版本", { cn: "发现新版本", en: "New version found" }),
      message: trs("系统/更新/发现新版本提示", { cn: `发现新版本 ${info.version}，是否立即更新？`, en: `New version ${info.version} found. Update now?` }),
      buttons: [trs("系统/动作/立即更新", { cn: "立即更新", en: "Update Now" }), trs("通用/取消", { cn: "取消", en: "Cancel" })],
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        // broadcastStatus({ state: "downloading", msg: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." }) })

        // Manual download & Hash check
        let downloadUrl, filename
        if (process.platform === 'darwin') {
          const arch = process.arch === 'arm64' ? '-arm64' : ''
          filename = `owo-terminal-${info.version}${arch}.dmg`
          downloadUrl = `https://github.com/0ui0/owo_terminal_public/releases/download/v${info.version}/${filename}`
        } else {
          const arch = process.arch
          const platform = process.platform === 'win32' ? 'win' : 'linux'
          filename = `owo-terminal-${info.version}-${platform}-${arch}.zip`
          downloadUrl = `https://github.com/0ui0/owo_terminal_public/releases/download/v${info.version}/${filename}`
        }

        // Find correct hash for this specific file (ARM64 vs x64)
        let targetHash = info.sha512
        if (info.files && Array.isArray(info.files)) {
          const fileEntry = info.files.find(f => f.url === filename || (f.url && f.url.endsWith('/' + filename)))
          if (fileEntry && fileEntry.sha512) {
            targetHash = fileEntry.sha512
            console.log("Found specific hash for:", filename)
          }
        }
        // Save for post-download check
        if (latestUpdateInfo) {
          latestUpdateInfo.selectedHash = targetHash
        }

        // Check if file exists in Downloads
        const savePath = pathLib.join(app.getPath("downloads"), filename)
        if (existsSync(savePath)) {
          console.log("Checking existing file:", savePath)
          validateFileHash(savePath, targetHash).then(result => {
            if (result.valid) {
              console.log("Hash match, skipping download")
              handleManualUpdateReady(savePath)
            } else {
              console.log("Hash mismatch, redownloading")
              win.webContents.downloadURL(downloadUrl)
            }
          })
        } else {
          win.webContents.downloadURL(downloadUrl)
        }
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
    broadcastStatus({ state: "downloaded", msg: trs("系统/消息/下载完成") })

    // Mac: Manual install via DMG to bypass signature issues
    if (process.platform === 'darwin') {
      const downloadedFile = info.downloadedFile
      if (downloadedFile) {
        import("electron").then(({ shell }) => {
          shell.openPath(downloadedFile) // Auto open DMG
        })
      }

      dialog.showMessageBox(win, {
        type: 'info',
        title: trs("系统/消息/更新就绪"),
        message: trs("系统/更新/手动安装提示", { cn: "下载已完成。已为您打开安装包，请将图标拖入应用程序文件夹以完成覆盖安装。", en: "Download complete. Installer opened. Please drag the icon to Applications to overwrite." }),
        buttons: [trs("系统/动作/退出应用", { cn: "退出应用", en: "Quit App" }), trs("系统/动作/稍后", { cn: "稍后", en: "Later" })]
      }).then((result) => {
        if (result.response === 0) {
          app.quit()
        }
      })
    } else {
      // Windows/Linux: Manual ZIP prompt (legacy support)
      // Since we use manual download now, this event might not be triggered by autoUpdater if we don't use it.
      // But if we did use autoUpdater.downloadUpdate(), this would trigger.
      // Since we switched to manual `win.webContents.downloadURL`, this block is effectively dead code for new flow,
      // but kept for safety or if we revert. 
      // Actually, let's just keep it simple or comment it out to avoid confusion? 
      // The `will-download` listener handles the manual flow. 
    }
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