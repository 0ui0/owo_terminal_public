import fs from "fs-extra"
import pathLib from "path"
import tempPath from "../tools/tempPath.js"

export default {
  name: "getPlansList",
  func: async () => {
    try {
      const plansDirStr = tempPath.getUserPlansDir()
      const entries = await fs.readdir(plansDirStr, { withFileTypes: true })
      const list = []

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
          const fullPathStr = pathLib.join(plansDirStr, entry.name)
          let titleStr = ""
          let mtimeNum = 0

          try {
            const stat = await fs.stat(fullPathStr)
            mtimeNum = stat.mtimeMs

            const content = await fs.readFile(fullPathStr, "utf-8")
            const lines = content.trim().split("\n")
            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed.startsWith("# ")) {
                titleStr = trimmed.slice(2).trim()
                break
              }
            }
          } catch (err) {
            console.error(`[getPlansList] 读取计划书元数据失败: ${fullPathStr}`, err)
          }

          const baseName = entry.name.slice(0, -3)
          list.push({
            id: entry.name,
            name: titleStr || baseName,
            fileName: entry.name,
            path: fullPathStr,
            mtime: mtimeNum
          })
        }
      }

      list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))

      return {
        ok: true,
        msg: "获取计划书列表成功",
        data: list
      }
    } catch (err) {
      console.error("[getPlansList] 执行异常:", err)
      return {
        ok: false,
        msg: `获取计划书列表失败: ${err.message}`
      }
    }
  }
}
