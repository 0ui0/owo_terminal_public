UI 主题化重塑计划 (V17)
本计划旨在通过 getColor 钩子系统实现全站 UI 的主题化切换。支持欧式棕（默认 0）、明亮黄（1）、经典蓝白（2）三套方案。严格遵守"仅改颜色、不动布局、不碰 App 内部"原则，并采用纯色名映射架构。

## 用户审核项 (User Review Required)

> **IMPORTANT**
>
> **纯色名架构原则：**
>
> - `colorObj.js`：仅包含基准色名。除了 `main` 之外，所有 Key 必须是颜色描述名（如 `gray_1`, `pink_1`, `brown_1`）。严禁出现 `NoticeHeader`, `NoticeBody` 等语义化名称。
> - `getColor.js`：主题路由引擎。在 Theme 0 下直接返回 colorObj 的对应色名；在 Theme 1/2 下，针对同一色名返回覆盖后的主题 HEX。
> - 组件调用：外壳组件将使用 Theme 0 的色名发起调用，如 `getColor('gray_1')`。
> - 无损替换：仅执行 HEX -> getColor 替换，布局参数保持 1:1 绝对静止。

---

## 一、现状分析

### 1.1 已完成的基础设施

| 文件 | 状态 | 说明 |
|------|------|------|
| `server/db/init/defaultOptions.js` | ✅ 已添加 | `global_themeColor` 字段，值 0/1/2 |
| `www/src/view/common/commonData.js` | ✅ 已添加 | `themeColor: 0` |
| `www/src/view/common/getColor.js` | 🔧 框架已有 | 需扩展主题路由逻辑 |
| `www/src/view/common/colorObj.js` | 🔧 框架已有 | 需重建纯净色表 |

### 1.2 参考项目配色方案 (www.o-o.space)

| 主题 ID | 名称 | 主色 back | 主色 front | 特点 |
|---------|------|-----------|------------|------|
| 0 | 欧式棕 | `#755d5c` | `#333333` | 当前默认，温暖棕调 |
| 1 | 明亮黄 | `#ffdb66` | `#5f4905` | 活力黄色，深棕文字 |
| 2 | 经典蓝白 | `#53A6FF` | `#ffffff` | 清爽蓝色，白色文字 |

---

## 二、拟定变更 (Proposed Changes)

### 2.1 色彩核心 (Color Core)

#### [MODIFY] `colorObj.js` - 建立纯净色表 (Theme 0 基准)

```javascript
export default {
  main: { back: "#755d5c", front: "#333333" },

  pink_1: { back: "#a75e5e", front: "#463838" },
  pink_2: { back: "#5e4a5e", front: "#eee" },

  gray_1: { back: "#393432", front: "#eee" },
  gray_2: { back: "#636363", front: "#333333" },
  gray_3: { back: "#2d2d2d", front: "#eee" },
  gray_4: { back: "#47464f", front: "#999" },
  gray_5: { back: "#4f4f5a", front: "#eee" },
  gray_6: { back: "#333333", front: "#333333" },
  gray_7: { back: "#999", front: "#999" },
  gray_8: { back: "#eee", front: "#eee" },
  gray_9: { back: "#111", front: "#111" },
  gray_10: { back: "#555", front: "#555" },
  gray_11: { back: "#333", front: "#333" },

  brown_1: { back: "#332f2c", front: "#eee" },
  brown_2: { back: "#5e5653", front: "#eee" },
  brown_3: { back: "#47413c", front: "#eee" },
  brown_4: { back: "#393431", front: "#eee" },

  purple_1: { back: "#6c6379", front: "#333333" },
  purple_2: { back: "#6c607a", front: "#111" },

  yellow_1: { back: "#7c5d01", front: "#eee" },
  yellow_2: { back: "#7b5d00", front: "#eee" },

  blue_1: { back: "#5e6c79", front: "#eee" },
  blue_2: { back: "#374e79", front: "#eee" },

  green_1: { back: "#50815b", front: "#eee" },
}
```

#### [MODIFY] `getColor.js` - 主题路由引擎

```javascript
import colorObj from "./colorObj"
import commonData from "./commonData"

export default function (colorStr) {
  const themeId = commonData.themeColor || 0

  if (themeId === 0) {
    return colorObj[colorStr] || colorObj.main
  }

  if (themeId === 1) {
    const themeOverrides = {
      main: { back: "#ffdb66", front: "#5f4905" },
      pink_1: { back: "#ffc83c", front: "#5f4905" },
      pink_2: { back: "#ffdb66", front: "#5f4905" },
      gray_1: { back: "#3d3a35", front: "#eee" },
      gray_2: { back: "#8a7a5a", front: "#333" },
      gray_3: { back: "#4a4538", front: "#eee" },
      gray_4: { back: "#5a5548", front: "#999" },
      brown_1: { back: "#3d3a35", front: "#eee" },
      brown_2: { back: "#5a5548", front: "#eee" },
      brown_3: { back: "#4a4538", front: "#eee" },
      brown_4: { back: "#3d3a35", front: "#eee" },
      purple_1: { back: "#8a7a5a", front: "#333" },
      purple_2: { back: "#7a6a4a", front: "#111" },
      yellow_1: { back: "#ffdb66", front: "#5f4905" },
      yellow_2: { back: "#ffc83c", front: "#5f4905" },
      blue_1: { back: "#8a7a5a", front: "#eee" },
      blue_2: { back: "#6a5a3a", front: "#eee" },
      green_1: { back: "#7a8a5a", front: "#eee" },
    }
    return themeOverrides[colorStr] || colorObj[colorStr] || colorObj.main
  }

  if (themeId === 2) {
    const themeOverrides = {
      main: { back: "#53A6FF", front: "#ffffff" },
      pink_1: { back: "#53A6FF", front: "#ffffff" },
      pink_2: { back: "#53A6FF", front: "#ffffff" },
      gray_1: { back: "#2a3a4a", front: "#eee" },
      gray_2: { back: "#5a6a7a", front: "#333" },
      gray_3: { back: "#3a4a5a", front: "#eee" },
      gray_4: { back: "#4a5a6a", front: "#999" },
      brown_1: { back: "#2a3a4a", front: "#eee" },
      brown_2: { back: "#4a5a6a", front: "#eee" },
      brown_3: { back: "#3a4a5a", front: "#eee" },
      brown_4: { back: "#2a3a4a", front: "#eee" },
      purple_1: { back: "#5a6a7a", front: "#333" },
      purple_2: { back: "#4a5a6a", front: "#111" },
      yellow_1: { back: "#53A6FF", front: "#ffffff" },
      yellow_2: { back: "#4a9aee", front: "#ffffff" },
      blue_1: { back: "#53A6FF", front: "#ffffff" },
      blue_2: { back: "#3a6a9a", front: "#eee" },
      green_1: { back: "#5a9a7a", front: "#eee" },
    }
    return themeOverrides[colorStr] || colorObj[colorStr] || colorObj.main
  }

  return colorObj[colorStr] || colorObj.main
}
```

---

### 2.2 UI 外壳适配 (UI Components)

以下文件需要将硬编码 HEX 替换为 `getColor('色名')` 调用：

| 文件 | 硬编码数量 | 主要替换项 |
|------|-----------|-----------|
| `noticeBox.js` | 18 处 | 窗口背景、标题栏、按钮、标签栏 |
| `TitleBar.js` | 4 处 | 标题栏背景、文字色 |
| `ChatInputBar.js` | 35+ 处 | 输入框、按钮、附件区、模式切换 |
| `ChatItem.js` | 40+ 处 | 消息气泡、代码块、工具调用 |
| `ChatList.js` | 4 处 | 列表背景、边框 |
| `nav.js` | 3 处 | 导航栏背景、边框 |
| `Css.js` | 15+ 处 | 全局样式、滚动条、HTML 背景 |
| `setting.js` | 10+ 处 | 设置界面开关、按钮 |

#### 替换示例

**noticeBox.js 替换映射：**

| 原硬编码 | 替换为 |
|----------|--------|
| `#393432` | `getColor('gray_1').back` |
| `#755d5c` | `getColor('main').back` |
| `#a75e5e` | `getColor('pink_1').back` |
| `#636363` | `getColor('gray_2').back` |
| `#6c6379` | `getColor('purple_1').back` |
| `#332f2c` | `getColor('brown_1').back` |
| `#5e5653` | `getColor('brown_2').back` |
| `#2d2d2d` | `getColor('gray_3').back` |
| `#333` / `#333333` | `getColor('gray_6').front` |
| `#eee` / `#eeeeee` | `getColor('gray_8').front` |
| `#999` | `getColor('gray_7').front` |
| `#111` | `getColor('gray_9').front` |
| `#555` | `getColor('gray_10').back` |

---

### 2.3 CSS 全局样式适配

`Css.js` 中的 CSS 字符串需要使用模板字符串动态注入颜色：

```javascript
// 示例：滚动条样式
`*::-webkit-scrollbar-track {
  background: ${getColor('brown_3').back};
}

*::-webkit-scrollbar-thumb {
  background: ${getColor('main').back};
  border-radius: 0.4rem;
}

*::-webkit-scrollbar-thumb:hover {
  background: ${getColor('pink_1').back};
}`
```

---

## 三、实施步骤

### Phase 1: 核心架构 (Day 1)
1. [ ] 重构 `colorObj.js`，建立纯净色表
2. [ ] 重构 `getColor.js`，实现三主题路由
3. [ ] 验证 `commonData.themeColor` 与后端同步

### Phase 2: 窗口组件 (Day 2)
4. [ ] 修改 `noticeBox.js`
5. [ ] 修改 `TitleBar.js`
6. [ ] 修改 `nav.js`

### Phase 3: 聊天组件 (Day 3)
7. [ ] 修改 `ChatInputBar.js`
8. [ ] 修改 `ChatItem.js`
9. [ ] 修改 `ChatList.js`

### Phase 4: 全局样式 (Day 4)
10. [ ] 修改 `Css.js`
11. [ ] 修改 `setting.js`
12. [ ] 全局回归测试

---

## 四、验证计划 (Verification Plan)

### 4.1 手动验证清单

| 验证项 | Theme 0 | Theme 1 | Theme 2 |
|--------|---------|---------|---------|
| 标题栏颜色 | 棕色 | 黄色 | 蓝色 |
| 窗口边框 | 棕色 | 黄色 | 蓝色 |
| 确认按钮 | 粉红 | 黄色 | 蓝色 |
| 取消按钮 | 灰色 | 棕灰 | 蓝灰 |
| 最小化按钮 | 紫色 | 黄灰 | 蓝灰 |
| 标签栏背景 | 深棕 | 深黄 | 深蓝 |
| 输入框背景 | 深灰 | 黄灰 | 蓝灰 |
| 滚动条 | 棕色 | 黄色 | 蓝色 |
| 文字可读性 | ✅ | ✅ | ✅ |

### 4.2 回归测试

- [ ] Theme 0 下所有色值与修改前肉眼零差异
- [ ] 主题切换后界面无闪烁、无布局错位
- [ ] 所有按钮 hover/active 状态正常
- [ ] 深色文字在浅色背景上可读
- [ ] 浅色文字在深色背景上可读

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 遗漏硬编码颜色 | 部分元素不跟随主题 | 全局搜索 `#[0-9a-fA-F]{3,6}` 验证 |
| 对比度不足 | 文字不可读 | 每个主题单独验证文字对比度 |
| CSS 缓存 | 主题切换不生效 | 添加版本号或禁用缓存 |
| 性能影响 | 频繁调用 getColor | 考虑缓存机制，但当前规模可忽略 |

---

## 六、附录：完整硬编码颜色清单

通过 `grep -n "#[0-9a-fA-F]{3,6}"` 扫描发现：

| 颜色值 | 出现次数 | 主要用途 |
|--------|----------|----------|
| `#755d5c` | 15+ | 主色调、标题栏、边框 |
| `#a75e5e` | 10+ | 确认按钮、激活状态 |
| `#393432` | 8+ | 窗口背景、边框 |
| `#636363` | 8+ | 取消按钮 |
| `#6c6379` | 5+ | 最小化按钮 |
| `#332f2c` | 4+ | 标签栏背景 |
| `#5e5653` | 3+ | 内容区背景 |
| `#47464f` | 5+ | 输入框背景 |
| `#7c5d01` | 6+ | 终端模式激活 |
| `#5e6c79` | 4+ | Agent 按钮 |
| `#333` / `#333333` | 30+ | 主文字色 |
| `#eee` / `#eeeeee` | 20+ | 浅色文字 |
| `#999` | 15+ | 次要文字 |

---

**请审核以上计划，确认后即可开始实施。**
