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
-   **后端热重载**: `appManager.js` 监听 `server/apps` 目录变动。文件变更时，通过 `moduleRegistry.js` 的 `bumpAppDir()` 递增整个 App 目录下所有 `.js` 文件的版本号，版本号通过 `MessageChannel` 同步到 Node.js Loader 线程。`loadappDefs()` 使用带版本号的 URL（如 `backend.js?v=3`）重新 import，Loader 线程的 `resolve` hook 拦截所有子模块的相对路径 import，自动注入版本号穿透 ESM 缓存。
-   **开发规范**: App 内部直接使用标准的静态 `import` 即可，无需任何 `?t=` 或其他缓存穿透 hack。改了任意子模块文件，loader hook 会自动让整个依赖链重载。
-   **前端热重载**: `appManager` 推送的 `frontendUrl` 同样带有时间戳，确保浏览器加载最新的 `frontend.js`。
-   **子模块缓存穿透**: 浏览器会缓存 ESM 的 `import` 请求。为了确保 `frontend.js` 内部 `import` 的子组件也能同步更新，系统后端通过 `/api/apps/:type/frontend.js` 路由对代码进行了动态重写，会自动为内部引用的子模块路径补全时间戳 (`?t=...`)。开发者无需手动处理子模块的缓存问题。

### 2.2 依赖注入 (Dependency Injection)
-   **痛点解决**: 避免因后端 API 路由 (`/api/apps/...`) 导致的相对路径引用失效 (`import` 403 错误)。
-   **规范**: Frontend 组件**严禁** import 跨出 app 目录的文件。
-   **实现**: 所有公共模块 (`m`, `Notice`, `ioSocket`, `commonData`, `settingData`, `Box`, `iconPark`, `getColor`, `trs`) 均由 `ioSocket.js` 在实例化组件时通过参数注入。

### 2.3 国际化与翻译 (I18n)
- **翻译函数**: 系统注入 `trs(key, inlineDict)` 函数。
- **推荐用法 (内联翻译)**: 为了保证 App 的自包含性，建议使用内联翻译模式，直接在代码中定义中英文。
  ```javascript
  trs("时光机/侧边栏/历史版本", { cn: "历史版本", en: "History" })
  ```
- **工作原理**: `trs` 会优先查找 `inlineDict` 中对应当前语言 (`global_language`) 的值。如果未找到，则尝试匹配系统全局字典。
- **规范**: 严禁在 UI 中使用硬编码中文，必须全部通过 `trs` 包装。

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
      if (callback) callback({ ok: false, msg: "未找到运行中的 App 实例" })
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
      if (callback) callback({ ok: true, msg: "操作成功" })
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
      return { ok: true , msg: "消息" ,data:"xxx"}
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

常规Notice使用范例：
```javascript:
Notice.launch({
  tip:"我是标题", //可以省略，默认为【提示】
  msg:"我是消息",
  confirm:(){
    return undefined //确认回调函数，返回undefined关闭窗口
  },
  calcel:(){
    //取消回调函数，同confirm返回undefined关闭窗口，或整个函数留空
    //js函数默认返回值为undefined
  }
})
```



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

---

## 6. 前端代码风格与模块化指南

为了保持代码的高度可读性、一致性以及与系统架构的完美契合，所有 App 前端开发必须遵循以下准则：

交代：
> 1不使用任何cssClass，使用行内style，不写任何css类名。 2所有的对象都要换行 3mithril的第一个参数如果是div，应该简写成空字符串。3如果一个前端事件处理函数没有被复用，应该直接写在事件里面，而不应该外置
> 减少临时变量和中间变量的使用。直接使用嵌入式写法。例如，let a = 12 ; let b = 5; let c = a+b;console.log(c)这还是错误的写的，你应该直接console.log(a+b)
> 前端组件注意：1 每个模块必须是合法的mitrhil函数组件，不能仿照入口点frontend.js的写法。参数传递使用mithril的组件传参方式传递 所有尺寸单位统一使用rem 1rem 约等于 10px
> 所有的异步处理必须用try catch包裹并输出错误，不能省略任何错误的输出

### 6.1 极致垂直化格式 (Vertical Formatting)
- **对象属性换行**：对象（尤其是 `style` 和配置对象）的每一个属性必须独占一行。
- **函数参数换行**：`m()` 函数的参数（tag, attrs, children）必须独占一行。
- **示例**：
  ```javascript
  m("",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "20px"
      }
    },
    [ ... ]
  )
  ```

### 6.2 零 CSS 类名原则 (Zero CSS Class)
- **严禁使用** `class` 或 `cssClass`。
- **必须使用** 行内样式 (`style`)。这确保了组件的样式完全自包含，不依赖外部 CSS 文件。
- **颜色调用**：统一使用注入的 `getColor(name).back/front` 来获取主题颜色。
其中同一个颜色下，back为背景色,front为背景色对应的文字色/前景色。
- **字体和字号** 不要指定任何字体，通常不需要指定字号，特殊内容可以少量指定字号

### 6.3 嵌入式写法 (Inline Expressions)
- **减少中间变量**：避免定义只使用一次的临时变量。
- **逻辑直接嵌入**：将逻辑判断、字符串拼接、数组映射直接写在 `m()` 的参数中。
- **示例**：
  - ❌ `let isDir = name.endsWith('/'); m("", isDir ? "📁" : "📄")`
  - ✅ `m("", name.endsWith('/') ? "📁" : "📄")`

### 6.4 语义化简写
- **Mithril 简写**：当第一个参数是 `div` 时，必须简写为空字符串 `m("", ...)`。

### 6.5 模块化与依赖注入
- **目录规范**：大型 App 建议将组件拆分到 `frontendModules/` 目录。
- **依赖传递**：子模块**严禁**直接 `import` 宿主系统的公共组件（如 `Box`, `Notice`）。前端是动态导入的，无法import主系统模块。
- **参数注入**：所有主系统的工具（`Box`, `Notice`, `m`, `getColor` 等主系统模块）必须通过父模块的参数逐层传递。
- **引用规范**：在 `frontend.js` 中 `import` 内部模块时，必须带上 `.js` 后缀。

### 6.6 事件处理内联化
- **非复用函数内联**：如果事件处理函数（如 `onclick`）不需要在多个地方复用，应直接写在属性对象中，不要提取到外部。


异步调用返回统一
接口规范已经更新，按如下规范
【重要】旧版规范兼容参考appDispatch.js（不再推荐使用）


```javascript:
try{
  let tmp = await fn()
  return {
    ok:true,
    msg:"操作xxx成功", //必须带msg对象
    data:tmp.xxx
  }
}
catch(err){
  throw err //如果是工具函数在内部抛出错误
  console.log(err) //如果是最外层函数，输出错误，不再向外抛出

  return {
    ok:false
    msg:"服务器内部错误（或具体错误信息）" //必须带msg对象
    //错误不需要data字段

  }
}
```

Box万能组件使用范例，使用前务必先阅读box源码
```javascript:
m(Box,{
  color:"" //使用getColor里定义的颜色值
  tagName:"input[type=text]", //可以省略整个属性，但是可以通过这个属性调整成表单，如果是表单，建议先let FormInput = new Box()，然后m(FormInput)
  //注意阅读box源码，文本框等表单内部可以绑定数据到data.value，使用formInput.data.value可以获取表单的输入数据，无需再次绑定
  //也可以覆盖表单事件来直接绑定外部变量（不用内部的data.value）
  //Box还支持结合data.value和isSwitch属性让它变成一个按钮
  style:{
    //style注入覆盖 注意box默认有自带一大堆样式
  },
  ext:{
    onclick(){}//事件注入
  }
  onclick(){}//外部也有一个onclick是包装过的，可以用，但是和原生onclick不一样，需要看源代码，懒得写ext可以优先用这个，但是不推荐
},"我是内容")
```
Tag是box的派生组件用法稍有不同，也建议阅读源代码
```javascript:
m(Tag,{
  styleExt:{
    //使用styleExt覆盖样式
  },
  ext:{
    //依旧使用ext覆盖事件
  }
},"我是标签")
```
