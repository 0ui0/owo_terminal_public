import fs from "fs-extra"
import pathLib from "path"
import tempPath from "../tools/tempPath.js"

export default {
  name: "getUserSkillsList",
  func: async () => {
    try {
      const skillsDirStr = tempPath.getUserSkillsDir()
      const entries = await fs.readdir(skillsDirStr, { withFileTypes: true })
      const list = []

      for (const entry of entries) {
        const fullPathStr = pathLib.join(skillsDirStr, entry.name)

        if (entry.isDirectory()) {
          let skillEntryFile = pathLib.join(fullPathStr, "SKILL.md")
          if (!await fs.pathExists(skillEntryFile)) {
            const lowerFile = pathLib.join(fullPathStr, "skill.md")
            if (await fs.pathExists(lowerFile)) {
              skillEntryFile = lowerFile
            } else {
              skillEntryFile = ""
            }
          }

          if (skillEntryFile) {
            let descStr = ""
            try {
              const content = await fs.readFile(skillEntryFile, "utf-8")
              const frontMatterMatch = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/)
              if (frontMatterMatch) {
                const descMatch = frontMatterMatch[1].match(/description\s*:\s*["']?([^"'\r\n]+)["']?/)
                if (descMatch) descStr = descMatch[1].trim()
              }
              if (!descStr) {
                const lines = content.replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---/, "").trim().split("\n")
                descStr = (lines[0] || "").replace(/^[#\s\-*]+/, "").slice(0, 80).trim()
              }
            } catch (err) {
              console.error(`[getUserSkillsList] 读取技能元数据失败: ${skillEntryFile}`, err)
            }

            list.push({
              id: entry.name,
              name: entry.name,
              desc: descStr || entry.name,
              path: skillEntryFile,
              dirPath: fullPathStr,
              isDir: true,
              source: "user"
            })
          }
        } else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
          const baseName = entry.name.slice(0, -3)
          let descStr = ""
          try {
            const content = await fs.readFile(fullPathStr, "utf-8")
            const lines = content.trim().split("\n")
            descStr = (lines[0] || "").replace(/^[#\s\-*]+/, "").slice(0, 80).trim()
          } catch (err) {
            console.error(`[getUserSkillsList] 读取文件首行失败: ${fullPathStr}`, err)
          }

          list.push({
            id: baseName,
            name: baseName,
            desc: descStr || baseName,
            path: fullPathStr,
            dirPath: skillsDirStr,
            isDir: false,
            source: "user"
          })
        }
      }

      return {
        ok: true,
        msg: "获取用户技能列表成功",
        data: list
      }
    } catch (err) {
      console.error("[getUserSkillsList] 执行异常:", err)
      return {
        ok: false,
        msg: `获取用户技能列表失败: ${err.message}`
      }
    }
  }
}
