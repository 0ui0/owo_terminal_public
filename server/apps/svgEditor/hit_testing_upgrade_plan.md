# 逆矩阵拾取算法（Flash 级架构）升级计划

由于目前的系统物理计算层（拾取、吸附、框选）只认底层绝对坐标，而视觉上通过 `<g transform="...">` 应用了缩放/平移，导致了“视觉与物理脱节”。为了彻底实现类似 Flash 的元件级 Transform 架构，我们将为底层引入标准的矩阵空间转换。

## Proposed Changes

### 1. Element 核心扩展
在 `svgEditor_element.coffee` 及其派生类中，新增矩阵计算能力：
- 利用浏览器原生的 `DOMMatrix` 和 `DOMPoint` 强大的解析能力。
- 新增 `getGlobalMatrix()`: 向上遍历所有 `parentGroup`，收集并按父-子顺序叠加相乘（`multiply`）所有的 `transform` 字符串，返回该图元的最终全局变换矩阵。
- 新增 `getInverseGlobalMatrix()`: 返回全局矩阵的逆矩阵（供特定逆向射线计算使用）。
- 新增 `getGlobalPoints()`: 将局部的 `prop.points` 通过全局矩阵转换，输出位于绝对画布空间的真实坐标。
- 新增 `getGlobalBoundingBox()`: 将局部包围盒的 4 个顶点进行全局转换后，重新计算得出的真实物理包围盒。

### 2. 交互判定层（svgEditor_elPaper.coffee 等）全面适配
将所有原本直接依赖 `element.prop.points` 或局部 BoundingBox 的判定，替换为使用**全局转换后的坐标**：
- **点选/线段距离 (`getClosedLine`)**: 获取图元的 `globalPts`，在全局像素坐标系下与鼠标点计算贝塞尔曲线距离，保证判断距离符合视觉比例。
- **端点吸附 (`getClosedSite`)**: 使用转换后的全局端点进行吸附计算。
- **纯色面填充拾取 (`getClosedPureFill`)**: 获取填充面所有关联边界线的 `globalPts`，并在全局系下执行射线法（Point in Polygon）判定。
- **框选工具 (`cursorTool.coffee`)**: 橡胶带框选时，调用图形的 `getGlobalBoundingBox()` 进行相交判定，使得哪怕被缩小了 10 倍的组也能准确被框中。

## 方案优势
1. **彻底解耦**：图形的数据结构永远保持干净的绝对坐标（如同 Flash 打散后的 Shape），所有的变形缩放全靠外壳 Group 矩阵实现。
2. **零成本解析**：我们不需要手写复杂的 `translate/scale/matrix` 正则解析器，直接白嫖 Chromium 极其强悍的 C++ 级 `DOMMatrix` 引擎！
3. **性能极高**：只在点击 `mousedown` 或判定时才进行矩阵计算，渲染层依旧交给 Mithril 和 SVG 原生硬件加速，毫无性能压力。
