import fs from "fs"
import fsP from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import { app } from "electron"
import idTool from "../tools/idTool.js"

class AppManager {
  constructor() {
    this.apps = new Map()        // appId -> appInstance
    this.appDefs = new Map()    // type -> appDefinition
    this.appDefsErrors = new Map() // type/dir -> error (NEW: 记录加载错误的 App)
    this.io = null
    this.tools = []               // 扁平工具数组，每个 tool 带 type 属性
    this.loadedAppTools = new Set() // 已加载工具的 appType 集合
  }

  // 初始化，传入 io 实例
  async init(io) {
    this.io = io
    this.watchAppDefs()
    await this.loadappDefs()        // 1. 先加载 App 定义
    await this.loadCoreTools()      // 2. 再加载核心内置工具
    await this.loadAutoAppTools()   // 3. 最后加载标记为自动加载的 App 工具
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

      const appId = options.appId || idTool.get("app")

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

    // 自动卸载工具：如果该类型 App 没有其他运行实例且非 autoLoadTools，则卸载
    const appType = app.type
    const hasOtherInstances = [...this.apps.values()].some(a => a.type === appType)
    const appDef2 = this.appDefs.get(appType)
    if (!hasOtherInstances && !appDef2?.autoLoadTools) {
      this.unregisterAppTools(appType)
    }

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

  // 获取 App 简单列表（用于 AI 上下文）
  // 返回格式: ["浏览器(browser_123)", "编辑器(editor_456)", ...]
  getAppList(maxCount = 20) {
    const apps = [...this.apps.values()]
    const appDefMap = new Map([...this.appDefs.values()].map(d => [d.id, d]))

    return apps.slice(0, maxCount).map(app => {
      const appDef = appDefMap.get(app.type)
      const name = appDef?.name || app.type
      return `${name}(${app.id})`
    })
  }

  // 获取 AI 专用概要，返回易读字符串数组
  // maxCount: 最多返回几个 App 的详情
  // maxLength: 每个 App 详情最大长度（超过硬截断）
  getAiSummary(maxCount = 5, maxLength = 1000) {
    const allApps = [...this.apps.values()]

    // 1. 找出全场最高层级（zIndex 最大且未最小化）的窗口 zIndex
    let maxZ = -1
    allApps.forEach(app => {
      const win = app.data?.window
      if (win && !win.minimized && win.zIndex > maxZ) {
        maxZ = win.zIndex
      }
    })

    // 2. 按活跃度排序：聚焦 > 活跃Tab > 未最小化 > 其他
    const priority = (app) => {
      const win = app.data?.window || {}
      const isFocused = win.zIndex === maxZ && !win.minimized && win.activeSign === app.id
      const isActiveTab = win.activeSign === app.id
      if (isFocused) return 4
      if (isActiveTab) return 3
      if (!win.minimized) return 2
      return 1
    }

    const sortedApps = allApps.sort((a, b) => priority(b) - priority(a)).slice(0, maxCount)

    // 3. 格式化每个 App 为易读字符串
    return sortedApps.map(app => {
      const win = app.data?.window || {}
      const data = app.data || {}
      const appDef = this.appDefs.get(app.type)

      const isFocused = win.zIndex === maxZ && !win.minimized && win.activeSign === app.id
      const isActiveTab = win.activeSign === app.id

      // 窗口状态描述
      let windowState = '正常'
      if (win.isMaximized) windowState = '最大化'
      if (win.minimized) windowState = '最小化'

      // 活跃状态描述
      const activityState = isFocused ? '聚焦中' : (isActiveTab ? '活跃' : '后台')

      // 处理 data 字段，排除大内容字段，对 content 做特殊处理
      const dataFields = []
      for (const key in data) {
        if (key === 'window') continue // 排除窗口大对象

        // 特别处理编辑器的大内容字段
        if (key === 'content' || key === 'originalContent' || key === 'proposedContent') {
          const content = data[key] || ''
          if (content.length > 0) {
            const lines = content.split('\n').length
            const preview = content.slice(0, 150).replace(/\n/g, '\\n')
            const suffix = content.length > 150 ? '...(已截断)' : ''
            dataFields.push(`${key}: [${content.length}字符/${lines}行] "${preview}${suffix}"`)
          }
          continue
        }

        // 普通字段截断处理
        let val = data[key]
        if (typeof val === 'string') {
          const maxValLen = key.toLowerCase().includes('path') ? 200 : 100
          if (val.length > maxValLen) {
            val = val.slice(0, maxValLen) + '...(截断)'
          }
        } else if (val && typeof val === 'object') {
          try {
            val = JSON.stringify(val).slice(0, 100)
            if (val.length >= 100) val += '...(截断)'
          } catch {
            val = '[Object]'
          }
        }
        dataFields.push(`${key}: ${val}`)
      }

      // 组装成易读字符串
      const appName = appDef?.name || app.type
      let result = `[${appName} ${app.id}] ${activityState} | ${windowState}`
      if (dataFields.length > 0) {
        result += '\n  ' + dataFields.join('\n  ')
      }

      // 硬截断
      if (result.length > maxLength) {
        result = result.slice(0, maxLength - 3) + '...'
      }

      return result
    })
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

  // ========== 工具注册表能力 ==========

  /**
   * 加载核心内置工具（sysCall/usrCall/aiCall 三个目录）
   * 每个工具注入 tool.type 属性
   */
  async loadCoreTools() {
    const toolDirs = [
      { dir: "sysCall", type: "sysCall" },
      { dir: "usrCall", type: "usrCall" },
      { dir: "aiCall",  type: "aiCall" }
    ]
    const aiAskDir = path.resolve(import.meta.dirname, "../tools/aiAsk")

    for (const { dir, type } of toolDirs) {
      const dirPath = path.join(aiAskDir, dir)
      try {
        const files = await fsP.readdir(dirPath)
        for (const file of files) {
          if (!file.endsWith(".js")) continue
          try {
            const fileUrl = pathToFileURL(path.join(dirPath, file)).href
            const mod = (await import(fileUrl)).default
            if (!mod || !mod.name || !mod.id) continue
            // 排除发送/接收模板
            if (mod.name === "发送模板" || mod.name === "接收模板") continue
            // 避免重复
            if (this.tools.find(t => t.id === mod.id)) continue
            mod.type = type
            this.tools.push(mod)
          } catch (e) {
            console.error(`[AppManager] 加载核心工具 ${dir}/${file} 失败:`, e.message)
          }
        }
      } catch (e) {
        // 目录不存在则跳过
        if (e.code !== "ENOENT") {
          console.error(`[AppManager] 读取目录 ${dir} 失败:`, e.message)
        }
      }
    }
    console.log(`[AppManager] 已加载 ${this.tools.length} 个核心工具`)
  }

  /**
   * 遍历 appDefs，对 autoLoadTools: true 的 App 自动加载 appCall 工具
   */
  async loadAutoAppTools() {
    for (const [appType, appDef] of this.appDefs) {
      if (appDef.autoLoadTools) {
        await this.registerAppTools(appType)
      }
    }
  }

  /**
   * 扫描指定 App 的 appCall/ 目录，返回工具模块列表
   */
  async scanAppTools(appType) {
    const appDef = this.appDefs.get(appType)
    if (!appDef) return []

    // 找到 app 目录
    const appsDir = path.resolve(import.meta.dirname, "../apps")
    const appDirPath = path.join(appsDir, appType)
    const appCallDir = path.join(appDirPath, "appCall")

    try {
      const stat = await fsP.stat(appCallDir)
      if (!stat.isDirectory()) return []
    } catch {
      return [] // appCall 目录不存在
    }

    const tools = []
    try {
      const files = await fsP.readdir(appCallDir)
      for (const file of files) {
        if (!file.endsWith(".js")) continue
        try {
          const fileUrl = pathToFileURL(path.join(appCallDir, file)).href
          const mod = (await import(`${fileUrl}?t=${Date.now()}`)).default
          if (!mod || !mod.name || !mod.id) continue
          mod.type = "appCall"
          mod._appType = appType // 标记所属 App，用于卸载
          tools.push(mod)
        } catch (e) {
          console.error(`[AppManager] 加载 App 工具 ${appType}/${file} 失败:`, e.message)
        }
      }
    } catch (e) {
      console.error(`[AppManager] 读取 appCall 目录失败 (${appType}):`, e.message)
    }
    return tools
  }

  /**
   * 将 App 工具注册到 this.tools
   * @param {string} appType - App 类型 ID
   * @returns {boolean} 是否成功
   */
  async registerAppTools(appType) {
    if (this.loadedAppTools.has(appType)) {
      console.log(`[AppManager] App ${appType} 的工具已加载，跳过`)
      return true
    }

    const appTools = await this.scanAppTools(appType)
    if (appTools.length === 0) return false

    // 追加到 tools 数组，避免 id 重复
    for (const tool of appTools) {
      if (!this.tools.find(t => t.id === tool.id)) {
        this.tools.push(tool)
      }
    }

    this.loadedAppTools.add(appType)
    console.log(`[AppManager] 已注册 ${appType} 的 ${appTools.length} 个工具`)
    return true
  }

  /**
   * 从 this.tools 中移除指定 App 的工具
   * @param {string} appType - App 类型 ID
   */
  unregisterAppTools(appType) {
    if (!this.loadedAppTools.has(appType)) return
    this.tools = this.tools.filter(t => t._appType !== appType)
    this.loadedAppTools.delete(appType)
    console.log(`[AppManager] 已卸载 ${appType} 的工具`)
  }

  /**
   * 获取当前所有可用工具（扁平数组）
   * @returns {Array} 工具数组
   */
  getTools() {
    return this.tools
  }

  /**
   * 检查指定 App 的工具是否已加载
   * @param {string} appType
   * @returns {boolean}
   */
  isAppToolsLoaded(appType) {
    return this.loadedAppTools.has(appType)
  }
}

export default new AppManager()
