import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"

/**
 * 批判与设计说明：
 * 1. 之前使用 process.cwd() 或 customCwd 在 Electron 环境下是不稳健的，因为工作目录可能被重置或指向用户数据区。
 * 2. 这里的 Skill 指的是“项目内置的专家规约”，应当物理锚定在源码对应的 skills/ 目录下。
 */

export default {
  name: "学习技能",
  id: "studySkills",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { searchQuery, isRegex, page = 1, pageSize = 10 } = value

    // 既然 app.js 已经 chdir 到 server/，直接相对于当前工作目录定位
    const projectRoot = pathLib.resolve(process.cwd(), "..")
    const skillBaseDir = pathLib.join(projectRoot, "owo_skills")

    let allCollected = []

    // 递归查找 skills 目录下的所有技能文件
    const walk = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = pathLib.join(dir, entry.name)
          if (entry.isDirectory()) {
            // 模式 A: 文件夹内的 SKILL.md
            const skillFile = pathLib.join(fullPath, "SKILL.md")
            try {
              await fs.access(skillFile)
              allCollected.push({ path: skillFile, id: entry.name })
              continue // 找到了一个目录型技能，通常不再深入钻取其子目录作为独立技能（除非业务需要）
            } catch (e) { }

            // 模式 B: 同名 .md 情况 ( legacy 支持 )
            const altFile = pathLib.join(fullPath, `${entry.name}.md`)
            try {
              await fs.access(altFile)
              allCollected.push({ path: altFile, id: entry.name })
              continue
            } catch (e) { }

            // 如果不是技能文件夹，则递归深入搜索子文件夹
            await walk(fullPath)
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            // 模式 C: 根目录或子目录下的普通 .md 文件
            allCollected.push({ path: fullPath, id: entry.name.replace(".md", "") })
          }
        }
      } catch (e) { }
    }

    await walk(skillBaseDir)

    let filtered = []
    let searchRegExp = null
    if (searchQuery && isRegex) {
      try {
        searchRegExp = new RegExp(searchQuery, "i")
      } catch (err) {
        return `错误：无效的正规表达式 "${searchQuery}": ${err.message}`
      }
    }

    // 处理并过滤技能
    for (const item of allCollected) {
      try {
        const content = await fs.readFile(item.path, "utf8")

        // 提取摘要
        let description = "无摘要说明"
        const descMatch = content.match(/description:\s*(.*)/i)
        if (descMatch && descMatch[1]) {
          description = descMatch[1].trim().replace(/^["']|["']$/g, "")
        } else {
          const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("---"))
          if (lines.length > 0) {
            description = lines[0].slice(0, 200) + (lines[0].length > 200 ? "..." : "")
          }
        }

        const skillObj = {
          id: item.id,
          path: pathLib.relative(projectRoot, item.path),
          description,
          content // 留作搜索比对
        }

        if (searchQuery) {
          const matchTarget = `${skillObj.id} ${skillObj.description} ${skillObj.content}`
          const isMatch = searchRegExp
            ? searchRegExp.test(matchTarget)
            : matchTarget.toLowerCase().includes(searchQuery.toLowerCase())

          if (isMatch) filtered.push(skillObj)
        } else {
          filtered.push(skillObj)
        }
      } catch (e) { }
    }

    const totalCount = filtered.length
    if (totalCount === 0) {
      return searchQuery ? `未找到匹配 "${searchQuery}" 的技能。` : "项目中尚未创建任何有效的技能 (Skills)。"
    }

    // 分页
    const totalPages = Math.ceil(totalCount / pageSize)
    const currentPage = Math.min(page, totalPages)
    const pagedResults = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    // 构建输出
    const rangeInfo = `技能条目 ${(currentPage - 1) * pageSize + 1} - ${(currentPage - 1) * pageSize + pagedResults.length} (总计 ${totalCount} 个技能)`
    const indicators = []

    if (searchQuery) indicators.push(`> [!INFO] 搜索: "${searchQuery}" ${isRegex ? "(正则模式)" : ""}`)
    if (currentPage < totalPages) {
      indicators.push(`> [!NOTE] 后续结果已截断，翻页请指定 page: ${currentPage + 1}`)
    } else {
      indicators.push(`> [!IMPORTANT] 已读至末尾 (Total: ${totalCount} skills)`)
    }

    let resultsText = pagedResults.map(s => `- **${s.id}**: ${s.description}\n  - 路径: \`${s.path}\``).join("\n\n")

    return `${rangeInfo}\n${indicators.join("\n")}\n\n${resultsText}`
  },

  joi() {
    return Joi.object({
      searchQuery: Joi.string().allow("").description("可选关键字。支持搜索 ID、摘要及全文内容。"),
      isRegex: Joi.boolean().default(false).description("可选。是否使用正则表达式搜索。"),
      page: Joi.number().min(1).default(1),
      pageSize: Joi.number().min(1).max(50).default(10)
    })
  },

  getDoc() {
    return `检索并阅读学习技能。建议先阅读`.trim()
  }
}
