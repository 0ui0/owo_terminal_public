import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "获取图元列表或详情",
  id: "svgEditorGetElements",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      throw new Error(error.details[0].message)
    }

    let { appId, groupId, elementId, recursive, page, pageSize } = value
    page = page || 1
    pageSize = pageSize || 15000

    if (!appId) {
      const activeApps = appManager.getSummary().filter(a => a.type === "svgEditor")
      if (activeApps.length > 0) {
        appId = activeApps[0].id
      } else {
        throw new Error("当前没有运行中的 svgEditor 实例。")
      }
    }

    const targetApp = appManager.get(appId)
    if (!targetApp) throw new Error("目标 svgEditor 实例不存在。")

    const res = await appManager.dispatch(appId, "getElements", { groupId, elementId, recursive })
    if (!res || !res.ok) {
      throw new Error(res?.msg || "获取图元列表失败")
    }

    const items = res.data
    if (!Array.isArray(items)) {
      return JSON.stringify(items)
    }

    // 按字符数分页：逐个元素序列化后累积，超出 pageSize 就新开一页
    // 保证每页输出都是合法完整的 JSON 数组
    const pages = []
    let currentPage = []
    let currentSize = 2  // [] 两个括号
    for (const item of items) {
      const s = JSON.stringify(item)
      const addSize = s.length + (currentPage.length > 0 ? 1 : 0)  // 逗号占 1 字符
      if (currentSize + addSize > pageSize && currentPage.length > 0) {
        pages.push(currentPage)
        currentPage = [s]
        currentSize = 2 + s.length
      } else {
        currentPage.push(s)
        currentSize += addSize
      }
    }
    if (currentPage.length > 0) pages.push(currentPage)

    const totalPages = pages.length
    if (page < 1) page = 1
    if (page > totalPages && totalPages > 0) page = totalPages

    const pageItems = pages[page - 1] || []
    const pageJson = `[${pageItems.join(",")}]`

    const header = `=== 图元数据（第 ${page}/${totalPages} 页，共 ${items.length} 个图元，每页约 ${pageSize} 字符） ===\n`
    const footer = totalPages > 1
      ? `\n--- ${page < totalPages ? `还有 ${totalPages - page} 页，使用 page:${page + 1} 获取下一页` : "已是最后一页"} ---`
      : ""

    return header + pageJson + footer
  },

  joi() {
    return Joi.object({
      appId: Joi.string().description("svgEditor 实例 ID。若留空则自动选择当前活跃的实例。"),
      groupId: Joi.string().description(
        "组的 ID。传入后返回该组直接子元素列表（按画布渲染顺序）。" +
        "不传则返回画布顶层元素列表。"
      ),
      elementId: Joi.string().description(
        "图元 ID。传入后精确查询单个图元的完整属性信息（含控制点 points 等详细数据）。" +
        "elementId 与 groupId 同时传入时，elementId 优先，recursive 参数对此模式无效。"
      ),
      recursive: Joi.boolean().description(
        "是否递归展开子组。默认 false（浅层模式）：遇到子组只返回该组节点本身，不进入内部。" +
        "传 true 时：完整递归展开当前层所有子组及其内部元素（含控制点），数据量较大，" +
        "建议配合翻页参数使用。"
      ),
      page: Joi.number().integer().min(1).default(1).description(
        "页码，从 1 开始。当数据量超过 pageSize 字符时需要翻页。"
      ),
      pageSize: Joi.number().integer().min(1000).max(50000).default(15000).description(
        "每页最大字符数（默认 15000）。系统单次读取限制约 20000 字，建议不超过此值。"
      )
    })
  },

  getDoc() {
    return (
      "查询 svgEditor 画布图元信息。支持四种模式：\n" +
      "1. 不传任何 ID → 返回画布顶层元素列表（浅层，遇到子组不进入）。\n" +
      "2. 传 groupId → 返回指定组的直接子元素列表（浅层，遇到子组不进入）。\n" +
      "3. 传 recursive=true（配合模式 1/2）→ 完整递归展开所有子组，含控制点。\n" +
      "4. 传 elementId → 精确查询单个图元完整属性，包含控制点(points)、颜色、变换矩阵等所有字段。\n" +
      "【翻页】返回结果中会显示当前页/总页数。若数据被分页，使用 page 参数翻页（默认每页约 15000 字符）。\n" +
      "建议工作流：先用模式 1/2 逐层浏览结构，对需要操作的具体图元再用模式 4 获取详情。\n" +
      "返回数据中 layerIndex 越大表示渲染层级越高（越在顶层），group 类型始终在顶层。\n" +
      "所有关系字段（parentGroup、elements、fillGroups、pureFill 等）均已转为 ID 字符串，无循环引用。"
    )
  }
}
