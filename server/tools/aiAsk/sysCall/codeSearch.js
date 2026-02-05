import Joi from "joi"
import { execFile } from "child_process"
import util from "util"
import pathLib from "path"
import { createRequire } from "module"

// 获取 vscode-ripgrep 二进制路径
const require = createRequire(import.meta.url)
let rgPath
try {
  // 尝试从新版包名获取
  rgPath = require("@vscode/ripgrep").rgPath
} catch (e) {
  try {
    // 回退尝试旧版包名 (以防万一)
    rgPath = require("vscode-ripgrep").rgPath
  } catch (e2) {
    // 依然失败则回退到系统命令
    rgPath = "grep"
  }
}

const execFileAsync = util.promisify(execFile)

export default {
  name: "全局代码搜索",
  id: "codeSearch",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { query, includes, searchDir } = value

    const cwd = process.cwd()
    const targetDir = searchDir ? pathLib.resolve(cwd, searchDir) : cwd

    // 构建参数数组
    // 相比 exec，execFile 更安全，因为参数不经过 shell 解析
    const args = [
      "--json", // 输出 JSON 流
      "--max-count", "100", // 限制单文件匹配数
      "--glob", "!node_modules",
      "--glob", "!.git",
      "--glob", "!dist",
      "--glob", "!build",
      "--glob", "!.vscode"
    ]

    if (includes) {
      // 这里的 glob 模式可以直接传递，不需要引号
      args.push("--glob", includes)
    }

    // 默认开启 smart-case
    args.push("--smart-case")

    // 使用 fixed-strings 模式处理查询内容，避免正则注入
    // 如果用户确实需要正则，可以移除这个参数，此时 execFile 也是安全的（不会触发 shell 命令注入）
    // 但作为代码搜索，字面量匹配更是常态
    args.push("--fixed-strings")

    // 查询内容 (无需转义引号)
    args.push(query)

    // 目标路径
    args.push(targetDir)

    try {
      // 执行 ripgrep
      const { stdout } = await execFileAsync(rgPath, args, { maxBuffer: 1024 * 1024 * 5 })

      const lines = stdout.trim().split("\n")
      if (lines.length === 0) return "未找到匹配内容。"

      const results = []
      let matchCount = 0
      const MAX_TOTAL = 50

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === "match") {
            if (matchCount >= MAX_TOTAL) continue
            matchCount++

            // 转换路径
            let relPath = event.data.path.text
            if (relPath.startsWith(cwd)) {
              relPath = relPath.slice(cwd.length + 1)
            }

            results.push({
              file: relPath,
              line: event.data.line_number,
              content: event.data.lines.text.trim()
            })
          }
        } catch (e) {
          // 忽略非 JSON 行
        }
      }

      if (results.length === 0) return "未找到匹配内容。"

      let output = JSON.stringify(results, null, 2)
      if (matchCount >= MAX_TOTAL) {
        output += `\n\n(注意：仅显示前 ${MAX_TOTAL} 条结果)`
      }
      return output

    } catch (err) {
      // ripgrep return 1 if no matches found
      if (err.code === 1) return "未找到匹配内容。"
      return `搜索出错：${err.message}`
    }
  },
  joi() {
    return Joi.object({
      query: Joi.string().required().description("要搜索的字符串"),
      includes: Joi.string().optional().description("文件名匹配模式，例如 '*.js'"),
      searchDir: Joi.string().optional().description("限定搜索目录")
    })
  },
  getDoc() {
    return `
      基于 vscode-ripgrep 进行高性能全局搜索。
      支持智能大小写、自动忽略 .gitignore 文件。
      返回标准的 JSON 数格式：[{file, line, content}, ...]
    `
  }
}
