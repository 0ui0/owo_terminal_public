import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"

export default {
  name: "查找文件",
  id: "fileFind",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { pattern, searchPath, maxDepth } = value

    // Resolve Path
    const comData = (await import("../../../comData/comData.js")).default
    const cwd = comData.data.get()?.customCwd || process.cwd()
    const startPath = searchPath ? pathLib.resolve(cwd, searchPath) : cwd

    const results = []
    const limit = 50 // Avoid huge output

    // Simple Recursive Search Helper
    async function walk(currentPath, depth) {
      if (results.length >= limit) return
      if (depth > maxDepth) return

      try {
        const dirents = await fs.readdir(currentPath, { withFileTypes: true })

        for (const dirent of dirents) {
          if (results.length >= limit) break

          const fullPath = pathLib.join(currentPath, dirent.name)

          if (dirent.isDirectory()) {
            if (dirent.name.startsWith(".") && dirent.name !== ".") continue // Skip hidden dirs like .git
            await walk(fullPath, depth + 1)
          } else {
            // Match Logic (Simple Substring or Wildcard if needed, here using lowercase includes for simplicity as 'pattern')
            // Or support simple wildcard '*'
            const match = checkMatch(dirent.name, pattern)
            if (match) {
              results.push(fullPath)
            }
          }
        }
      } catch (e) {
        // Ignore access errors
      }
    }

    // Helper: Simple wildcard matcher
    function checkMatch(filename, pattern) {
      // Convert wildcard * to Regex .*
      try {
        const regexStr = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
        const regex = new RegExp(regexStr, "i") // Case insensitive
        return regex.test(filename)
      } catch (e) {
        // Fallback to simple includes
        return filename.toLowerCase().includes(pattern.toLowerCase())
      }
    }

    try {
      await walk(startPath, 1)
      if (results.length === 0) return "未找到匹配的文件。"
      let resultStr = `找到以下文件 (前 ${limit} 个):\n` + results.join("\n")
      if (resultStr.length > 5000) {
        resultStr = resultStr.slice(0, 5000) + "\n...(已截断)"
      }
      return resultStr
    } catch (e) {
      return `搜索出错: ${e.message}`
    }
  },

  joi() {
    return Joi.object({
      pattern: Joi.string().required().description("文件名匹配模式 (支持通配符 *)，例如 '*.js' 或 'frontend'"),
      searchPath: Joi.string().optional().description("搜索起始路径。默认为当前工作目录。"),
      maxDepth: Joi.number().default(5).description("最大搜索深度。默认为 5。")
    })
  },

  getDoc() {
    return `
      在指定目录中递归查找文件。
      支持简单的通配符 (*)。
      用于当不知道确切路径时查找文件位置。
    `
  }
}
