import { spawn } from "child_process"
import pathLib from "path"
import { createRequire } from "module"

const require = createRequire(import.meta.url)

let rgPath
try {
  rgPath = require("@vscode/ripgrep").rgPath
} catch (e) {
  try {
    rgPath = require("vscode-ripgrep").rgPath
  } catch (e2) {
    throw new Error("未找到 ripgrep 二进制，请检查 @vscode/ripgrep 依赖是否安装")
  }
}

// 流式执行 rg 并逐行回调，规避 execFile maxBuffer 溢出问题
const runRgLines = (args, onLine) => new Promise((resolve) => {
  let buffer = ""
  let errMsg = ""
  const child = spawn(rgPath, args, { stdio: ["ignore", "pipe", "pipe"] })

  child.stdout.setEncoding("utf-8")
  child.stdout.on("data", (chunk) => {
    buffer += chunk
    let idx
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      if (line.trim()) onLine(line)
    }
  })

  child.stderr.setEncoding("utf-8")
  child.stderr.on("data", (chunk) => { errMsg += chunk })

  child.on("error", (e) => { errMsg = e.message })
  child.on("close", (code) => {
    if (buffer.trim()) onLine(buffer)
    resolve({ code, errMsg })
  })
})

// 判定并转换 Glob 通配符（支持 *.md, *.js, *test* 等）
const isGlobPattern = (str) => /[*?]/.test(str)
const globToRegex = (globStr, isCaseSensitive) => {
  const escaped = globStr.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  const regexStr = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  return new RegExp(regexStr, isCaseSensitive ? "" : "i")
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

      // === 第一路：文件名与路径匹配（对齐 VSCode：支持正则、Glob 通配符及模糊包含） ===
      const fileNameResults = []
      let filterFn
      if (useRegex) {
        try {
          const flags = caseSensitive ? "" : "i"
          const re = new RegExp(query, flags)
          filterFn = (relPath) => re.test(relPath)
        } catch (e) {
          // 💡 容错：非法正则不崩溃，降级为字面量或包含匹配
          const q = caseSensitive ? query : query.toLowerCase()
          filterFn = (relPath) => caseSensitive ? relPath.includes(q) : relPath.toLowerCase().includes(q)
        }
      } else if (isGlobPattern(query)) {
        // 💡 智能 Glob：支持用户输入 *.md 快速匹配所有 md 文件
        try {
          const globRe = globToRegex(query, caseSensitive)
          filterFn = (relPath) => {
            const fileName = pathLib.basename(relPath)
            return globRe.test(fileName) || globRe.test(relPath)
          }
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

      try {
        const { code, errMsg } = await runRgLines(["--files", ...commonGlobs, searchRoot], (line) => {
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
            const parts = pathLib.dirname(relPath).split(/[\\/]/)
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
        })
        if (code !== 0 && code !== 1) console.warn("[projectSearch] 文件名搜索提示:", errMsg || `rg 退出码 ${code}`)
      } catch (err) {
        console.warn("[projectSearch] 文件名搜索跳过:", err.message)
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

        // 💡 严格对齐 VSCode：非正则模式一律强制固定为纯字面量匹配
        if (!useRegex) {
          contentArgs.push("--fixed-strings")
        }

        contentArgs.push(query, searchRoot)

        const fileContentCount = new Map()

        const { code, errMsg } = await runRgLines(contentArgs, (line) => {
          try {
            const event = JSON.parse(line)
            if (event.type === "match") {
              const fullPath = event.data.path.text

              // 限制单个文件最多 15 行内容匹配，防止垄断
              const currentCount = fileContentCount.get(fullPath) || 0
              if (currentCount >= 15) return

              const rawText = (event.data.lines?.text || "").replace(/[\r\n]+$/, "")
              if (rawText.length > 1000) return // 过滤过长打包行

              let truncatedContent = rawText
              let truncatedSubmatches = (event.data.submatches || []).filter(m => m.start < rawText.length && m.end > 0)

              // 对长行以第一个匹配词为中心进行截断，并修正偏移量
              if (rawText.length > 200) {
                let matchStart = 0
                if (truncatedSubmatches.length > 0) {
                  matchStart = truncatedSubmatches[0].start
                } else {
                  matchStart = rawText.toLowerCase().indexOf(query.toLowerCase())
                  if (matchStart === -1) matchStart = 0
                }

                const half = 90
                let start = Math.max(0, matchStart - half)
                let end = Math.min(rawText.length, matchStart + half)

                if (start === 0) {
                  end = Math.min(rawText.length, 180)
                } else if (end === rawText.length) {
                  start = Math.max(0, rawText.length - 180)
                }

                truncatedContent = rawText.slice(start, end)
                const offset = start

                truncatedSubmatches = truncatedSubmatches.map(m => ({
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
                if (end < rawText.length) {
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
        })

        // 💡 严格对齐 VSCode 静默设计：对于未闭合的临时非法正则或退出码 2，静默吸收，绝不抛出 ok: false 打扰用户
        if (code !== 0 && code !== 1) {
          if (errMsg && (errMsg.includes("regex parse error") || errMsg.includes("error: "))) {
            console.warn("[projectSearch] 输入过程中的临时正则表达式，已做静默容错处理")
          }
        }
      } catch (err) {
        console.warn("[projectSearch] 内容检索静默跳过:", err.message)
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
