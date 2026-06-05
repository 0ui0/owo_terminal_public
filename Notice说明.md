# 📦 owo_terminal Notice 模块使用说明书

在 `owo_terminal` 架构中，`Notice` 模块不仅用于普通的全局文本提示，它本质上是前端系统的**窗口管理器（Window Manager）**。它负责承载、定位、缩放以及调度所有的外部 App（如资源管理器、时光机）、终端窗口（ChatTerm）和子智能体窗口（AgentWindow）。

---

## 🚀 核心用法与快速启动

在前端代码中，只需导入 `Notice` 并调用 `Notice.launch(config)` 即可拉起一个弹窗或应用窗口。

### 1. 最简文本提示（非阻塞通知）
如果只需要弹出一个普通的文本消息：
```javascript
Notice.launch({
  msg: "操作已成功完成！"
});
```

### 2. 拉起一个自定义组件窗口
如果你写了一个 Mithril 组件（例如叫 `MyForm`），想要在弹窗中渲染它：
```javascript
Notice.launch({
  sign: "my_form_window", // 唯一标识符，防重复弹出
  tip: "填写表单",         // 窗口标题
  content: MyForm,        // 传入组件类
  contentAttrs: { userId: 123 } // 传给组件的初始化属性
});
```

---

## 📐 窗口尺寸与定位自适应（最佳实践）

在调用 `Notice.launch` 时，**强烈建议不要默认传递固定的窗口尺寸与坐标**，除非你有像“记住上次窗口位置”这样明确的业务需求。

### 💡 为什么？
- **自动居中**：如果你不传递 `x, y, width, height`（或将其全部设为 `0`），NoticeBox 会自动将 CSS 设置为 `left: 50%`, `top: 50%`, `transform: translate(-50%, -50%)`，使窗口在屏幕正中央完美居中。
- **内容自适应**：此时，窗口的宽高表现为 `auto`，它会根据你传入的 `content` 组件内部的内容自动撑开，并天然适配移动端与不同尺寸的显示器。
- **屏幕保护限制**：自适应窗口自带 `maxWidth: "95vw"` 和 `maxHeight: "95vh"` 限制，能保证内容在任何分辨率下都不会溢出屏幕边缘。

---

## 🎛️ 三大系统操作按钮的掌控

Notice 窗体的标题栏右侧配有三个经典的胶囊操作按钮：**确认（Check）**、**取消/关闭（Close）** 和 **最小化（Minus）**。

### 1. 按钮显示与隐藏状态机 (`hideBtn` / `useMinus`)
你可以通过传递 `hideBtn` 和 `useMinus` 来精确控制这三个按钮的可见性：

| 配置项值 | 确认按钮（粉色 Check） | 取消/关闭按钮（灰色 Close） | 最小化按钮（紫色 Minus） |
| :--- | :---: | :---: | :---: |
| **`hideBtn: 0` (默认)** |  显示 |  显示 | 由 `useMinus` 控制 |
| **`hideBtn: 1`** | 🚫 隐藏 | 🚫 隐藏 | 由 `useMinus` 控制 |
| **`hideBtn: 2`** | 🚫 隐藏 |  显示 | 由 `useMinus` 控制 |
| **`hideBtn: 3`** |  显示 | 🚫 隐藏 | 由 `useMinus` 控制 |
| **`useMinus: false`** | 正常 | 正常 | 🚫 隐藏 |

### 2. 💡 核心关闭逻辑黄金法则（返回值与回调联动）
在 `confirm` 或 `cancel` 事件处理函数中，窗口的关闭与拦截受返回值的控制：

- **不关闭窗口（拦截）**：如果你想拦截关闭动作（让窗口保持打开），**必须让事件函数返回 `true`**。
- **要关闭窗口**：
  - **在 JavaScript 中**：默认情况下，只要不写 `return`（执行完毕默认隐式返回 `undefined`），或者你手动执行了 `closeTabFn()` 后不返回任何值，系统都会判定自动关闭，**无需返回任何内容**。
  - **⚡ 针对 CoffeeScript 的防坑安全原则（重点）**：
    在 CoffeeScript 中编写回调时，因为 CoffeeScript 会**自动将最后一行的执行结果隐式作为返回值返回**。如果你在最后一行写了 `closeTabFn()` 或是变量赋值，一旦这个表达式返回了一个非 `undefined` 的值，就会意外触发 Notice 的拦截机制导致窗口关不掉！
    因此，**在 CoffeeScript 回调中，如果要关闭窗口，必须在最后一行显式地加上 `undefined` 或 `return`（编译为 `return;`）**，以防最后一行表达式的隐式返回值污染关闭判断：
    ```coffeescript
    cancel: (box, closeTabFn) =>
      closeTabFn()
      undefined # 💡 显式写 undefined，阻断 CoffeeScript 的自动返回机制，确保关闭
    ```

---

#### 🟢 确认按钮事件 (`confirm`) 示例
```javascript
Notice.launch({
  confirmWords: "提交并关闭", 
  // 💡 参数说明：box (DOM), closeTabFn (关闭事件回调), tabData (Tab数据), event (原生事件)
  confirm: async (box, closeTabFn, tabData, event) => {
    const isFormValid = checkFormValidity();
    
    if (!isFormValid) {
      Notice.launch({ msg: "表单校验失败！" });
      return true; // 💡 返回 true 拦截系统默认的立即关闭行为
    }
    
    await submitDataToServer();
    
    closeTabFn(); // 💡 校验通过并提交后，手动调用传入的关闭事件
    // 💡 确定关闭，不需要 return（或写 return undefined）
  }
});
```

#### 🔴 取消/关闭按钮事件 (`cancel`) 示例（异步 Notice 确认拦截）
```javascript
Notice.launch({
  cancelWords: "关闭",
  cancel: async (box, closeTabFn, tabData, event) => {
    if (hasUnsavedChanges()) {
      // 💡 异步弹出 Notice 询问框，以防阻碍整体 UI 主题风格
      Notice.launch({
        tip: "警告",
        msg: "有未保存的修改，确定要丢弃并退出吗？",
        confirm: async () => {
          // 用户在子弹窗中确认了，则手动调用关闭回调销毁 Tab
          closeTabFn();
        }
      });
      // 💡 核心：返回 true，阻止当前叉号的默认关闭行为，等待用户在子弹窗操作
      return true; 
    }
    // 没有未保存修改，不写 return（即返回 undefined）默认自动关闭
  }
});
```

#### 🟣 最小化按钮事件
点击最小化会触发系统默认行为，将窗体移出视口。无法直接拦截其行为，但你可以通过 `onWindowUpdate(winState)` 回调来感知到 `winState.minimized` 变为 `true` 的状态。

---

## ⚠️ 系统 App 窗口的生命周期与框架自动托管说明

当 Notice 承载一个系统级 App（如资源管理器、时光机等）时，点击关闭窗口如果只销毁前端 Tab，后端的 Node.js 实例进程就会残留成为僵尸进程。

### 🛡️ 系统框架的自动托管机制（开发 App 无需手动编写）
在 owo_terminal 中，**你作为应用开发者编写 App 组件时，完全不需要在组件中手动去调用 `Notice.launch`，也无需自己从头编写后端清理逻辑**！

因为在 `ioSocket.js` 的 `app:launch` 监听中，系统底层在拉起 Notice 时已经自动接管了该配置，默认将 `hideBtn` 设为 `2`（只显示灰色叉号关闭按钮，隐藏粉色对勾确认按钮），并且**同时在 `cancel` 和 `confirm` 中硬编码了 RPC 清理后端应用实例的代码**：

```javascript
// 💡 系统底层在拉起 App 窗口时，已经自动应用了如下防护性逻辑
const dt = {
  sign: app.appId,
  hideBtn: 2, // 默认隐藏对勾按钮，仅显叉号关闭按钮
  
  cancel: async (dom, closeNative) => {
    // 自动发起 RPC 通信销毁后端对应的 Node.js 应用实例进程
    await settingData.fnCall("appClose", [msg.appId])
    closeNative() // 前端销毁 Tab
  },
  
  confirm: async (dom, closeNative) => {
    // 备用防护：万一开发者开启了确认按钮，点击确认也会执行相同的后端清理，杜绝僵尸进程
    await settingData.fnCall("appClose", [msg.appId])
    closeNative()
  },
  // ...
};
Notice.launch(dt);
```

---

### 🛠️ 高级扩展：通过“动态补丁劫持”深度定制 App 窗口属性
虽然系统在 `ioSocket.js` 中默认应用了上述防线，但**如果你开发的一个特定 App 确实需要“确认对勾”按钮，或者需要临时调整/覆盖窗口的尺寸、标题和按钮点击逻辑呢？**

由于 JavaScript 的对象是**引用传递**，你可以在你 App 组件的初始化周期（`oninit` / `oncreate`）中，**直接修改或覆盖 `vnode.attrs.noticeConfig` 上的任意属性**！这种动态“补丁劫持”技术可以让你在窗口被渲染出来之前，以极低的成本夺回对 Notice 窗体的控制权。

#### 💡 场景示例：恢复某 App 的“确认对勾”按钮并绑定保存与关闭拦截
```javascript
export default function ({ appId, m, Notice, ioSocket, comData }) {
  let isDirty = true; // 模拟未保存的数据状态

  return {
    oninit(vnode) {
      // 1. 获取系统为当前 Tab 生成 the 配置对象引用
      const config = vnode.attrs.noticeConfig;
      
      if (config) {
        // 2. 将 hideBtn 从默认的 2 修改为 0，让确认和取消按钮同时显示出来
        config.hideBtn = 0; 
        
        // 3. 备份系统原有的 confirm 清理逻辑
        const originalConfirm = config.confirm;
        
        // 4. 重载 confirm 回调，加入 App 自己的表单检查或数据保存逻辑
        config.confirm = async (dom, closeFn, tabData, event) => {
          const isSaveSuccess = await saveAppDataToServer();
          
          if (!isSaveSuccess) {
            Notice.launch({ msg: "数据保存失败，无法提交窗口！" });
            return true; // 💡 不关闭窗口，返回 true 阻断关闭
          }
          
          // 5. 校验并保存成功后，执行系统原有的 confirm（物理清理后端 + 销毁前端 Tab）
          if (originalConfirm) {
            await originalConfirm(dom, closeFn, tabData, event);
          } else {
            closeFn();
          }
        };
      }
    },
    view(vnode) {
      return m("div", "这是支持保存校验并显示的 App 组件内容...");
    }
  };
}
```

通过这种设计，你无需去改动底层的 `ioSocket.js` 文件，便能在 App 内**动态地对窗口的任意操作参数进行高度定制**（如修改 `confirmWords` 自定义文案、关闭最小化 `useMinus` 或动态重载窗口尺寸）。

---

### 💡 什么时候你需要自己注意后端联动清理？
只有当你是在**自己编写的组件内部**，为了实现某些特殊的长连接辅助功能而**手动调用 `Notice.launch` 弹出自定义窗体**时，如果这个子窗体跟后端的某种临时 Socket/进程生命周期绑定，你才需要模仿系统底层的做法，在 `cancel`/`confirm` 事件中显式调用 RPC 请求以通知后端释放资源，并在执行 `closeTabFn()` 后返回非 `undefined` 值以防止默认的二次关闭。

---

## 📝 完整参数字典 (`Notice.launch(config)`)

在调用时传入的配置对象 `config` 支持的所有字段如下：

| 参数名称 | 数据类型 | 默认值 | 描述说明 |
| :--- | :--- | :--- | :--- |
| `sign` | `String` | 随机 ID | 唯一标识符。相同 `sign` 的窗口若已存在，则会直接将其激活置顶，防重复创建。 |
| `group` | `String` | `undefined` | 窗口分组名。传入后，同组的 Tab 会被自动合并到同一个多标签窗口中展示。 |
| `newWindow` | `Boolean` | `false` | 是否强制在新窗口中打开（即使指定了 `group`）。 |
| `tip` | `String` | `"提示"` | 窗口顶部标题（在多标签下会作为 Tab 栏的标签文字）。 |
| `msg` | `String` | `undefined` | 简易通知文本。在未提供 `content` 组件时，会自动使用 `Box` 组件来呈现该文字。 |
| `content` | `Component` | `undefined` | Mithril 组件。窗口内容区渲染的主体内容。 |
| `contentAttrs` | `Object` | `undefined` | 传递给 `content` 组件的额外属性（会通过 `vnode.attrs` 注入）。 |
| `win` | `Object` | `undefined` | 窗口初始位置和尺寸 `{ x, y, width, height }`。默认不传以启用自动居中和尺寸自适应。 |
| `minimized` | `Boolean` | `false` | 初始化时是否默认最小化。 |
| `hideBtn` | `Number` | `0` | 控制三大按钮中“确认”和“取消”按钮的可见性（`0`双显，`1`双隐，`2`仅显取消，`3`仅显确认）。 |
| `useMinus` | `Boolean` | `true` | 是否显示窗口最小化按钮。 |
| `confirmWords` | `String` | 对勾图标 | 确认按钮的自定义文本或 HTML。 |
| `confirm` | `Function` | `undefined` | 确认回调 `async (box, closeTabFn, tabData, event)`。返回 `undefined` 自动关闭。 |
| `cancelWords` | `String` | 叉号图标 | 取消按钮的自定义文本。 |
| `cancel` | `Function` | `undefined` | 取消回调 `async (box, closeTabFn, tabData, event)`。返回 `undefined` 自动关闭。 |
| `headerButtons` | `Array` | `[]` | 数组。允许在标题栏自定义额外按钮，格式如：`[{ icon: "⚓", color: "#555", onclick: () => {} }]`。 |
| `onWindowUpdate` | `Function` | `undefined` | 窗口位置、尺寸或最小化状态改变时的回调函数，常用于通知后端同步或保存当前窗口状态。 |

---

## 📖 附录：Notice 模块源码架构与技术内幕

对于希望深入了解 Notice 模块内部运作的开发者，可以阅读此附录。这里详细拆解了 `notice.js` 和 `noticeBox.js` 内部的核心技术实现细节。

---

### 1. 绝对物理稳定渲染机制 (`stablePhysicalTabs`) 的具体原理

#### 💡 Mithril 默认的生命周期特性
在 Mithril 等声明式 MVVM 框架中，当我们切换多标签页时，常规写法通常是：
```javascript
isActive ? m(ContentComp) : null
```
在这种模式下，一旦 Tab 切换，未激活 Tab 组件就会被 Mithril 彻底销毁，物理 DOM 节点会从 DOM 树中被移出（触发 `onremove` 生命周期）。

#### ⚠️ 状态丢失的致命代价
在 `owo_terminal` 这样的开发工具中，Tab 中经常承载着：
- 基于 `xterm.js` 且绑定了后端物理伪终端（Pty）进程通信通道的终端窗口（`ChatTerm`）；
- 远程加载了特定 URL 的 `webview` / `iframe` 容器。

一旦包裹它们的 DOM 节点从浏览器的 DOM 树上拔除，浏览器内核就会**立刻中止底层的 TCP 连接、丢弃当前终端的历史缓冲区，并在切回时强制触发页面重新连接与重载刷新**，这严重摧毁了多任务操作的体验。

#### 🛡️ 固化物理 DOM 队列的实现方案
为了保证 DOM 的绝对稳定，`noticeBox.js` 在组件闭包中设计了一个固化物理队列 `stablePhysicalTabs`：
1. **对比同步**：每次 `view` 方法执行时，系统首先将最新传入的 `realTabs`（可能由于添加或关闭 Tab 发生变化）与闭包内的 `stablePhysicalTabs` 做差集对比：**物理删除已被关闭的 Tab 元素，在队列尾部追加新拉起的 Tab，但对处于中间的存量 Tab 不进行任何重排或位置变动**。
2. **`display: none` 视觉隐藏**：在内容渲染区，使用 `stablePhysicalTabs.map` 进行物理平铺，仅对非激活 Tab 施加 `display: "none"` 的 CSS 规则：
   ```javascript
   stablePhysicalTabs.map(tab => {
     const isActive = tab.sign === win.activeSign;
     return m("div", {
       key: tab.sign, // 💡 使用 tab.sign 确保 Mithril 对 DOM 实例的 Key 追踪
       style: {
         display: isActive ? "flex" : "none", // 仅隐藏，不销毁 DOM
         width: "100%", height: "100%"
       }
     }, [
       m(ContentComp, { noticeConfig: tab, ...tab.contentAttrs })
     ]);
   })
   ```
3. **收益**：未激活的组件虽然在屏幕上隐形了，但其物理 DOM 树依然健在。底层 Websocket 连接、终端缓存和 iframe 页面状态在切换时**完全保留，实现 0 延迟无感切回**。

---

### 2. 窗口拖拽与 8 方向拉伸的具体实现原理

#### 📐 尺寸和位置的“物理固化” (`materialize`)
Notice 窗口在冷启动时，默认处于 `width: 0, height: 0` 的自适应居中模式（由 CSS flex 和内在尺寸撑开）。但窗口的移动和边缘拉伸运算必须运行在具体的物理像素坐标上。
- 当用户将指针按在标题栏或拉伸热区（触发 `onpointerdown`）时，系统第一步会立刻调用 `materialize(rootDom, win)`：
  ```javascript
  const rect = dom.getBoundingClientRect();
  win.width = rect.width;
  win.height = rect.height;
  win.x = rect.left;
  win.y = rect.top;
  ```
- 将窗口状态从 `auto` 固化为绝对像素数值，确保后续的位置偏移计算有精准的基准点。

#### 🎯 指针捕获 (`Pointer Capture`)
为了防止鼠标拖拽移动过快时指针意外移出标题栏或边缘热区，导致拖拽中断，Notice 在 `pointerdown` 时会执行：
```javascript
target.setPointerCapture(e.pointerId);
```
将当前指针的所有后续运动帧完全重定向锁定到该热区元素上，直至 `pointerup` 时释放，保障了极佳的移动响应性。

#### 🧭 8 方向边缘解析与坐标平移
在非最大化状态下，NoticeBox 在窗体周围绝对定位了 8 个隐藏的边框热区。拖拽时，系统根据热区标识（`n`北, `s`南, `e`东, `w`西等）来计算 `dx` (鼠标水平位移) 和 `dy` (鼠标垂直位移)：
- **东（e）/ 南（s）边缘拉伸**：操作最直观，直接向右或向下增加宽高度即可：
  ```javascript
  win.width = Math.max(minW, startW + dx);
  win.height = Math.max(minH, startH + dy);
  ```
- **西（w）/ 北（n）边缘拉伸**：拉伸西/北边缘时，**不仅窗口尺寸会改变，窗口的左上角起点坐标 `x` / `y` 也必须同等幅度反向平移**，否则窗口会在屏幕上发生相反方向的飘移：
  ```javascript
  const newW = Math.max(minW, startW - dx);
  win.width = newW;
  win.x = startWinX + (startW - newW); // 补偿平移差值
  ```

---

### 3. 多 Tab 拖拽重排与平滑过渡算法

#### 📸 中点快照与 Transform 补偿
当按下某个 Tab 准备进行拖拽时，需要计算它与周围其他 Tab 的物理距离关系：
1. **中点快照收集**：遍历所有 Tab 标签 DOM，计算它们的水平中心点 X 坐标并存入 `physicalMidPoints`。
2. **清除 Transform 噪音**：由于周围 Tab 可能在前几次拖拽中已经发生了 `transform` 位移，直接读取 `getBoundingClientRect().left` 会包含位移偏差。系统利用 `window.getComputedStyle(child)` 读取其 `matrix`：
   ```javascript
   const matrix = new WebKitCSSMatrix(style.transform);
   const currentTx = matrix.m41; // 获取当前的 X 轴 transform 偏移量
   const rawLeft = rect.left - currentTx; // 还原纯净的布局位置
   ```
   通过把偏差扣除，最终获取到一组不受影响的、物理绝对位置上的参考中点列表。

#### 🧮 实时 Slot 槽位换算与平移过渡
- 在拖拽的 `pointermove` 中，获取当前鼠标的 X 坐标并与 `physicalMidPoints` 作比较，换算出当前鼠标正悬停在第几个插槽（Slot）上，生成视觉重排后的临时队列 `visualTabs`。
- 对于那些物理索引与视觉索引不一致的 Tab，系统读取它们在目标位置与原始物理位置的 DOM layout 差值，施加 CSS translate 物理过渡：
  ```javascript
  // 物理 Tab 左右交换空位的平滑过渡
  translateX = targetChild.offsetLeft - currentChild.offsetLeft;
  target.style.transform = `translate3d(${translateX}px, 0, 0)`;
  target.style.transition = "transform 0.2s cubic-bezier(0.2, 0, 0, 1)";
  ```
- **物理重排提交**：当抬起指针时，清除所有的 `transform` 和 `transition` 临时样式，调用 `onSetTabOrder` 将最终计算出来的 Tab `sign` 排序数组写入 `Notice` 的状态队列（改变 `data.dataArr` 数组顺序）。由于指定了 Mithril 的 `key`，Mithril 在 `redraw` 时会以最小的 DOM操作代价改变 DOM 节点的物理位置，完成从视觉平移动画到物理 DOM 顺序一致性的闭环过渡。
