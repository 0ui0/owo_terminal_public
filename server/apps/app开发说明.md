# owo-terminal App 开发指南

本文档是系统架构的最终事实来源，涵盖了从后端动态加载到前端单例渲染的全流程规范。

**核心架构：Singleton Data Manager + Closure Component + Dependency Injection**

---

## 1. 架构全景图

### 1.1 系统与应用关系
- **Server Core** (`server/apps/appManager.js`): 负责 App 的生命周期管理、热重载监听、后端逻辑执行。
- **Client Core** (`ioSocket.js` + `commonData`): 负责 Socket 通信、应用注册表维护、依赖注入。
- **App Plugin** (`server/apps/[AppName]/`): 插件化的业务单元，包含独立的后端逻辑与前端界面。

### 1.2 通信数据流
1.  **Frontend -> Backend**:
    -   调用：`settingData.fnCall("appDispatch", [appId, action, args])`
    -   路由：Socket -> Server -> `appManager.dispatch(appId, ...)` -> `backend.dispatch({ app, ... })`
2.  **Backend -> Frontend**:
    -   调用：`io.emit("app:dispatch", { appId, action, args })`
    -   路由：Socket -> `ioSocket` -> `commonData.appsData[appId]` (Singleton) -> `instance.onDispatch`

---

## 2. 核心机制详解

### 2.1 动态加载与热重载
-   **后端热重载**: `appManager.js` 监听 `server/apps` 目录变动。检测到 `backend.js` 更新时，使用时间戳 query (`?t=Date.now()`) 重新 `import` 模块，绕过 Node.js 缓存。
-   **前端热重载**: `appManager` 推送的 `frontendUrl` 同样带有时间戳，确保浏览器加载最新的 `frontend.js`。即使在不重启服务器的情况下，修改前端代码也能即时生效（需重新打开 App）。

### 2.2 依赖注入 (Dependency Injection)
-   **痛点解决**: 避免因后端 API 路由 (`/api/apps/...`) 导致的相对路径引用失效 (`import` 403 错误)。
-   **规范**: Frontend 组件**严禁** import 跨出 app 目录的文件。
-   **实现**: 所有公共模块 (`m`, `Notice`, `ioSocket`, `commonData`, `settingData`, `Box`, `iconPark`) 均由 `ioSocket.js` 在实例化组件时通过参数注入。

---

## 3. App 开发规范

### 3.1 目录结构
```text
server/apps/[myApp]/
  ├── app.json          # 元数据 (id, name, icon)
  ├── backend.js        # 后端逻辑 (Node.js)
  ├── frontend.js       # 前端界面 (Closure Component)
  └── myAppData.js      # 数据管理器 (Singleton)
```

### 3.2 Singleton Data Manager (`myAppData.js`)
**职责**: 全局唯一的“路由器”，负责管理活跃实例并转发消息。必须是 **对象单例**，而非工厂函数。

```javascript
/* myAppData.js */
export default {
  instances: new Map(), // 活跃实例注册表
  tools: {},            // 注入工具箱

  // 依赖注入接口
  addTool(name, tool) { this.tools[name] = tool },
  add(key, value) { this[key] = value },

  // 核心路由：ioSocket -> Singleton -> Instance
  onDispatch(msg, callback) {
    const instance = this.instances.get(msg.appId)
    // 转发给具体实例
    if (instance && instance.onDispatch) {
      instance.onDispatch(msg, callback)
    } else {
      if (callback) callback({ error: "Instance not found" })
    }
  },

  // 实例生命周期管理
  registerInstances(appId, instanceInterface) {
    if (!this.instances.has(appId)) this.instances.set(appId, instanceInterface)
  },
  unregisterInstances(appId, commonData) {
    this.instances.delete(appId)
    // 确保从全局公共注册表中移除
    if (commonData?.unregisterApp) commonData.unregisterApp(appId)
  }
}
```

### 3.3 Frontend Closure Component (`frontend.js`)
**职责**: 具体的 UI 渲染与业务逻辑。使用闭包维护状态，通过注册机制连接 Data Manager。

```javascript
/* frontend.js */
import myAppData from "./myAppData.js"

// 1. 接收注入依赖 (必须包含 commonData, ioSocket 等)
export default ({ appId, m, Notice, ioSocket, commonData, iconPark }) => {
  
  // 2. 私有闭包状态 (代替 vnode.state)
  let count = 0

  // 3. 实例接口 (暴露给 Data Manager)
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      // 处理后端推送的消息
      if (msg.action === "update") {
        count = msg.args.count; m.redraw()
      }
      // AI 调试接口
      if (msg.action === "getHTML") {
        // 返回当前 DOM HTML
      }
      if (callback) callback({ ok: true })
    }
  }

  // 4. 初始化流程
  const init = () => {
    // 注入 -> 注册实例 -> 注册单例到全局
    myAppData.addTool("commonData", commonData)
    myAppData.registerInstances(appId, instanceInterface)
    // 关键步骤：注册 Singleton 到全局
    if (commonData.registerApp) commonData.registerApp(appId, myAppData)
  }
  init()

  // 5. 视图返回
  return {
    onremove() { myAppData.unregisterInstances(appId, commonData) },
    view(vnode) {
      return m("div", [
        m("h1", count),
        m.trust(iconPark.getIcon("Like", { fill: "#f00" })) // 使用注入的图标
      ])
    }
  }
}
```

### 3.4 Backend Logic (`backend.js`)
**职责**: 处理业务逻辑，持久化数据（内存/文件），推送消息。

```javascript
/* backend.js */
export default {
  // 可选：初始化 (App 首次启动时)
  async init(app, appManager) {
    // app.data 是内存级持久化存储，重启丢失
    app.data.count = 0
  },
  
  // 可选：销毁 (App 关闭时)
  async destroy(app, appManager) {
    console.log("App destroyed")
  },

  // 必须：消息处理 (前端 fnCall 触发)
  async dispatch({ app, action, args, appManager, io }) {
    if (action === "add") {
      app.data.count++
      // 推送消息 (将会被 myAppData.onDispatch 接收)
      io.emit("app:dispatch", { appId: app.id, action: "update", args: { count: app.data.count } })
      return { ok: true }
    }
  }
}
```

## 4. 调试自检清单

1.  **依赖注入检查**: 如果组件报错 `iconPark is not defined`，请检查 `ioSocket.js` 是否已将 `iconPark` 传递给组件工厂。
2.  **注册链路检查**:
    -   前端是否调用了 `commonData.registerApp(appId, myAppData)`？
    -   `myAppData.onDispatch` 是否能正确找到 `instances.get(appId)`？
3.  **路径引用检查**: 确保前端没有使用 `../../` 等相对路径引用 App 外部文件。

---

## 5. 数据持久化 (State Persistence)

项目集成了全自动的保存与加载系统 (`my_project.owo`)。

### 5.1 窗口状态 (Window State) [全自动]
- **机制**: 只要使用标准 `Notice.launch(config)` 打开窗口，系统会自动接管并持久化以下状态：
    -   窗口坐标 (`x`, `y`)
    -   窗口尺寸 (`width`, `height`)
    -   最大化/最小化状态 (`isMaximized`, `minimized`)
    -   层级 (`zIndex`)
-   **开发者无需任何操作**。

### 5.2 App 内部数据 (App Internal Data) [需手动同步]
-   **机制**: 如果您的 App 有需要在重启后保持的数据（如编辑器内容、当前 URL、游戏进度），需要**主动**告知后端。
-   **API**: `settingData.fnCall("appUpdateData", [appId, dataObject])`
-   **原理**: 调用的 `dataObject` 会被 `Server` 浅合并到 `app.data` 中，最终序列化到 `.owo` 文件。
-   **实现示例**:

```javascript
/* frontend.js */
// 1. 状态变更时调用 (建议 Debounce)
const updateCount = (newCount) => {
    count = newCount
    // 同步到后端
    settingData.fnCall("appUpdateData", [appId, { count: count }])
}

// 2. 初始化时恢复 (oninit)
oninit(vnode) {
    // 检查是否有恢复的数据
    if (vnode.attrs.data && vnode.attrs.data.count) {
        count = vnode.attrs.data.count
    }
}
```
