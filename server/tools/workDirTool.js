import comData from "../comData/comData.js"

/**
 * 工作目录读取工具
 * 取代旧的 comData.data.get()?.customCwd（全局根），改为按会话读取 chatList.workDirs
 * workDirs 结构：[{ path, type, order }]，type === "main" 为主工作目录
 */
export default {
  /**
   * 获取某会话的工作目录数组
   * @param {number|string} listId 会话列表 id
   * @returns {Array} workDirs 数组，找不到会话或未设置时返回 []
   */
  getWorkDirs(listId) {
    let list = null
    try {
      list = comData.getChatList(listId)
    } catch (e) {
      return []
    }
    return Array.isArray(list?.workDirs) ? list.workDirs : []
  },

  /**
   * 获取某会话的主工作目录路径（type === "main"）
   * @param {number|string} listId 会话列表 id
   * @returns {string|null} 无主目录时返回 null
   */
  getMainWorkDir(listId) {
    const dirs = this.getWorkDirs(listId)
    const main = dirs.find((item) => item.type === "main")
    return main ? main.path : null
  },

  /**
   * 获取某会话的辅助目录数组（type !== "main"）
   * @param {number|string} listId 会话列表 id
   * @returns {Array} 辅助目录数组，无则 []
   */
  getAuxDirs(listId) {
    const dirs = this.getWorkDirs(listId)
    return dirs.filter((item) => item.type !== "main")
  }
}
