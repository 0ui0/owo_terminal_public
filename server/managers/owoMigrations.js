import options from "../config/options.js"

// 版本号比较：a > b 返回 1，a === b 返回 0，a < b 返回 -1
const cmpVersion = (a, b) => {
  const pa = String(a ?? "0").split(".").map(Number)
  const pb = String(b ?? "0").split(".").map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

// 无 version 字段的历史存档默认视为 0（未知旧格式）
const LEGACY_VERSION = "0"

const owoMigrations = {
  list: [],

  // 增量执行迁移：从存档版本跑到当前版本，结构对齐后更新 meta.version
  async run(data, currentVersion = "1.3.0") {
    const savedVersion = data.meta?.version || LEGACY_VERSION
    for (const m of this.list) {
      if (cmpVersion(m.version, savedVersion) > 0 && cmpVersion(m.version, currentVersion) <= 0) {
        data = await m.migrate(data)
      }
    }
    if (data.meta) {
      data.meta.version = currentVersion
    }
    return data
  },

  // 存档版本是否在迁移链可覆盖范围内
  canMigrate(savedVersion) {
    return cmpVersion(savedVersion, LEGACY_VERSION) >= 0
  }
}

owoMigrations.list.push({
  version: "1.3.0",
  // 首次建立存档版本号体系，收编所有历史格式差异：
  // 1. 附件路径约定由 /upload/ 改为 /attachment/
  // 2. 废弃 sendMode 字段，为缺失的 lockedListId 补默认值
  // 3. 会话模型引用由 currentModel(配置名) 改为 currentModelId(模型uuid)
  // 4. 工作目录由字符串路径改为对象数组（主+辅助，带 type/order）
  migrate: async (data) => {
    // 1. 附件路径替换
    const replaceUploadPaths = (node) => {
      if (typeof node === "string") return node.replace(/\/upload\//g, "/attachment/")
      if (Array.isArray(node)) {
        node.forEach((item, i) => { node[i] = replaceUploadPaths(item) })
        return node
      }
      if (node && typeof node === "object") {
        for (const key in node) node[key] = replaceUploadPaths(node[key])
        return node
      }
      return node
    }
    data = replaceUploadPaths(data)

    // 2. 字段清理与补默认值
    if (data.comData) {
      delete data.comData.sendMode
      if (data.comData.chatLists) {
        for (const list of data.comData.chatLists) {
          delete list.sendMode
          if (list.lockedListId === undefined) {
            list.lockedListId = null
          }
        }
      }
    }

    // 3. 会话模型引用升级
    const aiList = await options.get("ai_aiList")
    const savedLists = data.comData?.chatLists || []
    for (const list of savedLists) {
      if (!list.currentModelId && list.currentModel) {
        list.currentModelId = aiList.find(m => m.name === list.currentModel)?.id || null
      }
      if (list.currentModel !== undefined) {
        delete list.currentModel
      }
    }

    // 4. 工作目录旧版兼容：字符串路径 → 对象数组 [{ path, type, order }]
    if (data.comData?.chatLists) {
      for (const list of data.comData.chatLists) {
        if (typeof list.workDirs === "string" && list.workDirs) {
          // 旧版单个字符串工作目录 → 作为主工作目录
          list.workDirs = [{ path: list.workDirs, type: "main", order: 0 }]
        } else if (Array.isArray(list.workDirs)) {
          // 已是数组：规范化元素（兼容字符串元素、缺失 type/order）
          list.workDirs = list.workDirs.map((item, index) => {
            if (typeof item === "string") return { path: item, type: index === 0 ? "main" : "", order: index }
            return {
              path: item.path,
              type: item.type === "main" ? "main" : (index === 0 ? "main" : ""),
              order: item.order ?? index
            }
          })
        }
      }
    }
    return data
  }
})

export default owoMigrations
