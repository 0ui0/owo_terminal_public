import fs from "fs-extra"
import pathLib from "path"

export default {
  name: "getSystemSkillsList",
  func: async () => {
    try {
      const projectRoot = pathLib.resolve(process.cwd(), "..")
      const skillBaseDir = pathLib.join(projectRoot, "owo_skills")

      const list = []
      if (!await fs.pathExists(skillBaseDir)) {
        return { ok: true, msg: "系统技能目录不存在", data: [] }
      }

      const entries = await fs.readdir(skillBaseDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPathStr = pathLib.join(skillBaseDir, entry.name)

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
              console.error(`[getSystemSkillsList] 读取系统技能元数据失败: ${skillEntryFile}`, err)
            }

            list.push({
              id: entry.name,
              name: entry.name,
              desc: descStr || entry.name,
              path: skillEntryFile,
              dirPath: fullPathStr,
              isDir: true,
              source: "system"
            })
          }
        }
      }

      return {
        ok: true,
        msg: "获取系统技能列表成功",
        data: list
      }
    } catch (err) {
      console.error("[getSystemSkillsList] 执行异常:", err)
      return {
        ok: false,
        msg: `获取系统技能列表失败: ${err.message}`
      }
    }
  }
}
