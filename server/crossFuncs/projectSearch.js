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
    if (!query) return { ok: true, data: [] }
    
    const searchRoot = baseDir || process.cwd()
    const args = [
      "--json",
      "--max-count", "100",
      "--glob", "!node_modules",
      "--glob", "!.git",
      "--glob", "!dist",
      "--glob", "!build",
      "--smart-case",
      "--fixed-strings",
      query,
      searchRoot
    ]

    try {
      const { stdout } = await execFileAsync(rgPath, args, { maxBuffer: 1024 * 1024 * 10 })
      const lines = stdout.trim().split("\n")
      const results = []
      
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === "match") {
            let fullPath = event.data.path.text
            let relPath = pathLib.relative(searchRoot, fullPath)
            
            results.push({
              path: fullPath,
              relPath: relPath,
              name: pathLib.basename(fullPath),
              line: event.data.line_number,
              content: event.data.lines.text.trim(),
              submatches: event.data.submatches, // 包含 {match, start, end}
              isDirectory: false,
              isSearchResult: true // 标记为搜索结果
            })
          }
        } catch (e) {}
      }

      return { ok: true, data: results.slice(0, 100) }
    } catch (err) {
      if (err.code === 1) return { ok: true, data: [] }
      return { ok: false, msg: err.message }
    }
  }
}
