import fs from "fs"
import fsP from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import { app } from "electron"

class AppManager {
  constructor() {
    this.apps = new Map()        // appId -> appInstance
    this.appDefs = new Map()    // type -> appDefinition
    this.appDefsErrors = new Map() // type/dir -> error (NEW: 记录加载错误的 App)
    this.io = null
  }

  // 初始化，传入 io 实例
  init(io) { // Changed signature to accept 'app'
    this.io = io
    this.watchAppDefs()
    return this.loadappDefs()
  }

  // 监听 apps 目录变动
  watchAppDefs() {
    const appsDir = path.resolve(import.meta.dirname, "../apps")
    console.log(`[AppManager] Watching for app changes in: ${appsDir}`)

    // 使用 fs.watch (非 promise 版本更适合长期监听)
    fs.watch(appsDir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith("app.json") || filename.endsWith("backend.js") || filename.endsWith("frontend.js"))) {
        const appDirName = filename.split(path.sep)[0]
        console.log(`[AppManager] Detected change in ${filename}, refreshing ${appDirName}...`)
        this.loadappDefs(appDirName).then(() => {
          if (this.io) this.io.emit("appDefs:updated", this.getappDefs())
        })
      }
    })
  }

  // 读取 apps 目录，注册所有 App 类型
  async loadappDefs(specificDir = null) {
    const appsDir = path.resolve(import.meta.dirname, "../apps")
    console.log(`[AppManager] Reading apps from: ${appsDir}`)
    try {
      const dirNames = specificDir ? [specificDir] : await fsP.readdir(appsDir)

      for (const dirName of dirNames) {
        const appDirPath = path.join(appsDir, dirName)
        const stat = await fsP.stat(appDirPath).catch(() => null)
        if (!stat || !stat.isDirectory()) continue

        const appJsonPath = path.join(appDirPath, "app.json")
        try {
          const appJsonStr = await fsP.readFile(appJsonPath, "utf-8")
          let appJson
          try {
            appJson = JSON.parse(appJsonStr)
          } catch (pe) {
            throw new Error(`app.json 解析失败: ${pe.message}`)
          }

          if (!appJson.id) {
            throw new Error(`app.json 缺少 'id' 字段`)
          }

          const backendFile = appJson.backend || "backend.js"
          const backendPath = path.join(appDirPath, backendFile)

          let backend
          try {
            // 使用 timestamp 绕过 ESM import 缓存，实现热重载
            // Fixed for Windows: Convert path to File URL
            const backendUrl = pathToFileURL(backendPath).href
            backend = (await import(`${backendUrl}?t=${Date.now()}`)).default
          } catch (ie) {
            throw new Error(`加载后端 backend.js 失败: ${ie.message}`)
          }

          // Call setup hook if available (for global initialization)
          if (backend.setup) {
            try {
              backend.setup({ manager: this })
            } catch (se) {
              console.error(`[AppManager] Setup hook failed for ${appJson.id}:`, se)
            }
          }

          this.appDefs.set(appJson.id, {
            ...appJson,
            backend,
            frontendPath: path.join(appDirPath, appJson.frontend || "frontend.js")
          })
          this.appDefsErrors.delete(appJson.id) // 加载成功，清除错误记录
          console.log(`[AppManager] Registered/Updated app: ${appJson.id}`)
        } catch (e) {
          const errorMsg = `加载 App 失败 (${dirName}): ${e.message}`
          this.appDefsErrors.set(dirName, errorMsg)
          if (!specificDir) {
            // 静默加载
          } else {
            console.error(`[AppManager] ${errorMsg}`)
            if (this.io) this.io.emit("app:error", { msg: errorMsg })
          }
        }
      }
    } catch (e) {
      console.log("[AppManager] 读取 apps 目录失败:", e.message)
    }
  }

  // 启动 App
  async launch(type, options = {}) {
    try {
      const appDef = this.appDefs.get(type)
      if (!appDef) return { ok: false, msg: `未知的 App 类型: ${type}` }

      const appId = options.appId || `${type}_${Date.now()}`

      // 检查是否已存在同 appId 的实例
      if (this.apps.has(appId)) {
        const existingApp = this.apps.get(appId)
        if (!options.background && this.io) {
          // 重新发射 launch 事件以唤醒/重建前端 GUI
          this.io.emit("app:launch", {
            appId,
            type,
            name: appDef.name,
            icon: appDef.icon,
            frontendUrl: `/api/apps/${type}/frontend.js?t=${Date.now()}`,
            window: appDef.window,
            data: existingApp.data
          })
          this.io.emit("app:active", { appId })
        }
        return { ok: true, app: existingApp, msg: "App 已唤醒" }
      }

      const app = {
        id: appId,
        type,
        state: "running",
        guiLaunched: false,
        data: { ...options.data },
        createdAt: Date.now(),
      }

      this.apps.set(appId, app)

      // 初始化后端 (带错误捕获)
      if (appDef.backend?.init) {
        try {
          await appDef.backend.init(app, this)
        } catch (initErr) {
          console.error(`[AppManager] Backend init failed for ${type}:`, initErr)
          this.apps.delete(appId) // 撤销注册
          const errorMsg = `App 初始化失败: ${initErr.message}`
          if (this.io) this.io.emit("app:error", { appId, msg: errorMsg })
          return { ok: false, msg: errorMsg }
        }
      }

      // 通知前端启动 GUI（除非是后台模式）
      if (!options.background && this.io) {
        this.io.emit("app:launch", {
          appId,
          type,
          name: appDef.name,
          icon: appDef.icon,
          frontendUrl: `/api/apps/${type}/frontend.js?t=${Date.now()}`,
          window: appDef.window,
          data: app.data
        })
      }

      return { ok: true, app }
    } catch (error) {
      throw error
    }
  }

  // 关闭 App
  async close(appId) {
    const app = this.apps.get(appId)
    if (!app) return { ok: false, msg: `App ${appId} 不存在` }

    const appDef = this.appDefs.get(app.type)
    if (appDef?.backend?.destroy) {
      try {
        await appDef.backend.destroy(app, this)
      } catch (e) {
        console.error(`[AppManager] Backend destroy error for ${appId}:`, e)
      }
    }

    this.apps.delete(appId)

    if (this.io) {
      this.io.emit("app:close", { appId })
    }

    return { ok: true }
  }

  // 调用 App 操作（转发到后端执行）
  async dispatch(appId, action, args = {}) {
    const app = this.apps.get(appId)
    if (!app) return { error: `App ${appId} 不存在` }

    const appDef = this.appDefs.get(app.type)

    //统一后端处理，前端由于backend.dispatch的io处理
    if (appDef?.backend?.dispatch) {
      try {
        const result = await appDef.backend.dispatch({ app, action, args, appManager: this, io: this.io })
        return result
      } catch (e) {
        console.error(`[AppManager] Backend dispatch error for ${appId}:`, e)
        return { error: e.message }
      }
    }
  }

  // 获取单个 App
  get(appId) {
    return this.apps.get(appId)
  }

  // 获取所有 App 概要（供 AI 查询 & 前端同步）
  getSummary() {
    return [...this.apps.values()].map(app => ({
      id: app.id,
      type: app.type,
      state: app.state,
      guiLaunched: app.guiLaunched,
      data: app.data
    }))
  }

  // 获取 App 类型列表（供 前端桌面显示）
  getappDefs() {
    return [...this.appDefs.values()].map(def => ({
      id: def.id,
      name: def.name,
      icon: def.icon,
      description: def.description
    }))
  }

  // 前端 GUI 已启动的回调
  onGuiLaunched(appId) {
    const app = this.apps.get(appId)
    if (app) app.guiLaunched = true
  }
}

export default new AppManager()
