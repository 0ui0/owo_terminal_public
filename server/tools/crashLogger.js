/* crashLogger.js - 主进程崩溃与错误日志采集器（全英文商业级诊断头 + 全目录扫描认领 + 脱敏 + 复用消息中心通知） */

import { app, BrowserWindow, screen } from "electron"
import fs from "fs-extra"
import os from "os"
import pathLib from "path"
import crypto from "crypto"
import { trs } from "./i18n.js"
import ioServer from "../ioServer/ioServer.js"
import tempPath from "./tempPath.js"

const MAX_BYTES = 5 * 1024 * 1024
const RING_LINES = 200
const MAX_PENDING_LINES = 2000
const MAX_ARCHIVED_CRASHES = 5
const FEEDBACK_URL = "https://www.o-o.space/?enter=1#!/feedback"

/* 落盘前统一脱敏，避免密钥与本机用户名泄露到公开反馈页 */
const SENSITIVE_RULES = [
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-***"],
  [/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***"],
  [/("?(?:secret|token|apiKey|api_key|password|authorization)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1***"],
  [/(cookie\s*[:=]\s*).*/gi, "$1***"],
  [/\/Users\/[^/\s]+/g, "/Users/***"],
  [/[A-Za-z]:\\Users\\[^\\\s]+/g, "C:\\Users\\***"]
]

const HEADER_START_MARK = "===== owo_terminal DIAGNOSTIC HEADER ====="
const HEADER_END_MARK = "=========================================="

const formatStamp = (tsNum) => {
  const d = new Date(tsNum || Date.now())
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const formatDuration = (secNum) => {
  const total = Math.max(0, Math.floor(secNum || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const toMB = (bytes) => `${Math.round((bytes || 0) / 1048576)}MB`
const toGB = (bytes) => `${((bytes || 0) / 1073741824).toFixed(2)}GB`

const crashLogger = {
  sessionId: crypto.randomUUID().slice(0, 8),
  logsRoot: "",
  crashesDir: "",
  latestLogPath: "",
  runningPath: "",
  port: 0,
  bytesWritten: 0,
  disabled: false,
  notifierBound: false,
  pendingStartup: [],
  ringBuffer: [],
  pendingReports: [],

  /* 初始化：便携模式确定 userData 之后调用，挂载流镜像与 4 项崩溃监听 */
  init() {
    try {
      const userDataDir = tempPath.getUserDataDir()
      this.logsRoot = pathLib.join(userDataDir, "logs")
      this.crashesDir = pathLib.join(this.logsRoot, "crashes")
      fs.ensureDirSync(this.logsRoot)
      fs.ensureDirSync(this.crashesDir)
    } catch (e) {
      this.disabled = true
    }
    this.mirrorStderr()
    this.mirrorStdout()
    this.bindCrashEvents()
  },

  /* 端口就绪后：全目录扫描认领所有已死亡实例的残留锁，再绑定当前端口目录 */
  bindPort(port) {
    if (this.disabled || !this.logsRoot) return
    this.port = port

    this.scanAndClaimCrashes()

    const dir = pathLib.join(this.logsRoot, String(port))
    try {
      fs.ensureDirSync(dir)
    } catch (e) {
      this.disabled = true
      return
    }

    const latestPath = pathLib.join(dir, "latest.log")
    const prevPath = pathLib.join(dir, "prev.log")
    const runningPath = pathLib.join(dir, ".running")

    if (fs.existsSync(latestPath)) {
      try {
        fs.moveSync(latestPath, prevPath, { overwrite: true })
      } catch (e) {}
    }

    this.latestLogPath = latestPath
    this.runningPath = runningPath
    this.bytesWritten = 0

    const header = this.buildDiagnosticHeader(port)

    try {
      fs.appendFileSync(latestPath, header, "utf-8")
      this.bytesWritten += Buffer.byteLength(header)
    } catch (e) {
      this.disabled = true
    }

    if (this.pendingStartup.length > 0 && !this.disabled) {
      const staged = this.pendingStartup.join("")
      this.pendingStartup = []
      try {
        const wrapped = "----- PRE-PORT LOGS -----\n" + staged + "----- END PRE-PORT LOGS -----\n"
        fs.appendFileSync(latestPath, wrapped, "utf-8")
        this.bytesWritten += Buffer.byteLength(wrapped)
      } catch (e) {
        this.disabled = true
      }
    }

    try {
      fs.writeJSONSync(runningPath, {
        pid: process.pid,
        version: app.getVersion(),
        port,
        startedAt: Date.now()
      })
    } catch (e) {}
  },

  /* 全目录扫描并认领所有已死亡实例的崩溃现场（跨端口、多实例同时崩溃均覆盖） */
  scanAndClaimCrashes() {
    if (!this.logsRoot || !fs.existsSync(this.logsRoot)) return
    const currentVersion = app.getVersion()

    try {
      fs.ensureDirSync(this.crashesDir)

      /* 1. 扫描所有端口子目录 */
      const entries = fs.readdirSync(this.logsRoot)
      for (const entry of entries) {
        if (entry === "crashes" || entry === "startup_crash.log") continue
        const subDir = pathLib.join(this.logsRoot, entry)
        let stat = null
        try {
          stat = fs.statSync(subDir)
        } catch (e) {
          continue
        }
        if (!stat.isDirectory()) continue

        const runningPath = pathLib.join(subDir, ".running")
        if (!fs.existsSync(runningPath)) continue

        let lastRun = null
        try {
          lastRun = fs.readJSONSync(runningPath)
        } catch (e) {
          try { fs.removeSync(runningPath) } catch (rmErr) {}
          continue
        }

        /* 进程仍然存活：属于正在运行的其他多开实例，绝不触碰 */
        if (this.isAlive(lastRun?.pid)) continue

        /* 进程已死亡：立刻删锁认领，防止其他实例重复提醒 */
        try {
          fs.removeSync(runningPath)
        } catch (e) {}

        /* 版本号不一致：属于自动更新升级杀掉的旧进程，不误报 */
        if (lastRun?.version && lastRun.version !== currentVersion) continue

        const latestPath = pathLib.join(subDir, "latest.log")
        if (!fs.existsSync(latestPath)) continue

        const crashTime = lastRun?.startedAt || Date.now()
        const archiveName = `crash_${formatStamp(crashTime)}_port${entry}.log`
        const archivePath = pathLib.join(this.crashesDir, archiveName)
        try {
          fs.moveSync(latestPath, archivePath, { overwrite: true })
          this.pendingReports.push({
            logPath: archivePath,
            logTail: this.readTail(archivePath, RING_LINES),
            port: String(entry),
            time: crashTime
          })
        } catch (e) {}
      }

      /* 2. 扫描端口未定阶段的兜底崩溃日志 */
      const startupCrashPath = pathLib.join(this.logsRoot, "startup_crash.log")
      if (fs.existsSync(startupCrashPath)) {
        let mtime = Date.now()
        try {
          mtime = fs.statSync(startupCrashPath).mtimeMs
        } catch (e) {}
        const archivePath = pathLib.join(this.crashesDir, `crash_${formatStamp(mtime)}_startup.log`)
        try {
          fs.moveSync(startupCrashPath, archivePath, { overwrite: true })
          this.pendingReports.push({
            logPath: archivePath,
            logTail: this.readTail(archivePath, RING_LINES),
            port: "startup",
            time: mtime
          })
        } catch (e) {}
      }

      /* 按时间倒序排列（最新崩溃排第一） */
      this.pendingReports.sort((a, b) => (b.time || 0) - (a.time || 0))

      /* 清理过旧的归档崩溃文件，只保留最近 MAX_ARCHIVED_CRASHES 份 */
      this.pruneArchivedCrashes()
    } catch (e) {}
  },

  pruneArchivedCrashes() {
    try {
      if (!fs.existsSync(this.crashesDir)) return
      const files = fs.readdirSync(this.crashesDir)
        .filter(name => name.endsWith(".log"))
        .map(name => {
          const full = pathLib.join(this.crashesDir, name)
          let mtime = 0
          try { mtime = fs.statSync(full).mtimeMs } catch (e) {}
          return { full, mtime }
        })
        .sort((a, b) => b.mtime - a.mtime)

      for (let i = MAX_ARCHIVED_CRASHES; i < files.length; i++) {
        try { fs.removeSync(files[i].full) } catch (e) {}
      }
    } catch (e) {}
  },

  isAlive(pid) {
    if (!pid || typeof pid !== "number") return false
    try {
      process.kill(pid, 0)
      return true
    } catch (e) {
      return false
    }
  },

  /* 采集全英文启动级系统与硬件诊断头（不含任何个人识别信息，全量脱敏） */
  buildDiagnosticHeader(port) {
    const lines = [HEADER_START_MARK]
    const now = new Date()
    const tzOffsetMin = -now.getTimezoneOffset()
    const tzSign = tzOffsetMin >= 0 ? "+" : "-"
    const tzH = String(Math.floor(Math.abs(tzOffsetMin) / 60)).padStart(2, "0")
    const tzM = String(Math.abs(tzOffsetMin) % 60).padStart(2, "0")

    let appVersion = "unknown"
    let appName = "owo_terminal"
    let isPackaged = false
    let locale = "unknown"
    let userDataPath = ""
    let isPortable = false
    try {
      appVersion = app.getVersion()
      appName = app.getName()
      isPackaged = app.isPackaged
      locale = app.getLocale?.() || "unknown"
      userDataPath = app.getPath("userData")
      isPortable = pathLib.basename(userDataPath) === "owo_data"
    } catch (e) {}

    lines.push(`Timestamp: ${now.toISOString()} (UTC${tzSign}${tzH}:${tzM})`)
    lines.push(`App: ${appName} v${appVersion} | packaged=${isPackaged} | mode=${isPortable ? "portable" : "standard"} | locale=${locale}`)
    lines.push(`Session: id=${this.sessionId} | pid=${process.pid} | port=${port || "unbound"}`)
    lines.push(`Runtime: electron=${process.versions.electron || "-"} | chrome=${process.versions.chrome || "-"} | node=${process.versions.node || "-"} | v8=${process.versions.v8 || "-"}`)

    try {
      const sysVer = typeof process.getSystemVersion === "function" ? process.getSystemVersion() : ""
      lines.push(`OS: ${process.platform} ${process.arch} | ${os.type()} ${os.release()}${sysVer ? ` (systemVersion=${sysVer})` : ""} | osUptime=${formatDuration(os.uptime())}`)
    } catch (e) {}

    try {
      const cpus = os.cpus() || []
      const model = cpus[0]?.model?.trim() || "unknown"
      const speed = cpus[0]?.speed ? `${cpus[0].speed}MHz` : "-"
      const load = os.loadavg ? os.loadavg().map(n => n.toFixed(2)).join("/") : "-"
      lines.push(`CPU: ${model} x${cpus.length} (${speed}) | loadavg(1/5/15m)=${load}`)
    } catch (e) {}

    try {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedPct = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0
      lines.push(`Memory: total=${toGB(totalMem)} | free=${toGB(freeMem)} | used=${usedPct}%`)
    } catch (e) {}

    try {
      if (userDataPath && typeof fs.statfsSync === "function") {
        const statfs = fs.statfsSync(userDataPath)
        const totalDisk = statfs.blocks * statfs.bsize
        const freeDisk = statfs.bavail * statfs.bsize
        lines.push(`Disk(userData): free=${toGB(freeDisk)} / total=${toGB(totalDisk)}`)
      }
    } catch (e) {}

    try {
      if (app.isReady()) {
        const displays = screen.getAllDisplays() || []
        const dispText = displays.map((d, idx) =>
          `#${idx + 1}:${d.size.width}x${d.size.height}@${d.scaleFactor}x`
        ).join(", ")
        lines.push(`Displays(${displays.length}): ${dispText || "-"}`)
      }
    } catch (e) {}

    try {
      const gpu = app.getGPUFeatureStatus?.()
      if (gpu) {
        const keys = ["gpu_compositing", "2d_canvas", "webgl", "webgl2", "video_decode"]
        const gpuSummary = keys.filter(k => gpu[k]).map(k => `${k}=${gpu[k]}`).join(" ")
        if (gpuSummary) lines.push(`GPU: ${gpuSummary}`)
      }
    } catch (e) {}

    try {
      lines.push(`Paths: userData=${this.sanitize(userDataPath)} | cwd=${this.sanitize(process.cwd())}`)
    } catch (e) {}

    lines.push(HEADER_END_MARK)
    return lines.join("\n") + "\n"
  },

  /* 采集崩溃瞬间动态诊断信息（全英文：多进程内存、窗口列表、系统实时资源） */
  buildCrashRuntimeSnapshot() {
    const lines = []
    try {
      const mem = process.memoryUsage()
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const load = os.loadavg ? os.loadavg().map(n => n.toFixed(2)).join("/") : "-"
      lines.push(`Session: id=${this.sessionId} | uptime=${formatDuration(process.uptime())} | port=${this.port || "unbound"} | pid=${process.pid}`)
      lines.push(`MainMemory: rss=${toMB(mem.rss)} heapUsed=${toMB(mem.heapUsed)}/${toMB(mem.heapTotal)} external=${toMB(mem.external)} arrayBuffers=${toMB(mem.arrayBuffers)}`)
      lines.push(`SystemMemory: free=${toGB(freeMem)} / total=${toGB(totalMem)} | loadavg=${load}`)
    } catch (e) {}

    try {
      if (typeof app.getAppMetrics === "function") {
        const metrics = app.getAppMetrics() || []
        if (metrics.length > 0) {
          lines.push(`ElectronProcesses(${metrics.length}):`)
          for (const m of metrics) {
            const wsMB = m.memory?.workingSetSize ? `${Math.round(m.memory.workingSetSize / 1024)}MB` : "-"
            const cpuPct = typeof m.cpu?.percentCPUUsage === "number" ? `${m.cpu.percentCPUUsage.toFixed(1)}%` : "-"
            const namePart = m.serviceName || m.name || ""
            lines.push(`  - [${m.type}${namePart ? ":" + namePart : ""}] pid=${m.pid} mem=${wsMB} cpu=${cpuPct}`)
          }
        }
      }
    } catch (e) {}

    try {
      const wins = BrowserWindow.getAllWindows() || []
      if (wins.length > 0) {
        lines.push(`OpenWindows(${wins.length}):`)
        for (const w of wins) {
          try {
            const bounds = w.getBounds()
            const url = this.sanitize(w.webContents?.getURL?.() || "")
            lines.push(`  - winId=${w.winId || w.id} size=${bounds.width}x${bounds.height} minimized=${w.isMinimized()} url=${url}`)
          } catch (winErr) {}
        }
      }
    } catch (e) {}

    return lines
  },

  /* 提取日志文件顶部的诊断头块，保证裁剪或复制末尾 200 行时始终保留环境信息 */
  extractHeaderBlock(text) {
    if (!text) return ""
    const startIdx = text.indexOf(HEADER_START_MARK)
    if (startIdx < 0) return ""
    const endIdx = text.indexOf(HEADER_END_MARK, startIdx)
    if (endIdx < 0) return ""
    return text.slice(startIdx, endIdx + HEADER_END_MARK.length)
  },

  formatErrorDetail(err) {
    if (!err) return "(empty error)"
    if (typeof err === "string") return err
    const parts = []
    if (err.name || err.code || err.errno) {
      parts.push(`[${err.name || "Error"}${err.code ? " code=" + err.code : ""}${err.errno ? " errno=" + err.errno : ""}]`)
    }
    parts.push(err.stack || err.message || String(err))
    if (err.cause) {
      parts.push(`Caused by: ${this.formatErrorDetail(err.cause)}`)
    }
    return parts.join("\n")
  },

  readTail(logPath, lineCount = RING_LINES) {
    try {
      const fullText = fs.readFileSync(logPath, "utf-8")
      const arr = fullText.split("\n")
      if (arr.length <= lineCount) return fullText
      const tailText = arr.slice(arr.length - lineCount).join("\n")
      const headerBlock = this.extractHeaderBlock(fullText)
      if (headerBlock && !tailText.includes(HEADER_START_MARK)) {
        return `${headerBlock}\n... (omitted ${arr.length - lineCount} intermediate lines) ...\n${tailText}`
      }
      return tailText
    } catch (e) {
      return ""
    }
  },

  /* 镜像 stderr：不动 console，原样透传返回值，写盘失败静默停写防递归 */
  mirrorStderr() {
    if (!process.stderr || typeof process.stderr.write !== "function") return
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk, encoding, callback) => {
      let result = true
      try {
        result = originalWrite(chunk, encoding, callback)
      } catch (e) {
        result = true
      }
      this.write(this.toText(chunk))
      return result
    }
  },

  /* 镜像 stdout：仅写入内存环形缓冲，零日常磁盘 IO */
  mirrorStdout() {
    if (!process.stdout || typeof process.stdout.write !== "function") return
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk, encoding, callback) => {
      let result = true
      try {
        result = originalWrite(chunk, encoding, callback)
      } catch (e) {
        result = true
      }
      this.pushRing(this.toText(chunk))
      return result
    }
  },

  toText(chunk) {
    if (typeof chunk === "string") return chunk
    try {
      return Buffer.from(chunk).toString("utf-8")
    } catch (e) {
      return ""
    }
  },

  pushRing(text) {
    const lines = String(text).split("\n")
    for (const line of lines) {
      if (!line) continue
      this.ringBuffer.push(line)
    }
    if (this.ringBuffer.length > RING_LINES) {
      this.ringBuffer.splice(0, this.ringBuffer.length - RING_LINES)
    }
  },

  sanitize(text) {
    let out = String(text)
    for (const [pattern, replacement] of SENSITIVE_RULES) {
      out = out.replace(pattern, replacement)
    }
    return out
  },

  write(text, options = {}) {
    if (this.disabled) return
    const content = this.sanitize(text)
    if (!content) return

    if (!this.latestLogPath) {
      this.pendingStartup.push(content)
      if (this.pendingStartup.length > MAX_PENDING_LINES) {
        this.pendingStartup.shift()
      }
      return
    }

    try {
      if (!options.fromCrash) this.maybeTrim()
      fs.appendFileSync(this.latestLogPath, content, "utf-8")
      this.bytesWritten += Buffer.byteLength(content)
    } catch (e) {
      this.disabled = true
    }
  },

  /* 超过 5MB 时裁掉中间旧内容，始终保留顶部诊断头与最新后半段 */
  maybeTrim() {
    if (this.bytesWritten <= MAX_BYTES) return
    try {
      const text = fs.readFileSync(this.latestLogPath, "utf-8")
      const headerBlock = this.extractHeaderBlock(text)
      const middle = Math.floor(text.length / 2)
      const cutIndex = text.lastIndexOf("\n", middle)
      const tail = cutIndex > -1 ? text.slice(cutIndex + 1) : text
      const mark = `[${new Date().toISOString()}] Log size limit reached; truncated older entries while preserving header\n`
      const next = (headerBlock ? headerBlock + "\n" : "") + mark + tail
      fs.writeFileSync(this.latestLogPath, next, "utf-8")
      this.bytesWritten = Buffer.byteLength(next)
    } catch (e) {
      this.disabled = true
    }
  },

  writeStartupCrash(text) {
    try {
      if (!this.logsRoot) return
      fs.ensureDirSync(this.logsRoot)
      const file = pathLib.join(this.logsRoot, "startup_crash.log")
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
        fs.removeSync(file)
      }
      const needHeader = !fs.existsSync(file) || fs.statSync(file).size === 0
      const payload = (needHeader ? this.buildDiagnosticHeader(0) : "") + this.sanitize(text)
      fs.appendFileSync(file, payload, "utf-8")
    } catch (e) {
      this.disabled = true
    }
  },

  recordCrash(label, err) {
    const runtimeLines = this.buildCrashRuntimeSnapshot()
    const body = [
      "",
      "================ CRASH EVENT ================",
      `Type: ${label}`,
      `Timestamp: ${new Date().toISOString()}`,
      ...runtimeLines,
      `ErrorDetail:\n${this.formatErrorDetail(err)}`,
      "--------- LAST 200 STDOUT LINES ---------",
      ...this.ringBuffer,
      "=============================================",
      ""
    ].join("\n")

    if (this.latestLogPath) {
      this.write(body, { fromCrash: true })
    } else {
      this.writeStartupCrash(body)
    }
  },

  recordStartupFailure(err) {
    const runtimeLines = this.buildCrashRuntimeSnapshot()
    const body = [
      "",
      "============ STARTUP FAILURE ============",
      `Timestamp: ${new Date().toISOString()}`,
      ...runtimeLines,
      `ErrorDetail:\n${this.formatErrorDetail(err)}`,
      "--------- STAGED STARTUP LOGS ---------",
      ...this.pendingStartup.map(item => item.trimEnd()),
      "=========================================",
      ""
    ].join("\n")
    this.pendingStartup = []
    this.writeStartupCrash(body)
  },

  bindCrashEvents() {
    process.on("uncaughtException", (err) => {
      this.recordCrash("uncaughtException", err)
      app.exit(1)
    })

    process.on("unhandledRejection", (reason) => {
      this.recordCrash("unhandledRejection", reason)
    })

    app.on("render-process-gone", (event, webContents, details) => {
      const url = webContents?.getURL?.() || ""
      this.recordCrash("render-process-gone", `reason=${details?.reason} exitCode=${details?.exitCode} url=${url}`)
    })

    app.on("child-process-gone", (event, details) => {
      this.recordCrash("child-process-gone", `type=${details?.type} reason=${details?.reason} exitCode=${details?.exitCode}`)
    })
  },

  /* 等首个前端连上后通过 sys:pushMessage 广播一次崩溃通知（复用 Notice 路径模型弹窗） */
  attachNotifier() {
    if (this.pendingReports.length === 0 || this.notifierBound) return
    const io = ioServer.io
    if (!io) return
    this.notifierBound = true

    const pushOnce = () => {
      io.off("connection", pushOnce)
      if (this.pendingReports.length === 0) return
      const reportsSnapshot = [...this.pendingReports]
      this.pendingReports = []
      const countNum = reportsSnapshot.length

      io.emit("sys:pushMessage", {
        id: crypto.randomUUID(),
        title: countNum > 1
          ? trs("系统/崩溃/多实例异常退出", {
              cn: `检测到上次有 ${countNum} 个实例异常退出`,
              en: `${countNum} previous instances exited abnormally`
            })
          : trs("系统/崩溃/上次异常退出", {
              cn: "检测到上次异常退出",
              en: "Previous crash detected"
            }),
        type: "error",
        content: trs("系统/崩溃/提示内容", {
          cn: "点击查看脱敏后的错误日志，或一键复制并前往反馈页面。",
          en: "Click to view sanitized crash logs or copy and open the feedback page."
        }),
        time: Date.now(),
        isRead: false,
        tag: "sys-crash",
        merge: "cover",
        action: {
          type: "notice",
          args: {
            sign: "sys_crash_report_dialog",
            tip: trs("系统/崩溃/标题", { cn: "崩溃报告", en: "Crash Report" }),
            hideBtn: 2,
            useMinus: false,
            contentPath: "/src/view/common/CrashReportDialog.js",
            contentAttrs: {
              reports: reportsSnapshot,
              logPath: reportsSnapshot[0].logPath,
              logTail: reportsSnapshot[0].logTail,
              feedbackUrl: FEEDBACK_URL
            }
          }
        }
      })
    }

    io.on("connection", pushOnce)
  },

  /* 正常退出：删除当前实例的运行锁文件 */
  markCleanExit() {
    this.pendingReports = []
    if (!this.runningPath) return
    try {
      if (fs.existsSync(this.runningPath)) {
        fs.removeSync(this.runningPath)
      }
    } catch (e) {}
  }
}

export default crashLogger
