import { app, dialog } from "electron"
import { exec } from "child_process"
import pkgUpdater from "electron-updater"
const { autoUpdater } = pkgUpdater
import pathLib from "path"
import fs from "fs-extra"
import crypto from "crypto"
import { trs } from "./server/tools/i18n.js"
import ioServer from "./server/ioServer/ioServer.js"

let latestUpdateInfo = null

const appUpdater = {
  // 配置自动更新器基础参数
  init() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // 显式配置更新路径，杜绝工作目录切换至 server/ 导致的寻址偏离
    try {
      if (process.resourcesPath) {
        const ymlPath = pathLib.join(process.resourcesPath, "app-update.yml")
        if (fs.existsSync(ymlPath)) {
          autoUpdater.updateConfigPath = ymlPath
        }
      }
    } catch (e) {}

    autoUpdater.setFeedURL({
      provider: "github",
      owner: "0ui0",
      repo: "owo_terminal_public"
    })
  },

  // 推送系统更新通知给前端
  pushMessage(msg) {
    if (ioServer.io) {
      ioServer.io.emit('sys:pushMessage', {
        id: msg.id || crypto.randomUUID(),
        title: msg.title,
        type: msg.type || 'info',
        content: msg.content || '',
        time: Date.now(),
        isRead: msg.isRead !== undefined ? msg.isRead : false,
        tag: msg.tag || 'sys-update',
        merge: msg.merge || 'none',
        action: msg.action || null,
        meta: msg.meta || null
      })
    }
  },

  // 检查更新触发函数
  async checkForUpdates() {
    return await autoUpdater.checkForUpdatesAndNotify()
  },

  // 挂载窗口级更新事件监听（下载拦截、进度上报、Socket 联动）
  setupWindowUpdater(win, options = {}) {
    this.win = win
    if (options.onBeforeQuit) {
      this.onBeforeQuit = options.onBeforeQuit
    }

    // 辅助函数：获取当前可用窗口（动态获取最新活跃窗口，安全避免已销毁窗口引发异常）
    const getActiveWin = () => {
      if (this.win && !this.win.isDestroyed()) return this.win
      return null
    }

    // 幂等性守卫：避免在 macOS 下关窗后点击 Dock 重建窗口时重复注册监听器
    if (this._isListening) return
    this._isListening = true

    // 处理手动下载完成（macOS DMG 挂载 / Windows 手动安装）
    const handleManualUpdateReady = (savePath) => {
      const activeWin = getActiveWin()
      if (activeWin) activeWin.setProgressBar(-1)
      const isArchive = savePath.endsWith('.zip')
      const actionText = isArchive ? trs("系统/更新/打开并解压", { cn: "打开并解压", en: "Open & Extract" }) : trs("系统/更新/启动安装", { cn: "启动安装向导", en: "Launch Installer" })

      this.pushMessage({
        id: crypto.randomUUID(),
        title: trs("系统/消息/下载完成", { cn: "下载完成", en: "Download complete" }),
        type: "success",
        content: trs("系统/更新/下载就绪提示", {
          cn: `新版本已成功下载至：\n${savePath}\n\n请点击下方按钮启动安装。安装过程中程序将自动退出。`,
          en: `New version downloaded to:\n${savePath}\n\nClick the button below to install. The app will close during installation.`
        }),
        isRead: false,
        tag: "sys-update",
        merge: "cover",
        action: {
          type: "dialog",
          title: trs("系统/更新/准备安装", { cn: "准备就绪", en: "Ready to Install" }),
          message: trs("系统/更新/安装提示弹窗", {
            cn: `更新包已保存至本地：\n${savePath}\n\n是否立即启动安装并退出当前程序？`,
            en: `Update package saved:\n${savePath}\n\nLaunch installer and quit now?`
          }),
          buttons: [
            actionText,
            trs("系统/动作/前往目录", { cn: "仅前往下载目录", en: "Open Download Folder" }),
            trs("系统/动作/稍后", { cn: "稍后", en: "Later" })
          ]
        }
      })

      dialog.showMessageBox(activeWin, {
        type: 'info',
        title: trs("系统/更新/准备安装", { cn: "准备就绪", en: "Ready to Install" }),
        message: trs("系统/更新/安装提示弹窗", {
          cn: `更新包已保存至本地：\n${savePath}\n\n是否立即启动安装并退出当前程序？`,
          en: `Update package saved:\n${savePath}\n\nLaunch installer and quit now?`
        }),
        buttons: [
          actionText,
          trs("系统/动作/前往目录", { cn: "仅前往下载目录", en: "Open Download Folder" }),
          trs("系统/动作/稍后", { cn: "稍后", en: "Later" })
        ],
        cancelId: 2
      }).then((result) => {
        if (result.response === 0) {
          import("electron").then(async ({ shell }) => {
            if (isArchive) {
              shell.showItemInFolder(savePath)
              if (typeof this.onBeforeQuit === 'function') this.onBeforeQuit()
              app.quit()
            } else {
              await shell.openPath(savePath)
              if (process.platform === 'darwin') {
                setTimeout(() => exec("open -a Finder"), 500)
              }
              if (typeof this.onBeforeQuit === 'function') this.onBeforeQuit()
              app.quit()
            }
          })
        } else if (result.response === 1) {
          import("electron").then(({ shell }) => shell.showItemInFolder(savePath))
        }
      })
    }

    // 拦截原生下载流
    win.webContents.session.on('will-download', (event, item, webContents) => {
      let lastProgressTime = 0
      item.on('updated', (event, state) => {
        const activeWin = getActiveWin()
        if (!activeWin) return
        if (!item.getSavePath()) return // 尚未选择保存路径前不刷进度
        if (state === 'interrupted') {
          activeWin.setProgressBar(-1)
          this.pushMessage({
            id: crypto.randomUUID(),
            title: "下载被中断 / Download interrupted",
            type: "error",
            content: trs("系统/更新/中断提示", { cn: "下载进度已被中断，请重试", en: "Download was interrupted, please try again" }),
            isRead: false,
            tag: "sys-update",
            merge: "cover"
          })
        } else if (state === 'progressing') {
          if (item.getTotalBytes() > 0) {
            const progress = (item.getReceivedBytes() / item.getTotalBytes()) * 100
            activeWin.setProgressBar(progress / 100)
            const now = Date.now()
            if (!lastProgressTime || now - lastProgressTime > 500 || progress === 100) {
              lastProgressTime = now
              this.pushMessage({
                id: crypto.randomUUID(),
                title: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." }) + ` ${Math.round(progress)}%`,
                type: "downloading",
                content: trs("系统/更新/保存本地", { cn: "正在将更新文件保存到本地...", en: "Saving update files locally..." }),
                isRead: false,
                tag: "sys-update",
                merge: "cover",
                meta: { progress: Math.round(progress) }
              })
            }
          }
        }
      })
      item.once('done', (event, state) => {
        const activeWin = getActiveWin()
        if (state === 'completed') {
          const savePath = item.getSavePath()
          handleManualUpdateReady(savePath)
        } else {
          if (activeWin) activeWin.setProgressBar(-1)
          this.pushMessage({
            id: crypto.randomUUID(),
            title: `下载失败: ${state} / Download failed`,
            type: "error",
            content: trs("系统/更新/异常提示", { cn: "下载过程中出现异常", en: "An exception occurred during download" }),
            isRead: false,
            tag: "sys-update",
            merge: "cover"
          })
        }
      })
    })

    // autoUpdater 核心状态事件
    autoUpdater.on('checking-for-update', () => {
      this.pushMessage({
        id: crypto.randomUUID(),
        title: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }),
        type: "info",
        content: trs("系统/更新/连接中", { cn: "正在与发布服务器通信...", en: "Communicating with release server..." }),
        isRead: false,
        tag: "sys-update",
        merge: "cover"
      })
    })

    autoUpdater.on('update-available', (info) => {
      latestUpdateInfo = info
      this.pushMessage({
        id: crypto.randomUUID(),
        title: trs("系统/更新/发现新版本", { cn: "发现新版本", en: "New version found" }) + ` v${info.version}`,
        type: "info",
        content: trs("系统/更新/准备下载", { cn: "已准备好获取更新文件", en: "Ready to fetch update files" }),
        isRead: false,
        tag: "sys-update",
        merge: "cover"
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
      const activeWin = getActiveWin()
      dialog.showMessageBox(activeWin, {
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

          this.pushMessage({
            id: crypto.randomUUID(),
            title: trs("系统/更新/开始下载", { cn: "正在开始下载...", en: "Starting download..." }),
            type: "downloading",
            content: trs("系统/更新/启动浏览器下载", { cn: "即将启动浏览器下载文件", en: "Starting browser to download file" }),
            isRead: false,
            tag: "sys-update",
            merge: "cover"
          })
          if (activeWin && !activeWin.isDestroyed()) {
            activeWin.webContents.downloadURL(downloadUrl)
          }
        }
      })
    })

    let lastAutoUpdaterProgressTime = 0
    autoUpdater.on('download-progress', (progressObj) => {
      const activeWin = getActiveWin()
      if (activeWin) activeWin.setProgressBar(progressObj.percent / 100)
      const now = Date.now()
      if (!lastAutoUpdaterProgressTime || now - lastAutoUpdaterProgressTime > 500 || progressObj.percent === 100) {
        lastAutoUpdaterProgressTime = now
        this.pushMessage({
          id: crypto.randomUUID(),
          title: trs("系统/更新/下载中", { cn: "正在下载...", en: "Downloading..." }) + ` ${Math.round(progressObj.percent)}%`,
          type: "downloading",
          content: trs("系统/更新/保存本地", { cn: "正在将更新文件保存到本地...", en: "Saving update files locally..." }),
          isRead: false,
          tag: "sys-update",
          merge: "cover",
          meta: { progress: Math.round(progressObj.percent) }
        })
      }
    })

    autoUpdater.on('update-not-available', (info) => {
      this.pushMessage({
        id: crypto.randomUUID(),
        title: trs("系统/更新/已是最新", { cn: "当前已是最新版本", en: "Already up to date" }) + ` (v${info.version})`,
        type: "success",
        content: trs("系统/更新/无需更新", { cn: "无需更新", en: "No update needed" }),
        isRead: true,
        tag: "sys-update",
        merge: "cover"
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      // 理论上由于接管了 downloadURL，此原生流不会被触发，作为兜底
      const activeWin = getActiveWin()
      if (activeWin) activeWin.setProgressBar(-1)
      this.pushMessage({
        id: crypto.randomUUID(),
        title: trs("系统/消息/下载完成", { cn: "下载完成", en: "Download complete" }),
        type: "success",
        content: trs("系统/更新/点击安装", { cn: "点击这里重新启动并安装", en: "Click to restart and install" }),
        isRead: false,
        tag: "sys-update",
        merge: "cover",
        action: { type: "emit", event: "sys:quitAndInstall" }
      })
    })

    autoUpdater.on('error', (err) => {
      const activeWin = getActiveWin()
      if (activeWin) activeWin.setProgressBar(-1)
      let missAppUpdate = ""
      const errStr = String(err)
      if (errStr.includes('app-update.yml') || errStr.includes('ENOENT')) {
        missAppUpdate = "\n" + trs("系统/更新/绿色版提示", {
          cn: "（提示，当前为绿色版，无法自动检测更新）",
          en: "(Note: This is a portable version, and cannot auto-check for updates.)"
        })
      }
      const errorMsg = (err.message || String(err)) + missAppUpdate
      this.pushMessage({
        id: crypto.randomUUID(),
        title: trs("系统/错误/更新出错", { cn: "更新出错", en: "Update Error" }),
        type: "error",
        content: trs("系统/更新/手动下载提示", {
          cn: "更新出错，请手动前往下载最新版本：\nhttps://github.com/0ui0/owo_terminal_public/releases\n\n",
          en: "Update failed, please download the latest version manually:\nhttps://github.com/0ui0/owo_terminal_public/releases\n\n"
        }) + (missAppUpdate ? missAppUpdate.trim() + "\n\n" : "") + (err.message || String(err)),
        isRead: false,
        tag: "sys-update",
        merge: "cover"
      })
    })

    // 监听前端更新与重启安装请求
    if (ioServer.io) {
      ioServer.io.on('connection', (socket) => {
        socket.on('sys:checkUpdate', async () => {
          this.pushMessage({
            id: crypto.randomUUID(),
            title: trs("系统/更新/检查中", { cn: "正在检查更新...", en: "Checking for updates..." }),
            type: "info",
            content: trs("系统/更新/连接中", { cn: "正在与发布服务器通信...", en: "Communicating with release server..." }),
            isRead: false,
            tag: "sys-update",
            merge: "cover"
          })
          const result = await autoUpdater.checkForUpdatesAndNotify()
          if (!result && !app.isPackaged) {
            this.pushMessage({
              id: crypto.randomUUID(),
              title: trs("系统/更新/开发环境", { cn: "开发环境跳过检查", en: "Skipped in Dev Mode" }),
              type: "error",
              content: trs("系统/更新/打包后可用", { cn: "仅打包后的版本可执行自动更新", en: "Only packaged app supports auto-update" }),
              isRead: false,
              tag: "sys-update",
              merge: "cover"
            })
          }
        })

        socket.on('sys:startDownload', () => {
          this.pushMessage({
            id: crypto.randomUUID(),
            title: trs("系统/更新/开始下载", { cn: "正在开始下载...", en: "Starting download..." }),
            type: "downloading",
            content: trs("系统/更新/初始化", { cn: "正在初始化下载资源...", en: "Initializing download resources..." }),
            isRead: false,
            tag: "sys-update",
            merge: "cover"
          })
          autoUpdater.downloadUpdate()
        })

        socket.on('sys:quitAndInstall', () => {
          if (typeof this.onBeforeQuit === 'function') this.onBeforeQuit()
          autoUpdater.quitAndInstall()
        })
      })
    }
  }
}

export default appUpdater
