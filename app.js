import { app, BrowserWindow, dialog } from "electron"
import fs from "fs-extra"
import serve from "./server/serve.js"
import pathLib from "path"
import { fileURLToPath, pathToFileURL } from 'url';
import projectManager from "./server/managers/projectManager.js"
import { trs } from "./server/tools/i18n.js"
import comData from "./server/comData/comData.js"
import tempPath from "./server/tools/tempPath.js"
import setupAppMenu from "./server/tools/appMenu.js"
import appUpdater from "./appUpdater.js"
import ioServer from "./server/ioServer/ioServer.js"

let port


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
appUpdater.init()




let serveDir = pathLib.dirname(fileURLToPath(import.meta.url))
process.chdir(pathLib.join(serveDir, "/server/"))



// 生命周期标志：指示是否正处于应用整体退出流程，避免更新重启被 isDirty 拦截
let isQuitting = false



// 全局单例监听新创建的子视窗，依据 URL 中的 winId 自动为窗口实例注入 win.winId，杜绝多次开窗重复注册泄漏
app.on('browser-window-created', (event, subWin) => {
  const bindWinId = (stage) => {
    try {
      const curUrl = subWin.webContents.getURL()
      const match = curUrl.match(/[?&]winId=([^&#]+)/)
      if (match) {
        subWin.winId = decodeURIComponent(match[1])
      }
    } catch (e) {
      console.error(`[Electron subWin:${stage}] bindWinId error:`, e)
    }
  }
  subWin.webContents.on('did-navigate', () => bindWinId('did-navigate'))
  subWin.webContents.on('did-navigate-in-page', () => bindWinId('did-navigate-in-page'))
  subWin.webContents.on('did-finish-load', () => bindWinId('did-finish-load'))

  // 监听操作系统物理视窗生命周期事件，通过 Socket 向前端实时广播状态同步
  subWin.on('minimize', () => {
    if (subWin.winId) ioServer.io?.emit('window:state', { winId: subWin.winId, minimized: true })
  })
  subWin.on('restore', () => {
    if (subWin.winId) ioServer.io?.emit('window:state', { winId: subWin.winId, minimized: false })
  })
  subWin.on('closed', () => {
    if (subWin.winId) ioServer.io?.emit('window:state', { winId: subWin.winId, closed: true })
  })

  // 注入快捷键支持：在无边框子窗口按 F12 或 Cmd+Option+I (Mac) / Ctrl+Shift+I (Win) 自动唤出独立 DevTools
  subWin.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isF12 = input.key === 'F12'
      const isDevToolsMac = (input.meta || input.control) && input.alt && (input.key === 'i' || input.key === 'I')
      const isDevToolsWin = input.control && input.shift && (input.key === 'i' || input.key === 'I')
      if (isF12 || isDevToolsMac || isDevToolsWin) {
        subWin.webContents.toggleDevTools({ mode: 'detach' })
      }
    }
  })
})

const createWindow = (port) => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    icon: pathLib.resolve("./icon.png"),
    title: "宅喵终端",
    titleBarStyle: 'hiddenInset',
    frame: false,
    transparent: true,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: pathLib.join(serveDir, "server/preload.js")
    }
  })
  win.winId = 'main'

  // 拦截 window.open，开启原生透明无边框辅助窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        titleBarStyle: 'hiddenInset',
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        webPreferences: {
          preload: pathLib.join(serveDir, "server/preload.js")
        }
      }
    }
  })

  // 传统模式：一律加载后端托管的编译产物（www/dist），不再依赖 vite dev server
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

  // 挂载窗口级自动更新事件监听与通信交互
  appUpdater.setupWindowUpdater(win, {
    onBeforeQuit: () => { isQuitting = true }
  })

  setupAppMenu(win, (msg) => appUpdater.pushMessage(msg))
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

    // 1. 优先注册 Loader Hook：确保外部 App 虚拟路径投射机制在服务与 App 加载前全局就绪
    try {
      const { register } = await import("node:module")
      const { MessageChannel } = await import("worker_threads")
      const { setLoaderPort } = await import("./server/apps/moduleRegistry.js")
      const tempPath = (await import("./server/tools/tempPath.js")).default

      const userDataAppsDir = pathLib.join(tempPath.getUserDataDir(), "apps")
      process.env.USER_APPS_DIR = userDataAppsDir

      const { port1, port2 } = new MessageChannel()
      const loaderUrl = pathToFileURL(pathLib.join(serveDir, "server/apps/moduleRegistry.js")).href

      register(loaderUrl, {
        parentURL: import.meta.url,
        data: { port: port2, userDataAppsDir },
        transferList: [port2]
      })

      setLoaderPort(port1)
      console.log("[HMR] Loader hook registered with MessageChannel")
    } catch (e) {
      console.warn("[HMR] Loader hook not supported:", e.message)
    }

    // 2. 启动服务（内部调用 ioServer.run -> appManager.init -> loadappDefs）
    const serveResult = await serve()
    port = serveResult.port

    // 脏检查：利用 DynamicData 原生的观察者机制，当 comData 数据变动时标记项目为脏
    if (comData.data) {
      comData.data.addObserver('markProjectDirty', () => projectManager.markDirty())
    }


    createWindow(port)
    appUpdater.checkForUpdates()
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
    createWindow(port)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


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
