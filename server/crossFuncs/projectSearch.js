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
  func: async (query, baseDir, searchConfig) => {
    try {
      if (!query) return { ok: true, msg: "搜索词为空", data: [] }
      
      const searchRoot = baseDir || process.cwd()
    const { useRegex, caseSensitive, wholeWord, excludePatterns } = searchConfig || {}

    // 1. 解析排除规则
    const commonGlobs = []
    if (excludePatterns) {
      const patterns = excludePatterns.split(",").map(p => p.trim()).filter(Boolean)
      for (const p of patterns) {
        commonGlobs.push("--glob", `!${p}`)
      }
    } else {
      commonGlobs.push(
        "--glob", "!node_modules",
        "--glob", "!.git",
        "--glob", "!dist",
        "--glob", "!build"
      )
    }

    // === 第一路：文件名与路径匹配（大小写可配，支持目录及正则） ===
    const fileNameResults = []
    try {
      const { stdout: filesStdout } = await execFileAsync(rgPath, [
        "--files",
        ...commonGlobs,
        searchRoot
      ], { maxBuffer: 1024 * 1024 * 10 })

      let filterFn
      if (useRegex) {
        try {
          const flags = caseSensitive ? "" : "i"
          const re = new RegExp(query, flags)
          filterFn = (relPath) => re.test(relPath)
        } catch (e) {
          const q = caseSensitive ? query : query.toLowerCase()
          filterFn = (relPath) => caseSensitive ? relPath.includes(q) : relPath.toLowerCase().includes(q)
        }
      } else {
        const q = caseSensitive ? query : query.toLowerCase()
        filterFn = (relPath) => caseSensitive ? relPath.includes(q) : relPath.toLowerCase().includes(q)
      }

      const qLower = query.toLowerCase()
      const dirSet = new Set()

      for (const line of filesStdout.trim().split("\n")) {
        if (!line.trim()) continue
        const fullPath = line.trim()
        const relPath = pathLib.relative(searchRoot, fullPath)
        
        if (filterFn(relPath)) {
          const name = pathLib.basename(fullPath)
          fileNameResults.push({
            path: fullPath,
            relPath,
            name,
            line: 0,
            content: "",
            submatches: [],
            isDirectory: false,
            isSearchResult: true,
            isFileNameMatch: true
          })

          // 收集路径中匹配 query 的各级父目录
          const parts = pathLib.dirname(relPath).split("/")
          let acc = ""
          for (const part of parts) {
            if (!part || part === ".") continue
            acc = acc ? acc + "/" + part : part
            const partMatch = caseSensitive 
              ? part.includes(query) 
              : part.toLowerCase().includes(qLower)
            if (partMatch) {
              dirSet.add(acc)
            }
          }
        }
      }

      // 目录名匹配结果附加到末尾
      for (const dirRel of dirSet) {
        fileNameResults.push({
          path: pathLib.join(searchRoot, dirRel),
          relPath: dirRel,
          name: pathLib.basename(dirRel),
          line: 0,
          content: "",
          submatches: [],
          isDirectory: true,
          isSearchResult: true,
          isFileNameMatch: true
        })
      }
    } catch (err) {
      if (err.code !== 1) console.error("[projectSearch] 文件名搜索失败:", err.message)
    }

    // === 第二路：文件内容匹配与智能截断 ===
    const contentResults = []
    try {
      const contentArgs = [
        "--json",
        "--max-count", "100",
        ...commonGlobs
      ]

      if (caseSensitive) {
        contentArgs.push("--case-sensitive")
      } else {
        contentArgs.push("--smart-case")
      }

      if (wholeWord) {
        contentArgs.push("--word-regexp")
      }

      if (!useRegex) {
        contentArgs.push("--fixed-strings")
      }

      contentArgs.push(query, searchRoot)

      const { stdout } = await execFileAsync(rgPath, contentArgs, { maxBuffer: 1024 * 1024 * 10 })

      const fileContentCount = new Map()

      for (const line of stdout.trim().split("\n")) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === "match") {
            const fullPath = event.data.path.text
            
            // 限制单个文件最多 15 行内容匹配，防止 monopoly
            const currentCount = fileContentCount.get(fullPath) || 0
            if (currentCount >= 15) continue
            
            const text = event.data.lines.text.trim()
            if (text.length > 1000) continue // 过滤过长打包行

            let truncatedContent = text
            let truncatedSubmatches = event.data.submatches || []

            // 对长行以第一个匹配词为中心进行截断，并修正偏移量
            if (text.length > 200) {
              let matchStart = 0
              if (truncatedSubmatches.length > 0) {
                matchStart = truncatedSubmatches[0].start
              } else {
                matchStart = text.toLowerCase().indexOf(query.toLowerCase())
                if (matchStart === -1) matchStart = 0
              }

              const half = 90
              let start = Math.max(0, matchStart - half)
              let end = Math.min(text.length, matchStart + half)

              if (start === 0) {
                end = Math.min(text.length, 180)
              } else if (end === text.length) {
                start = Math.max(0, text.length - 180)
              }

              truncatedContent = text.slice(start, end)
              const offset = start

              truncatedSubmatches = (event.data.submatches || []).map(m => ({
                ...m,
                start: Math.max(0, m.start - offset),
                end: Math.min(truncatedContent.length, m.end - offset)
              })).filter(m => m.start < truncatedContent.length && m.end > 0)

              if (start > 0) {
                truncatedContent = "..." + truncatedContent
                truncatedSubmatches.forEach(m => {
                  m.start += 3
                  m.end += 3
                })
              }
              if (end < text.length) {
                truncatedContent = truncatedContent + "..."
              }
            }

            contentResults.push({
              path: fullPath,
              relPath: pathLib.relative(searchRoot, fullPath),
              name: pathLib.basename(fullPath),
              line: event.data.line_number,
              content: truncatedContent,
              submatches: truncatedSubmatches,
              isDirectory: false,
              isSearchResult: true,
              isFileNameMatch: false
            })

            fileContentCount.set(fullPath, currentCount + 1)
          }
        } catch (e) {}
      }
    } catch (err) {
      if (err.code !== 1) return { ok: false, msg: err.message }
    }

    // VSCode 风格排序：文件路径优先，然后是行号
    const raw = [...fileNameResults, ...contentResults]
    raw.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path)
      return a.line - b.line
    })
      const combined = raw.slice(0, 200)
      return { ok: true, msg: `搜索完成，找到 ${combined.length} 个匹配项`, data: combined }
    } catch (err) {
      console.log(err)
      return { ok: false, msg: "检索发生异常: " + (err.message || err) }
    }
  }
}
