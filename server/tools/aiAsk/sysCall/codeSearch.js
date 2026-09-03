import Joi from "joi"
import { spawn } from "child_process"
import readline from "readline"
import pathLib from "path"
import fs from "fs"
import { createRequire } from "module"
import waitConfirm from "../../waitConfirm.js"
import workDirTool from "../../workDirTool.js"

// 获取 vscode-ripgrep 二进制路径
const require = createRequire(import.meta.url)
let rgPath
try {
  // 尝试从新版包名获取（项目内置 @vscode/ripgrep 二进制）
  rgPath = require("@vscode/ripgrep").rgPath
} catch (e) {
  try {
    // 回退尝试旧版包名 (以防万一)
    rgPath = require("vscode-ripgrep").rgPath
  } catch (e2) {
    // Windows/macOS 均无系统 grep 可用，直接报错提示依赖缺失
    throw new Error("未找到 ripgrep 二进制，请检查 @vscode/ripgrep 依赖是否安装")
  }
}

/**
 * 剥离外层引号（提取被引号保护的实际内容）
 */
const stripQuotes = (s) => {
  if (typeof s !== "string") return s
  const str = s.trim()
  if ((str.startsWith("'") && str.endsWith("'") && str.length >= 2) ||
    (str.startsWith('"') && str.endsWith('"') && str.length >= 2)) {
    return str.slice(1, -1)
  }
  return str
}

// rg --json 的 submatch.start/end 单位是【字节】，而 lines.text 是已解码的 JS 字符串(UTF-16)。
// 将字节区间 [byteStart, byteEnd) 换算为字符区间 [charStart, charEnd)，供 substring/slice 使用。
const utf8LenOf = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4)
const byteRangeToCharRange = (text, byteStart, byteEnd) => {
  let byteAcc = 0
  let charAcc = 0
  let cs = null
  let ce = null
  for (const ch of text) {
    const bl = utf8LenOf(ch.codePointAt(0))
    if (cs === null && byteAcc + bl > byteStart) cs = charAcc
    if (byteAcc >= byteEnd) {
      ce = charAcc
      break
    }
    byteAcc += bl
    charAcc++
  }
  if (cs === null) cs = charAcc
  if (ce === null) ce = charAcc
  return [cs, ce]
}

export default {
  name: "全局代码搜索",
  id: "codeSearch",
  async fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const {
      query,
      searchDir,
      includes,
      excludes,
      isRegex,
      caseSensitive,
      matchPerLine,
      pcre2,
      contextLines,
      maxResults,
      maxFileSize,
      maxColumns,
      timeout
    } = value

    // 1. 提取并计算目标工作目录
    const mainDir = workDirTool.getMainWorkDir(metaData.listId)
    if (!mainDir && (!searchDir || !pathLib.isAbsolute(searchDir))) {
      return "错误：当前会话未设置工作目录。请先要求用户配置工作目录，或者在使用工具时提供绝对路径。"
    }
    const targetDir = searchDir
      ? (pathLib.isAbsolute(searchDir) ? searchDir : pathLib.resolve(mainDir, searchDir))
      : mainDir

    if (!fs.existsSync(targetDir)) {
      return `错误：指定的搜索目录不存在: ${targetDir}`
    }

    let commentSuffix = ""
    // 读白名单 = 主目录 + 辅助目录，全部工作目录内不拦截
    const workDirs = workDirTool.getWorkDirs(metaData.listId)
    const isInProject = workDirs.some(dir => targetDir === dir.path || targetDir.startsWith(dir.path + pathLib.sep))
    if (!isInProject) {
      const userConfirm = await waitConfirm({
        type: "tip",
        content: `路径：${targetDir}`,
        title: "是否允许在工作目录外执行 codeSearch 工具？",
        listId: metaData.listId,
        ext: {
          identifier: `tool:${this.id}`,
          toolId: this.id
        }
      })
      if (!userConfirm.ok) return `用户拒绝在项目外搜索：${targetDir}。原因：${userConfirm.comment || "未提供"}`
      if (userConfirm.comment) commentSuffix = `用户备注：${userConfirm.comment}\n\n`
    }

    const maxLimit = maxResults || 50
    const timeoutMs = timeout || 15000

    // 3. 基础参数组装
    const args = ["--json"]

    // 注入高级防护控制参数
    if (maxFileSize && maxFileSize !== "0") {
      args.push("--max-filesize", maxFileSize.toUpperCase())
    }
    if (maxColumns && maxColumns > 0) {
      args.push("--max-columns", String(maxColumns))
      args.push("--max-columns-preview")
    }

    // 添加排除项 (自动剥离引号并确保 ! 前缀)
    if (excludes && excludes.length > 0) {
      for (const ex of excludes) {
        const raw = stripQuotes(ex)
        if (raw) {
          const finalEx = raw.startsWith("!") ? raw : `!${raw}`
          args.push("--glob", finalEx)
        }
      }
    }

    // 多 glob includes 支持 (自动剥离外层引号)
    if (includes) {
      const incList = Array.isArray(includes) ? includes : [includes]
      for (const inc of incList) {
        const raw = stripQuotes(inc)
        if (raw) {
          args.push("--glob", raw)
        }
      }
    }

    // 大小写控制
    if (caseSensitive) {
      args.push("--case-sensitive")
    } else {
      args.push("--ignore-case")
    }

    // 正则 vs 字面量精确匹配
    if (!isRegex) {
      args.push("--fixed-strings")
    }

    // 上下文行提取
    if (contextLines > 0) {
      args.push("--context", String(contextLines))
    }

    // PCRE2：支持前瞻/后顾/反向引用等高级语法
    if (pcre2) {
      args.push("--pcre2")
    }

    // 使用 -e 明确指定搜索模式，避免 query 以短横线开头时被误当作命令行选项
    args.push("-e", query)
    args.push("--", targetDir)

    return new Promise((resolve) => {
      let isDone = false
      let isTimeout = false
      let limitReached = false   // 已收满展示上限，转为“只计数不展示”以统计真实总量
      let matchCount = 0         // 总命中行数（含超限后继续累计）

      const fileSet = new Set()      // 文件清单模式：命中文件集合（自然结束时即全量）
      const matchFileSet = new Set() // 逐行模式：统计命中文件数（全量）
      const results = []
      let currentFileContexts = {}
      let currentFileMatches = []

      let errorMsg = ""
      const child = spawn(rgPath, args, { cwd: targetDir })

      child.on("error", (err) => {
        if (!isDone) {
          isDone = true
          clearTimeout(timer)
          resolve(commentSuffix + "搜索进程启动/执行异常：" + err.message)
        }
      })

      const timer = setTimeout(() => {
        if (!isDone) {
          isDone = true
          isTimeout = true
          try { child.kill("SIGTERM") } catch (e) { }
          resolveResult()
        }
      }, timeoutMs)

      const rl = readline.createInterface({ input: child.stdout })

      rl.on("line", (line) => {
        if (isDone) return
        if (!line.trim()) return

        try {
          const event = JSON.parse(line)

          if (event.type === "begin") {
            currentFileContexts = {}
            currentFileMatches = []
          } else if (event.type === "context" && matchPerLine && contextLines > 0) {
            let lineText = event.data.lines.text.replace(/\r?\n$/, "")
            const maxCols = maxColumns || 0
            if (maxCols > 0 && lineText.length > maxCols) {
              lineText = lineText.substring(0, maxCols) + ` ... (已截断, 超出 ${maxCols} 字符)`
            }
            currentFileContexts[event.data.line_number] = lineText
          } else if (event.type === "match") {
            // 标准跨平台相对路径转换
            const rawPath = event.data.path.text
            const relPath = pathLib.relative(targetDir, rawPath) || pathLib.basename(rawPath)

            if (!matchPerLine) {
              // 纯文件路径去重模式（省 Token）：不提前终止，持续收集到自然结束以统计真实文件总数
              fileSet.add(relPath)
              if (!limitReached && fileSet.size >= maxLimit) limitReached = true
            } else {
              // 逐行匹配详情模式
              matchCount++
              matchFileSet.add(relPath)
              if (limitReached) return // 展示已收满，仅继续累计总数，不再入库
              let lineText = event.data.lines.text.replace(/\r?\n$/, "")
              const maxCols = maxColumns || 0

              if (maxCols > 0 && lineText.length > maxCols) {
                const submatches = event.data.submatches || []
                let centerOffset = 0
                if (submatches.length > 0) {
                  // rg --json 的 submatch.start/end 是【字节】偏移，而 lines.text 是 JS 字符串(UTF-16)，
                  // 必须先换算成字符偏移再截取，否则含中文/emoji 的长行会切错位置甚至切碎字符
                  const [cs, ce] = byteRangeToCharRange(lineText, submatches[0].start, submatches[0].end)
                  centerOffset = Math.floor((cs + ce) / 2)
                } else {
                  centerOffset = Math.floor(lineText.length / 2)
                }

                const half = Math.floor(maxCols / 2)
                let startPos = centerOffset - half
                let endPos = centerOffset + half

                if (startPos < 0) {
                  endPos += Math.abs(startPos)
                  startPos = 0
                }
                if (endPos > lineText.length) {
                  startPos -= (endPos - lineText.length)
                  endPos = lineText.length
                  if (startPos < 0) startPos = 0
                }

                let prefix = startPos > 0 ? `...(距行首 ${startPos} 字符) ` : ""
                let suffix = endPos < lineText.length ? ` ...(后略 ${lineText.length - endPos} 字符)` : ""

                lineText = prefix + lineText.substring(startPos, endPos) + suffix
              }

              const item = {
                file: relPath,
                line: event.data.line_number,
                content: lineText.trim()
              }
              results.push(item)
              if (contextLines > 0) {
                currentFileMatches.push(item)
              }

              if (results.length >= maxLimit) {
                limitReached = true // 展示收满，转为只计数模式继续读到自然结束，以获取真实总量
              }
            }
          } else if (event.type === "end") {
            if (contextLines > 0 && currentFileMatches.length > 0) {
              for (const matchItem of currentFileMatches) {
                const targetLine = matchItem.line
                const ctxArr = []
                for (let i = targetLine - contextLines; i <= targetLine + contextLines; i++) {
                  if (i !== targetLine && currentFileContexts[i] !== undefined) {
                    ctxArr.push(`[L${i}] ${currentFileContexts[i]}`)
                  }
                }
                if (ctxArr.length > 0) {
                  matchItem.context = ctxArr
                }
              }
            }
            currentFileContexts = {}
            currentFileMatches = []
          }
        } catch (e) {
          // JSON Parse error, just ignore this line
        }
      })

      child.stderr.on("data", (data) => {
        errorMsg += data.toString()
      })

      child.on("close", (code) => {
        if (isDone) return
        isDone = true
        clearTimeout(timer)
        if (code === 1 && fileSet.size === 0 && results.length === 0) {
          resolve(commentSuffix + "未找到匹配内容。")
        } else if (code === 2 && fileSet.size === 0 && results.length === 0) {
          resolve(`搜索出错：${errorMsg || "进程异常退出"}`)
        } else {
          resolveResult()
        }
      })

      function resolveResult() {
        if (matchPerLine && contextLines > 0 && currentFileMatches.length > 0) {
          for (const matchItem of currentFileMatches) {
            const targetLine = matchItem.line
            const ctxArr = []
            for (let i = targetLine - contextLines; i <= targetLine + contextLines; i++) {
              if (i !== targetLine && currentFileContexts[i] !== undefined) {
                ctxArr.push(`[L${i}] ${currentFileContexts[i]}`)
              }
            }
            if (ctxArr.length > 0) {
              matchItem.context = ctxArr
            }
          }
          currentFileMatches = []
        }
        if (!matchPerLine) {
          if (fileSet.size === 0) {
            resolve(commentSuffix + (isTimeout ? "搜索超时，未找到匹配内容。" : "未找到匹配内容。"))
            return
          }
          const allFiles = Array.from(fileSet)
          const shownFiles = limitReached ? allFiles.slice(0, maxLimit) : allFiles
          let output = JSON.stringify(shownFiles, null, 2)
          if (limitReached) {
            output += `\n\n(注意：共 ${fileSet.size} 个文件命中，仅显示前 ${maxLimit} 个${isTimeout ? "；搜索超时，统计可能不完整" : ""})`
          } else if (isTimeout) {
            output += `\n\n(注意：搜索耗时超过 ${timeoutMs}ms，已强制终止，以上为部分结果且统计不完整)`
          } else {
            output += `\n\n(共 ${fileSet.size} 个文件命中，已全部显示)`
          }
          resolve(commentSuffix ? commentSuffix + output : output)
        } else {
          if (results.length === 0) {
            resolve(commentSuffix + (isTimeout ? "搜索超时，未找到匹配内容。" : "未找到匹配内容。"))
            return
          }
          let output = JSON.stringify(results, null, 2)
          if (limitReached) {
            output += `\n\n(注意：共命中 ${matchCount} 行 / ${matchFileSet.size} 个文件，仅显示前 ${maxLimit} 行${isTimeout ? "；搜索超时，统计可能不完整" : ""})`
          } else if (isTimeout) {
            output += `\n\n(注意：搜索耗时超过 ${timeoutMs}ms，已强制终止，以上为部分结果且统计不完整)`
          } else {
            output += `\n\n(共命中 ${matchCount} 行 / ${matchFileSet.size} 个文件，已全部显示)`
          }
          resolve(commentSuffix ? commentSuffix + output : output)
        }
      }
    })
  },

  joi() {
    return Joi.object({
      query: Joi.string().required().description("搜索内容"),
      searchDir: Joi.string().optional().description("限定目录(相对/绝对路径)"),
      includes: Joi.array().items(Joi.string()).optional().description("包含的 Glob 模式(如 [\"*.js\"])"),
      excludes: Joi.array().items(Joi.string()).default(["node_modules", ".git", "dist", "build", ".vscode", "*.min.js", "*.map", "*.bundle.js"]).description("排除的 Glob 模式"),
      isRegex: Joi.boolean().default(false).description("是否正则匹配"),
      caseSensitive: Joi.boolean().default(false).description("区分大小写"),
      pcre2: Joi.boolean().default(false).description("是否启用 PCRE2(支持前瞻/后顾/反向引用)"),
      matchPerLine: Joi.boolean().default(true).description("true返回匹配行详情, false仅返回文件名(省Token)"),
      contextLines: Joi.number().integer().min(0).max(10).default(6).description("上下文行数(默认6, 传0关闭)"),
      maxResults: Joi.number().integer().min(1).max(200).default(50).description("最大结果数"),
      maxFileSize: Joi.string().pattern(/^\d+[KMG]?$/i).default("2M").description("过滤超大文件(如 500K, 2M)"),
      maxColumns: Joi.number().integer().default(500).description("单行截断长度, 0不截断"),
      timeout: Joi.number().integer().min(1000).max(60000).default(15000).description("超时(ms)")
    })
  },

  getDoc() {
    return `
全局代码内容搜索工具。

【调用范例】：
1. 精确搜索：{ query: "createWindow", includes: ["*.js"] }
2. 空格语句与正则：{ query: "function handleUser", contextLines: 2 } 或 { query: "function\\\\s+handle\\\\w+", isRegex: true }
3. 仅需匹配文件清单：{ query: "import { spawn }", matchPerLine: false }

【行为说明】：
- 默认带前后各 6 行上下文（contextLines），传 contextLines:0 可关闭以节省 Token。
- 结果达到 maxResults 上限时不会立即截断，而是继续读完以统计真实总量，并附注“共命中 X 行 / Y 个文件，仅显示前 N 行”；命中量极大时受 timeout 兜底，统计可能不完整。
- 【正则须知】请勿使用 /pattern/flags 斜杠包裹写法(底层 rg 会把斜杠当字面量且不解析 flags)；大小写请用 caseSensitive 参数，高级语法(前瞻/后顾/反向引用)请开启 pcre2:true。

*注：如需按文件名模糊检索文件路径，请使用 fileFind 工具。
    `.trim()
  }
}
