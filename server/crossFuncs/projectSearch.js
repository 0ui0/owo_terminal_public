import { execFile } from "child_process"
import util from "util"
import pathLib from "path"
import { createRequire } from "module"

const execFileAsync = util.promisify(execFile)
const require = createRequire(import.meta.url)

let rgPath
try {
  rgPath = require("@vscode/ripgrep").rgPath
} catch (e) {
  try {
    rgPath = require("vscode-ripgrep").rgPath
  } catch (e2) {
    rgPath = "grep"
  }
}

export default {
  name: "projectSearch",
  func: async (query, baseDir) => {
    if (!query) return { ok: true, msg: "搜索词为空", data: [] }
    
    const searchRoot = baseDir || process.cwd()
    const commonGlobs = [
      "--glob", "!node_modules",
      "--glob", "!.git",
      "--glob", "!dist",
      "--glob", "!build",
    ]

    // === 第一路：文件名匹配 ===
    const fileNameResults = []
    try {
      const { stdout: filesStdout } = await execFileAsync(rgPath, [
        "--files",
        "--smart-case",
        "--glob", `*${query}*`,
        ...commonGlobs,
        searchRoot
      ], { maxBuffer: 1024 * 1024 * 10 })

      for (const line of filesStdout.trim().split("\n")) {
        if (!line.trim()) continue
        const fullPath = line.trim()
        fileNameResults.push({
          path: fullPath,
          relPath: pathLib.relative(searchRoot, fullPath),
          name: pathLib.basename(fullPath),
          line: 0,
          content: "",
          submatches: [],
          isDirectory: false,
          isSearchResult: true,
          isFileNameMatch: true
        })
      }
    } catch (err) {
      if (err.code !== 1) console.error("[projectSearch] 文件名搜索失败:", err.message)
    }

    // === 第二路：文件内容匹配 ===
    const contentResults = []
    try {
      const { stdout } = await execFileAsync(rgPath, [
        "--json",
        "--max-count", "100",
        "--smart-case",
        "--fixed-strings",
        ...commonGlobs,
        query,
        searchRoot
      ], { maxBuffer: 1024 * 1024 * 10 })

      for (const line of stdout.trim().split("\n")) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === "match") {
            const fullPath = event.data.path.text
            contentResults.push({
              path: fullPath,
              relPath: pathLib.relative(searchRoot, fullPath),
              name: pathLib.basename(fullPath),
              line: event.data.line_number,
              content: event.data.lines.text.trim(),
              submatches: event.data.submatches,
              isDirectory: false,
              isSearchResult: true,
              isFileNameMatch: false
            })
          }
        } catch (e) {}
      }
    } catch (err) {
      if (err.code !== 1) return { ok: false, msg: err.message }
    }

    // 文件名匹配置顶，内容匹配跟在后面，总量截断 200
    const combined = [...fileNameResults, ...contentResults].slice(0, 200)
    return { ok: true, msg: `搜索完成，找到 ${combined.length} 个匹配项`, data: combined }
  }
}
