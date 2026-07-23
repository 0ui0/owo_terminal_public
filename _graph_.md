# 调查网点图记录

## 2026/07/25: 
## 2026/07/24 04:50 - 为什么属性面板中纯填充(pureFill)的X/Y坐标无法输入数字？

```mermaid
graph TD
    A[现象: 选中 pureFill 时, X/Y 文本框按键盘数字没反应/输不进去] --> B{核心机制: Mithril 单向受控组件与同步状态刷写}
    B --> C[用户敲击按键 -> 触发 oninput 并获取 e.target.value]
    C --> D[执行 element.translate 和 element.update]
    D --> E[element.update 冒泡触发 FillGroup.update]
    E --> F[recreateElements 用未发生位移的原始线条克隆覆盖 PureFill]
    F --> G[结果: PureFill 内部克隆线条坐标回滚为原状]
    G --> H[虚拟 DOM 重绘: curX 重新算出仍为旧坐标值]
    H --> I[框架检测真实 DOM 值与虚拟 DOM 值不一致 -> 同步强制刷回原值]
    I -.-> J(结论1: 键盘输入的数值被瞬间复原, 产生输入不进去的现象)
    
    K[对比: 拖拽工具 cursorTool 能否平移 pureFill?] --> L[拖拽期间只 translate 不 update]
    L --> M[拖拽结束 pointerup 时执行 fillGroup.break 解散填充组]
    M -.-> N(结论2: 拖拽由于解散了填充组, 从而切断了回滚链条并保留了坐标)
    
    J & N --> O[解决方案: 在 propPanel 的 oninput 里平移 pureFill 前主动 break 解散填充组]
```

## 2026/07/24 05:08 - 新增滴管与橡皮擦工具的命中判定与限制

```mermaid
graph TD
    A[需求: 新增滴管工具与橡皮擦工具] --> B{命中判定约束: 完全参考 cursor 事件}
    B --> C[使用 getClosedLine 寻找接触线段]
    B --> D[使用 isPointInRegion 寻找点中填充区]
    B --> E[使用 getBoundingBox 判定文本碰撞]
    
    C & D & E --> F{隔离与冒泡限制}
    F --> G[滴管: 抛弃矢量几何碰撞检测, 改用原生 EyeDropper API]
    G --> H[像素级吸色: 获得 sRGBHex 直接调用 setRecentUseColor, 不覆盖 fg/bgColor]
    
    F --> I[橡皮擦限制: 只能编辑当前组的非组元素且不能删除组]
    I --> J[过滤: parentGroup == data.presentGroup 且 type != group]
    J --> K[删除方式: 仅对符合过滤的图元执行 data.elPaper.removeAndClear]
```

## 2026/07/20 17:40 - 为什么只有 TouchEvent 能让你在嵌套中写出缩放算法？

```mermaid
graph TD
    A[核心事实修正: gameEditor 确实在嵌套里写了双指 Pinch-Zoom 缩放算法!] --> B{目标: 解释为什么同样的嵌套缩放，在那边能跑通，在这边写不出来}
    
    B --> C[你那边的核心武器: TouchEvent API 的降维打击]
    C --> D[你在 rightOncreate.coffee 第 72 行用嵌套写出了 Math.sqrt]
    D --> E[关键在于: TouchEvent 的事件对象里，自带了 e.touches 数组]
    E --> F[当你触发任何一个 touchmove 时，浏览器会把当前屏幕上**所有的**手指坐标打包在这个数组里全交给你]
    F --> G[哪怕你处于一个为手指 A 注册的局部闭包里，只要 e.touches.length==2]
    G --> H[你可以瞬间摸到 e.touches[0] 和 e.touches[1]，算完距离万事大吉]
    H -.-> I(结论1: 你的嵌套能写缩放，全拜 e.touches 这个原生的'共享数据池'所赐)
    
    B --> J[当前 svgEditor 的困境: PointerEvent API 的相互隔离]
    J --> K[PointerEvent 规范要求：每根手指都是一个独立的指针实体]
    K --> L[这意味着每次触发 pointermove，事件对象 e 里面只有**这某一根手指**的数据]
    L --> M[如果你继续用嵌套，手指 A 拿不到手指 B 的数据，就像两个人在不同的房间打电话却不知道对方号码]
    M --> N[所以，要算距离，必须在外面手动搭建一个 activePointersMap (电话薄)]
    N --> O[有了 Map，大家就不能窝在各自的嵌套孤岛里，必须跑到外面的'广场' (平铺的 pointermove) 上去报备位置]
    O -.-> P(终极定论: PointerEvent 强制独立并发，想要跨指针算数学，就只能放弃嵌套闭包，回归平铺 Map)
```
