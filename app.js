import { app, BrowserWindow, Menu, dialog } from "electron"
import pkgUpdater from "electron-updater"
const { autoUpdater } = pkgUpdater
import serve from "./server/serve.js"
import pathLib from "path"
import { fileURLToPath } from 'url';
import path from "path";
import projectManager from "./server/managers/projectManager.js"

// --- Auto Updater Configuration ---
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-available', () => {
  console.log('Update available.')
})

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: '更新已就绪',
    message: `新版本 (${info.version}) 已下载完成。是否现在重启应用以完成更新？`,
    buttons: ['现在重启', '稍后提醒']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall()
    }
  })
})

autoUpdater.on('error', (err) => {
  console.error('Update error:', err)
})


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


  const template = [
    {
      label: process.platform === 'darwin' ? app.name : '文件',
      submenu: [
        {
          role: 'quit',
          label: '退出'
        }
      ]
    },

    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: "撤销" },
        { role: 'redo', label: "重做" },
        { type: 'separator' },
        { role: 'cut', label: "剪切" },
        { role: 'copy', label: "复制" },
        { role: 'paste', label: "粘贴" },
        { role: 'pasteAndMatchStyle', label: "粘贴并匹配样式" }, // macOS 特有
        { role: 'delete', label: "删除" },
        { role: 'selectAll', label: "全选" }
      ]
    },

    {
      label: '视图',
      submenu: [
        {
          label: '刷新',
          accelerator: process.platform === 'darwin' ? 'Command+R' : 'Ctrl+R',
          click: () => {
            win.webContents.reload()
          }
        }
      ]
    },
    {
      label: '开发',
      submenu: [
        {
          label: '开发者工具',
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