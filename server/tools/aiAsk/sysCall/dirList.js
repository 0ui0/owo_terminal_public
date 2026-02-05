import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"

export default {
  name: "列出目录内容",
  id: "dirList",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { dirPath, recursive, maxDepth, exclude } = value

    // Resolve Path
    const comData = (await import("../../../comData/comData.js")).default
    const cwd = comData.data.get()?.customCwd || process.cwd()
    const resolvedPath = dirPath ? pathLib.resolve(cwd, dirPath) : cwd

    const MAX_ITEMS = 1000
    const items = []

    let excludeRegex = null
    if (exclude) {
      try {
        excludeRegex = new RegExp(exclude)
      } catch (e) {
        return "错误：exclude 正则表达式无效: " + e.message
      }
    }

    // Helper: Recursive Walker
    async function walk(currentPath, currentDepth) {
      if (items.length >= MAX_ITEMS) return
      if (recursive && currentDepth > maxDepth) return

      try {
        const dirents = await fs.readdir(currentPath, { withFileTypes: true })

        // Sort: directories first, then files
        dirents.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })

        for (const dirent of dirents) {
          if (items.length >= MAX_ITEMS) break

          // Optional: Skip .git or node_modules to avoid clutter unless explicitly asked?
          // For now, we trust the user or they use maxDepth. But let's skip .git to be safe.
          if (dirent.name === ".git" || dirent.name === ".DS_Store") continue

          // User defined exclusion
          if (excludeRegex && excludeRegex.test(dirent.name)) continue

          let type = "file"
          if (dirent.isSymbolicLink()) type = "symlink"
          else if (dirent.isDirectory()) type = "directory"

          // Calculate relative path for cleaner output
          const fullPath = pathLib.join(currentPath, dirent.name)
          const relPath = pathLib.relative(resolvedPath, fullPath)

          items.push({
            path: relPath || dirent.name, // handle root case oddities
            type,
            // If it's a symlink, maybe show where it points? (fs.readlink). skipped for perf unless needed.
          })

          // Recursion Logic:
          // Only recurse if it IS a directory AND user asked for recursion.
          // Note: isDirectory() returns false for symlinks in fs.Dirent (acts like lstat)
          // So this naturally excludes following symlinks.
          if (recursive && dirent.isDirectory()) {
            await walk(fullPath, currentDepth + 1)
          }
        }
      } catch (e) {
        // Access denied or other error on subdirectory
        if (currentDepth === 0) throw e // Throw if root fails
        items.push({ path: pathLib.relative(resolvedPath, currentPath), error: e.message })
      }
    }

    try {
      await walk(resolvedPath, 0)

      const response = {
        root: resolvedPath,
        total: items.length,
        items
      }
      if (items.length >= MAX_ITEMS) response.note = `输出限制为 ${MAX_ITEMS} 项。`

      let resultStr = "列目录：" + JSON.stringify(response, null, 2)
      if (resultStr.length > 5000) {
        resultStr = resultStr.slice(0, 5000) + "\n...(已截断)"
      }
      return resultStr

    } catch (e) {
      return `读取目录失败: ${e.message}`
    }
  },

  joi() {
    return Joi.object({
      dirPath: Joi.string().optional().allow("").description("目标目录路径。留空则列出当前工作目录。"),
      recursive: Joi.boolean().default(false).description("是否递归查找子目录。注意：不会进入符号链接。"),
      maxDepth: Joi.number().default(3).description("递归深度，默认为 3。仅在 recursive=true 时有效。"),
      exclude: Joi.string().optional().description("要排除的文件或文件夹名称正则表达式（如 'node_modules|dist'）。")
    })
  },

  getDoc() {
    return `
      列出指定目录下的文件和子目录。
      支持递归模式 (recursive: true)，可设置最大深度 (maxDepth)。
      **注意**：在递归时，会列出符号链接（symlink），但不会跟随/进入链接指向的目录。
    `
  }
}
