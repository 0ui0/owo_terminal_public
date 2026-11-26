import fs from "fs/promises"
import fsSync from "fs"
import pathLib from "path"
import { spawn } from "child_process"
import axios from "axios"
import tempPath from "../tempPath.js"
import workDirTool from "../workDirTool.js"
import { trs } from "../i18n.js"

const state = {
  status: "stopped", // "stopped" | "initializing" | "starting" | "running" | "error"
  process: null,
  port: 2222,
  pid: null,
  privateKey: null,
  initPromise: null,
  startPromise: null,
  errorMsg: null,
  downloading: {
    image: null,
    qemuSrc: null
  },
  downloadControllers: {
    image: null,
    qemuSrc: null
  },
  // 最近一次起下时锁定的源（只用于展示，绝不参与任何中途决策）
  lastProbe: {
    image: null,
    qemuSrc: null
  },
  consoleListeners: new Set()
}

let consoleLogs = ""
const MAX_CONSOLE_LENGTH = 50000

const appendConsoleLog = (chunk) => {
  const str = String(chunk || "")
  consoleLogs += str
  if (consoleLogs.length > MAX_CONSOLE_LENGTH) {
    consoleLogs = consoleLogs.slice(consoleLogs.length - MAX_CONSOLE_LENGTH)
  }
  for (const listener of state.consoleListeners) {
    try { listener(str) } catch (e) {}
  }
}

const getPaths = () => {
  const runtimeDir = tempPath.getUserVmDir()
  return {
    runtimeDir,
    binDir: pathLib.join(runtimeDir, "bin"),
    imageDir: pathLib.join(runtimeDir, "image"),
    qemuDir: pathLib.join(runtimeDir, "qemu"),
    downloadDir: pathLib.join(runtimeDir, "download"),
    biosDir: pathLib.join(runtimeDir, "pc-bios"),
    manifestPath: pathLib.join(runtimeDir, "manifest.json")
  }
}

// 检查本地已就绪的 QEMU 源码包
const getQemuSrcInfo = () => {
  const paths = getPaths()
  if (!fsSync.existsSync(paths.qemuDir)) {
    return {
      ok: false,
      msg: trs("虚机/错误/未找到源码目录", {
        cn: `未找到源码目录: ${paths.qemuDir}`,
        en: `Source directory not found: ${paths.qemuDir}`
      })
    }
  }
  try {
    const items = fsSync.readdirSync(paths.qemuDir).filter(f => !f.startsWith(".") && (f.endsWith(".tar.xz") || f.endsWith(".tar.gz") || f.endsWith(".tar.bz2") || f.endsWith(".zip") || f.endsWith(".tgz")))
    if (items.length === 0) {
      return {
        ok: false,
        msg: trs("虚机/错误/未找到源码包", {
          cn: "源码目录下未找到 QEMU 源码压缩包",
          en: "No source archive found in qemu directory"
        })
      }
    }
    const fullPath = pathLib.join(paths.qemuDir, items[0])
    if (fsSync.statSync(fullPath).isFile()) {
      return { ok: true, srcPath: fullPath, srcName: items[0] }
    }
    return { ok: false, msg: "未找到有效的源码压缩包" }
  } catch (e) {
    return { ok: false, msg: e.message }
  }
}

// 智能多源资产映射表
// 备用源必须是"同一个文件的另一面镜子": 同构、同字节。
// 异构封装（例如 vagrant 的 .box）一律不得混进来，换源不能跨格式拼接。
const ASSET_SOURCES = {
  image: {
    aarch64: {
      name: "alpine-base-aarch64.qcow2",
      targetSubDir: "image",
      magic: [0x51, 0x46, 0x49, 0xfb], // 'QFI\xfb'
      // 母盘放在自家 Release 里，裸 qcow2 直下；ghproxy 前缀是同一个文件的国内镜像
      urls: [
        "https://github.com/0ui0/owo_terminal_source/releases/download/assets-v1.0.0/alpine-base-aarch64.qcow2",
        "https://ghproxy.net/https://github.com/0ui0/owo_terminal_source/releases/download/assets-v1.0.0/alpine-base-aarch64.qcow2"
      ]
    },
    x86_64: {
      name: "alpine-base-x86_64.qcow2",
      targetSubDir: "image",
      magic: [0x51, 0x46, 0x49, 0xfb],
      urls: [
        "https://github.com/0ui0/owo_terminal_source/releases/download/assets-v1.0.0/alpine-base-x86_64.qcow2",
        "https://ghproxy.net/https://github.com/0ui0/owo_terminal_source/releases/download/assets-v1.0.0/alpine-base-x86_64.qcow2"
      ]
    }
  },
  qemuSrc: {
    all: {
      name: "qemu-11.1.3.tar.xz",
      targetSubDir: "qemu",
      magic: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], // 0xFD 7zXZ 0x00
      urls: [
        "https://download.qemu.org/qemu-11.1.3.tar.xz"
      ]
    }
  }
}

// 源展示名：把域名翻译成人一眼能看懂的中文标签
const SOURCE_LABELS = {
  "github.com": "GitHub 官方",
  "fastly.jsdelivr.net": "jsdelivr 加速",
  "ghproxy.net": "ghproxy 镜像",
  "mirrors.tuna.tsinghua.edu.cn": "清华镜像",
  "mirrors.aliyun.com": "阿里云镜像",
  "download.qemu.org": "QEMU 官方"
}

const getSourceLabel = (url) => {
  const hostName = new URL(url).hostname
  return SOURCE_LABELS[hostName] || hostName
}

const formatSpeed = (bytesPerSec) => {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  }
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
}

// 短窗实速采样：只认"真实到手字节数 ÷ 历时"，不看连通性也不看延迟
// 首字节到达之后才开始计时窗口：握手与重定向的耗时属于"启动成本"，不能算作吞吐
// 4xx/5xx 是"源不存在或被拒"，与"慢"是两码事，单独标记为不可用
const PROBE_WINDOW_MS = 1500
const PROBE_FIRST_BYTE_TIMEOUT_MS = 10000
const PROBE_MAX_BYTES = 8 * 1024 * 1024

const probeOneSource = (url) => {
  return new Promise((resolve) => {
    const controller = new AbortController()
    let firstByteAt = 0
    let receivedBytes = 0
    let isSettled = false
    let windowTimer = null
    const settle = (failureReason) => {
      if (isSettled) return
      isSettled = true
      if (windowTimer) clearTimeout(windowTimer)
      clearTimeout(firstByteTimer)
      controller.abort()
      const costMs = firstByteAt > 0 ? Date.now() - firstByteAt : 0
      resolve({
        url,
        receivedBytes,
        costMs,
        bytesPerSec: costMs > 0 ? (receivedBytes / costMs) * 1000 : 0,
        isUsable: !failureReason && receivedBytes > 0,
        failureReason: failureReason || ""
      })
    }
    const firstByteTimer = setTimeout(() => settle("首字节等待超时"), PROBE_FIRST_BYTE_TIMEOUT_MS)
    axios({
      method: "get",
      url,
      responseType: "stream",
      signal: controller.signal,
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { Range: `bytes=0-${PROBE_MAX_BYTES - 1}` }
    }).then((response) => {
      if (response.status < 200 || response.status >= 300) {
        response.data.resume()
        settle(`源返回 HTTP ${response.status}`)
        return
      }
      response.data.on("data", (chunk) => {
        if (!firstByteAt) {
          firstByteAt = Date.now()
          clearTimeout(firstByteTimer)
          windowTimer = setTimeout(() => settle(""), PROBE_WINDOW_MS)
        }
        receivedBytes += chunk.length
        if (receivedBytes >= PROBE_MAX_BYTES) settle("")
      })
      response.data.on("end", () => settle(""))
      response.data.on("error", () => settle("响应中断"))
    }).catch((err) => {
      settle(err.message)
    })
  })
}

// 串行测量：并行采样会互相抢同一条出口带宽，测出来的名次不可信
let probeQueue = Promise.resolve()

const probeSources = (urls, onProbe) => {
  const run = probeQueue.then(async () => {
    const candidates = []
    for (const url of urls) {
      const measured = await probeOneSource(url)
      const label = getSourceLabel(url)
      candidates.push({ ...measured, label })
      if (typeof onProbe === "function") {
        onProbe({ url, label, speedText: formatSpeed(measured.bytesPerSec) })
      }
    }
    const ranked = candidates
      .filter((item) => item.isUsable)
      .sort((a, b) => b.bytesPerSec - a.bytesPerSec)
    const rejected = candidates.filter((item) => !item.isUsable)
    return { ranked, rejected, best: ranked[0] || null, measuredAt: Date.now() }
  })
  probeQueue = run.then(() => {}, () => {})
  return run
}

const getQemuImageInfo = () => {
  const paths = getPaths()
  if (!fsSync.existsSync(paths.imageDir)) {
    return {
      ok: false,
      msg: trs("虚机/错误/未找到镜像目录", {
        cn: `未找到镜像目录: ${paths.imageDir}`,
        en: `Image directory not found: ${paths.imageDir}`
      })
    }
  }
  try {
    const items = fsSync.readdirSync(paths.imageDir).filter(f => !f.startsWith("."))
    if (items.length === 0) {
      return {
        ok: false,
        msg: trs("虚机/错误/镜像未安装", {
          cn: "系统镜像未就绪：image 目录下未找到系统镜像文件",
          en: "System image not ready: no image file found in image directory"
        })
      }
    }
    if (items.length > 1) {
      return {
        ok: false,
        msg: trs("虚机/错误/多镜像冲突", {
          cn: `镜像目录异常：image 目录下检测到 ${items.length} 个文件 [${items.join(", ")}]，系统要求必须有且仅有 1 份系统镜像，请清理多余文件`,
          en: `Image directory error: detected ${items.length} files [${items.join(", ")}], exactly 1 image file is required. Please clean up extra files`
        })
      }
    }
    const fullPath = pathLib.join(paths.imageDir, items[0])
    const st = fsSync.statSync(fullPath)
    if (!st.isFile()) {
      return {
        ok: false,
        msg: trs("虚机/错误/无效镜像文件", {
          cn: `系统镜像路径异常：${items[0]} 是目录而非有效镜像文件`,
          en: `System image path error: ${items[0]} is a directory, not a valid image file`
        })
      }
    }
    return {
      ok: true,
      msg: trs("虚机/状态/镜像就绪", {
        cn: "系统镜像就绪",
        en: "System image ready"
      }),
      data: { imagePath: fullPath, imageName: items[0] }
    }
  } catch (e) {
    return {
      ok: false,
      msg: trs("虚机/错误/读取镜像失败", {
        cn: `读取镜像目录失败: ${e.message}`,
        en: `Failed to read image directory: ${e.message}`
      })
    }
  }
}

const readManifest = (manifestPath) => {
  try {
    if (fsSync.existsSync(manifestPath)) {
      return JSON.parse(fsSync.readFileSync(manifestPath, "utf8"))
    }
  } catch (e) {}
  return {
    version: "1.0.0",
    imageVersion: "3.20.9",
    qemuVersion: "11.1.3",
    cpus: 2,
    memory: 2048
  }
}

// 绑定全局退出监听，确保主进程退出时强制清理 QEMU 子进程（防孤儿进程）
let exitHookRegistered = false
const registerExitHooks = () => {
  if (exitHookRegistered) return
  exitHookRegistered = true

  const cleanup = () => {
    if (state.process) {
      try {
        state.process.kill("SIGKILL")
      } catch (e) {}
      state.process = null
    }
  }

  process.once("exit", cleanup)
  process.once("SIGINT", cleanup)
  process.once("SIGTERM", cleanup)
}

const getQemuBinInfo = () => {
  const paths = getPaths()
  if (!fsSync.existsSync(paths.binDir)) {
    return {
      ok: false,
      msg: trs("虚机/错误/未找到引擎目录", {
        cn: `未找到引擎目录: ${paths.binDir}`,
        en: `Engine directory not found: ${paths.binDir}`
      })
    }
  }
  try {
    const items = fsSync.readdirSync(paths.binDir).filter(f => !f.startsWith("."))
    if (items.length === 0) {
      return {
        ok: false,
        msg: trs("虚机/错误/引擎未安装", {
          cn: "QEMU 引擎未安装：bin 目录下未找到可执行程序",
          en: "QEMU engine not installed: no executable found in bin directory"
        })
      }
    }
    if (items.length > 1) {
      return {
        ok: false,
        msg: trs("虚机/错误/多文件异常", {
          cn: `QEMU 引擎目录异常：bin 目录下检测到 ${items.length} 个文件 [${items.join(", ")}]，系统要求必须有且仅有 1 个可执行文件，请清理多余文件`,
          en: `QEMU engine directory error: detected ${items.length} files [${items.join(", ")}] in bin directory, exactly 1 executable is required. Please clean up extra files`
        })
      }
    }
    const fullPath = pathLib.join(paths.binDir, items[0])
    const st = fsSync.statSync(fullPath)
    if (!st.isFile()) {
      return {
        ok: false,
        msg: trs("虚机/错误/无效文件", {
          cn: `QEMU 引擎路径异常：${items[0]} 是目录而非可执行文件`,
          en: `QEMU engine path error: ${items[0]} is a directory, not an executable file`
        })
      }
    }
    return {
      ok: true,
      msg: trs("虚机/状态/引擎就绪", {
        cn: "QEMU 引擎就绪",
        en: "QEMU engine ready"
      }),
      data: { binPath: fullPath, binName: items[0] }
    }
  } catch (e) {
    return {
      ok: false,
      msg: trs("虚机/错误/读取目录失败", {
        cn: `读取引擎目录失败: ${e.message}`,
        en: `Failed to read engine directory: ${e.message}`
      })
    }
  }
}

const getQemuBinPath = () => {
  const res = getQemuBinInfo()
  if (res.ok) {
    return res.data.binPath
  }
  return null
}

const getQemuBinName = () => {
  const res = getQemuBinInfo()
  if (res.ok) {
    return res.data.binName
  }
  return "qemu-system-xxx"
}

export default {
  getQemuBinName,
  getQemuBinPath,
  getQemuBinInfo,
  getQemuImageInfo,

  isQemuBinReady() {
    const res = getQemuBinInfo()
    return res.ok
  },

  isQemuImageReady() {
    const res = getQemuImageInfo()
    return res.ok
  },

  getStatus() {
    const paths = getPaths()
    const isInitialized = fsSync.existsSync(paths.manifestPath)
    const manifest = readManifest(paths.manifestPath)
    const isBinReady = this.isQemuBinReady()
    const isImageReady = this.isQemuImageReady()
    const isSrcReady = getQemuSrcInfo().ok
    return {
      status: state.status,
      isInitialized,
      isBinReady,
      isImageReady,
      isSrcReady,
      lastProbe: state.lastProbe,
      downloading: state.downloading,
      port: state.port,
      pid: state.pid,
      errorMsg: state.errorMsg,
      cpus: Number(manifest.cpus) || 2,
      memory: Number(manifest.memory) || 2048,
      imageVersion: manifest.imageVersion || "3.20.9",
      qemuVersion: manifest.qemuVersion || "11.1.3"
    }
  },

  isQemuSrcReady() {
    return getQemuSrcInfo().ok
  },

  getQemuSrcInfo,

  async isInitialized() {
    const paths = getPaths()
    try {
      await fs.access(paths.manifestPath)
      return true
    } catch (e) {
      return false
    }
  },

  async init({ onLog } = {}) {
    if (state.initPromise) return state.initPromise

    state.initPromise = (async () => {
      const paths = getPaths()
      state.status = "initializing"
      state.errorMsg = null

      const log = (msg) => {
        if (typeof onLog === "function") onLog(msg)
      }

      try {
        log(">>> [owo-vm] 初始化微虚拟机隔离沙箱运行骨架 (owo_data/vm)...")

        // 写入初始清单文件
        const manifest = {
          version: "1.0.0",
          imageVersion: "3.20.9",
          qemuVersion: "11.1.3",
          cpus: 2,
          memory: 2048,
          installedAt: Date.now(),
          updatedAt: Date.now(),
          platform: process.platform,
          arch: process.arch
        }
        await fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf8")

        log(">>> [owo-vm] 微虚拟机运行骨架初始化完成！")
        state.status = "stopped"
        return {
          ok: true,
          msg: trs("虚机/提示/初始化成功", {
            cn: "微虚拟机初始化部署成功",
            en: "MicroVM initialization and deployment successful"
          })
        }
      } catch (err) {
        state.status = "error"
        state.errorMsg = err.message
        log(`❌ [owo-vm 错误] 部署失败: ${err.message}`)
        return {
          ok: false,
          msg: trs("虚机/错误/初始化失败", {
            cn: `微虚拟机初始化失败: ${err.message}`,
            en: `MicroVM initialization failed: ${err.message}`
          })
        }
      } finally {
        state.initPromise = null
      }
    })()

    return state.initPromise
  },

  // 核心资产下载：起下实测择优并锁定单一源，锁定后不再因速度换源
  async downloadAsset(assetType, { onProgress, io } = {}) {
    if (state.downloading[assetType]) {
      return {
        ok: false,
        msg: trs("虚机/提示/正在下载中", {
          cn: "当前资产正在下载中，请勿重复操作",
          en: "Asset download already in progress"
        })
      }
    }
    const paths = getPaths()
    const isArm64 = process.arch === "arm64"
    const archKey = isArm64 ? "aarch64" : "x86_64"
    const sourceConfig = assetType === "image" ? ASSET_SOURCES.image[archKey] : ASSET_SOURCES.qemuSrc.all
    if (!sourceConfig) {
      return { ok: false, msg: `未找到资产 ${assetType} 的适配下载源` }
    }

    const targetDir = pathLib.join(paths.runtimeDir, sourceConfig.targetSubDir)
    const finalFilePath = pathLib.join(targetDir, sourceConfig.name)
    const tmpFilePath = pathLib.join(paths.downloadDir, `${sourceConfig.name}.download`)

    const controller = new AbortController()
    state.downloadControllers[assetType] = controller

    state.downloading[assetType] = {
      assetType,
      fileName: sourceConfig.name,
      loaded: 0,
      total: 0,
      percent: 0,
      speed: "0 KB/s",
      status: "probing",
      sourceLabel: "",
      notice: "正在实测各源速度…"
    }

    const broadcast = (extra = {}) => {
      if (!state.downloading[assetType]) return
      Object.assign(state.downloading[assetType], extra)
      if (typeof onProgress === "function") onProgress(state.downloading[assetType])
      if (io) {
        io.emit("app:dispatch", {
          appId: "*",
          action: "vmDownloadProgress",
          args: state.downloading[assetType]
        })
      }
    }

    // 起下即锁定：先让每条候选源真跑一小段数据，再按"到手字节 ÷ 历时"排名
    // 能连上不等于跑得快，所以这里量的是字节，不是延迟
    const probe = await probeSources(sourceConfig.urls, (measured) => {
      broadcast({ status: "probing", notice: `正在实测 ${measured.label} 速度…` })
    })
    if (controller.signal.aborted) {
      broadcast({ status: "cancelled" })
      state.downloading[assetType] = null
      state.downloadControllers[assetType] = null
      return { ok: false, msg: "下载已取消" }
    }
    if (probe.ranked.length === 0) {
      const detailText = probe.rejected
        .map((item) => `${item.label}: ${item.failureReason}`)
        .join("；")
      broadcast({ status: "failed" })
      state.downloading[assetType] = null
      state.downloadControllers[assetType] = null
      return { ok: false, msg: `所有候选源都不可用 —— ${detailText}。请检查资产地址是否已失效。` }
    }

    const lockedSource = probe.best
    state.lastProbe[assetType] = {
      url: lockedSource.url,
      label: lockedSource.label,
      speedText: formatSpeed(lockedSource.bytesPerSec),
      measuredAt: probe.measuredAt
    }

    // 锁定之后整条传输只走这一个源：速度再低也不换。
    // 唯一允许换源的情形是"硬失败"（连接断了 / 文件坏了），而且必须把"进度归零"说出来。
    let noticeText = `已锁定源：${lockedSource.label}（实测 ${formatSpeed(lockedSource.bytesPerSec)}）`

    for (let candidateIdx = 0; candidateIdx < probe.ranked.length; candidateIdx++) {
      const candidate = probe.ranked[candidateIdx]

      // 同一条源给两次机会：第一次从 0 开始，第二次拿已落盘字节做同源续传（源没变，不算换源）
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (controller.signal.aborted) break
        const partialBytes = attempt === 2 && fsSync.existsSync(tmpFilePath) ? fsSync.statSync(tmpFilePath).size : 0
        try {
          console.log(`[qemuManager] 下载 ${sourceConfig.name} 源${candidateIdx + 1}/${probe.ranked.length} 第${attempt}次，起点 ${partialBytes} 字节: ${candidate.url}`)
          broadcast({
            status: "downloading",
            currentUrl: candidate.url,
            sourceLabel: candidate.label,
            notice: noticeText
          })
          noticeText = ""

          const response = await axios({
            method: "get",
            url: candidate.url,
            responseType: "stream",
            signal: controller.signal,
            timeout: 20000,
            maxRedirects: 5,
            headers: partialBytes > 0 ? { Range: `bytes=${partialBytes}-` } : {}
          })

          // 续传成立的必要条件是服务端回 206；回 200 说明它整份重发，只能清空重写
          const isResume = partialBytes > 0 && response.status === 206
          if (partialBytes > 0 && !isResume) {
            try { fsSync.unlinkSync(tmpFilePath) } catch (e) {}
          }
          const startOffset = isResume ? partialBytes : 0
          const expectedTotal = isResume
            ? Number(String(response.headers["content-range"] || "").split("/")[1] || 0)
            : Number(response.headers["content-length"] || 0)

          const fileStream = fsSync.createWriteStream(tmpFilePath, { flags: startOffset > 0 ? "a" : "w" })
          let receivedBytes = 0
          let lastLoadedBytes = startOffset
          let lastTime = Date.now()

          await new Promise((resolve, reject) => {
            response.data.on("data", (chunk) => {
              receivedBytes += chunk.length
              const now = Date.now()
              const deltaSec = (now - lastTime) / 1000
              if (deltaSec >= 0.5) {
                const loadedBytes = startOffset + receivedBytes
                const speedBytes = (loadedBytes - lastLoadedBytes) / deltaSec
                lastLoadedBytes = loadedBytes
                lastTime = now
                const percent = expectedTotal > 0 ? Math.min(100, Math.round((loadedBytes / expectedTotal) * 100)) : 0
                broadcast({ loaded: loadedBytes, total: expectedTotal, percent, speed: formatSpeed(speedBytes) })
              }
            })

            fileStream.on("finish", () => {
              fileStream.close()
              resolve()
            })

            fileStream.on("error", (err) => {
              fileStream.close()
              reject(err)
            })

            response.data.on("error", (err) => {
              fileStream.close()
              reject(err)
            })

            response.data.pipe(fileStream)
          })

          // 完整性校验：落盘长度必须与服务器声明的总量严格相等
          // 魔数只在文件头几个字节，半截文件的魔数一样对得上，所以长度这一关不能省
          const st = fsSync.statSync(tmpFilePath)
          if (expectedTotal <= 0) {
            throw new Error("服务器未给出文件总长度，无法校验完整性")
          }
          if (st.size !== expectedTotal) {
            throw new Error(`文件长度不符：落盘 ${st.size} 字节，应为 ${expectedTotal} 字节`)
          }
          if (sourceConfig.magic && sourceConfig.magic.length > 0) {
            const fd = fsSync.openSync(tmpFilePath, "r")
            const buf = Buffer.alloc(sourceConfig.magic.length)
            fsSync.readSync(fd, buf, 0, sourceConfig.magic.length, 0)
            fsSync.closeSync(fd)
            const isMagicMatch = sourceConfig.magic.every((byte, idx) => buf[idx] === byte)
            if (!isMagicMatch) {
              try { fsSync.unlinkSync(tmpFilePath) } catch (e) {}
              throw new Error(`文件魔数校验不匹配，文件可能已损坏或收到错误重定向响应`)
            }
          }

          // 校验通过，原子归位至正式目标目录
          if (fsSync.existsSync(targetDir)) {
            const oldFiles = fsSync.readdirSync(targetDir)
            for (const oldFile of oldFiles) {
              try { fsSync.unlinkSync(pathLib.join(targetDir, oldFile)) } catch (e) {}
            }
          }
          await fs.rename(tmpFilePath, finalFilePath)

          broadcast({ status: "completed", percent: 100, speed: "0 KB/s" })
          state.downloading[assetType] = null
          state.downloadControllers[assetType] = null

          return {
            ok: true,
            msg: trs("虚机/提示/下载成功", {
              cn: `资产 ${sourceConfig.name} 下载并校验就绪！`,
              en: `Asset ${sourceConfig.name} downloaded & verified!`
            }),
            data: { filePath: finalFilePath, fileName: sourceConfig.name }
          }
        } catch (err) {
          if (controller.signal.aborted) {
            try { if (fsSync.existsSync(tmpFilePath)) fsSync.unlinkSync(tmpFilePath) } catch (e) {}
            state.downloading[assetType] = null
            state.downloadControllers[assetType] = null
            broadcast({ status: "cancelled" })
            return { ok: false, msg: "下载已取消" }
          }
          console.warn(`[qemuManager] 源 ${candidate.url} 第${attempt}次失败:`, err.message)
          const partialBytesNow = fsSync.existsSync(tmpFilePath) ? fsSync.statSync(tmpFilePath).size : 0
          if (attempt === 1 && partialBytesNow > 0) {
            noticeText = `连接中断，正在同源续传：${candidate.label}（从 ${Math.round(partialBytesNow / 1048576)}MB 继续）`
            continue
          }
          break
        }
      }

      // 同一条源两次都没救回来，才判它失效；换源是"硬失败后的显式重来"，与"嫌慢"无关
      const nextCandidate = probe.ranked[candidateIdx + 1]
      if (nextCandidate && !controller.signal.aborted) {
        try { if (fsSync.existsSync(tmpFilePath)) fsSync.unlinkSync(tmpFilePath) } catch (e) {}
        noticeText = `源 ${candidate.label} 已失效，改用备用源 ${nextCandidate.label}，进度从 0 重新开始`
        continue
      }
    }

    broadcast({ status: "failed" })
    state.downloading[assetType] = null
    state.downloadControllers[assetType] = null
    return {
      ok: false,
      msg: `所有源均下载失败，请检查网络连接或稍后重试。`
    }
  },

  cancelDownload(assetType) {
    if (state.downloadControllers[assetType]) {
      state.downloadControllers[assetType].abort()
      state.downloadControllers[assetType] = null
      state.downloading[assetType] = null
      return { ok: true, msg: "已取消下载" }
    }
    return { ok: false, msg: "当前无活跃下载任务" }
  },

  async saveHardwareConfig({ cpus, memory }) {
    const paths = getPaths()
    const manifest = readManifest(paths.manifestPath)
    if (cpus) manifest.cpus = Number(cpus)
    if (memory) manifest.memory = Number(memory)
    manifest.updatedAt = Date.now()
    await fs.mkdir(paths.runtimeDir, { recursive: true })
    await fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf8")
    return {
      ok: true,
      msg: trs("虚机/提示/硬件配置已保存", {
        cn: "硬件配置已保存，下次启动或重启时生效",
        en: "Hardware config saved, takes effect on next boot"
      }),
      data: { cpus: manifest.cpus, memory: manifest.memory }
    }
  },

  // 路线 1：还原出厂系统镜像（纯单文件原子覆盖，绝不删除外部任何其他目录）
  async restoreImage({ onLog } = {}) {
    const paths = getPaths()
    const builtinImgRes = getBuiltinImageInfo()
    if (!builtinImgRes.ok) {
      return {
        ok: false,
        msg: builtinImgRes.msg
      }
    }
    if (state.process || state.status === "running") {
      await this.stop({ onLog })
    }
    try {
      if (typeof onLog === "function") onLog(">>> [owo-vm] 正在从原厂母盘覆盖系统镜像...")
      await fs.mkdir(paths.imageDir, { recursive: true })
      // 清空旧镜像目录，确保有且仅有当前恢复的唯一一份镜像
      const oldFiles = await fs.readdir(paths.imageDir)
      for (const f of oldFiles) {
        await fs.rm(pathLib.join(paths.imageDir, f), { recursive: true, force: true }).catch(() => {})
      }
      await fs.copyFile(builtinImgRes.imagePath, pathLib.join(paths.imageDir, builtinImgRes.imageName))
      const manifest = readManifest(paths.manifestPath)
      manifest.imageVersion = "3.20.9"
      manifest.updatedAt = Date.now()
      await fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf8")
      return {
        ok: true,
        msg: trs("虚机/提示/镜像还原成功", {
          cn: "系统镜像已成功覆盖还原为出厂原装母盘！",
          en: "System image successfully restored to factory base image!"
        })
      }
    } catch (err) {
      return {
        ok: false,
        msg: trs("虚机/错误/还原镜像失败", {
          cn: `还原系统镜像失败: ${err.message}`,
          en: `Failed to restore system image: ${err.message}`
        })
      }
    }
  },

  async uploadImage({ sourceFilePath, onLog } = {}) {
    if (!sourceFilePath || !fsSync.existsSync(sourceFilePath)) {
      return {
        ok: false,
        msg: trs("虚机/错误/源文件不存在", {
          cn: "上传失败：选定的镜像文件不存在",
          en: "Upload failed: selected image file does not exist"
        })
      }
    }
    const paths = getPaths()
    if (state.process || state.status === "running") {
      await this.stop({ onLog })
    }
    try {
      await fs.mkdir(paths.imageDir, { recursive: true })
      // 清空旧镜像，严格确保目录下有且仅有当前上传的唯一一份镜像
      const oldFiles = await fs.readdir(paths.imageDir)
      for (const f of oldFiles) {
        await fs.rm(pathLib.join(paths.imageDir, f), { recursive: true, force: true }).catch(() => {})
      }
      const destName = pathLib.basename(sourceFilePath)
      const targetPath = pathLib.join(paths.imageDir, destName)
      await fs.copyFile(sourceFilePath, targetPath)
      const manifest = readManifest(paths.manifestPath)
      manifest.customImage = destName
      manifest.updatedAt = Date.now()
      await fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf8")
      return {
        ok: true,
        msg: trs("虚机/提示/上传成功", {
          cn: `自定义镜像 ${destName} 导入成功，已就位为当前唯一系统镜像！`,
          en: `Custom image ${destName} imported successfully as the active image!`
        }),
        data: { imagePath: targetPath, imageName: destName }
      }
    } catch (err) {
      return {
        ok: false,
        msg: trs("虚机/错误/上传失败", {
          cn: `导入镜像失败: ${err.message}`,
          en: `Failed to import image: ${err.message}`
        })
      }
    }
  },

  // 路线 2：还原原厂 QEMU 源码包（纯单文件覆盖，绝不删除已编译好的二进制引擎）
  async restoreQemuSrc({ onLog } = {}) {
    const paths = getPaths()
    const srcRes = getBuiltinQemuSrcInfo()
    if (!srcRes.ok) {
      return {
        ok: false,
        msg: srcRes.msg
      }
    }
    try {
      if (typeof onLog === "function") onLog(">>> [owo-vm] 正在覆盖还原 QEMU 原厂源码包...")
      const userQemuDir = pathLib.join(paths.runtimeDir, "qemu")
      await fs.mkdir(userQemuDir, { recursive: true })
      // 清空旧源码包，保持单机唯一一份
      const oldFiles = await fs.readdir(userQemuDir)
      for (const f of oldFiles) {
        await fs.rm(pathLib.join(userQemuDir, f), { recursive: true, force: true }).catch(() => {})
      }
      const targetSrcFile = pathLib.join(userQemuDir, srcRes.srcName)
      await fs.copyFile(srcRes.srcPath, targetSrcFile)
      const manifest = readManifest(paths.manifestPath)
      manifest.qemuSource = srcRes.srcName
      manifest.updatedAt = Date.now()
      await fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf8")
      return {
        ok: true,
        msg: trs("虚机/提示/源码还原成功", {
          cn: `QEMU 原厂源码包 [${srcRes.srcName}] 已覆盖还原！现存已编译引擎完好无损。`,
          en: `QEMU factory source [${srcRes.srcName}] restored! Existing compiled engine remains intact.`
        }),
        targetSrcFile
      }
    } catch (err) {
      return {
        ok: false,
        msg: trs("虚机/错误/还原源码失败", {
          cn: `还原 QEMU 源码包失败: ${err.message}`,
          en: `Failed to restore QEMU source: ${err.message}`
        })
      }
    }
  },

  async reset({ onLog } = {}) {
    return await this.restoreImage({ onLog })
  },

  async start({ workspaceDir, onLog } = {}) {
    if (state.status === "running" && state.process) {
      return {
        ok: true,
        msg: trs("虚机/提示/运行中", {
          cn: "微虚拟机已在运行中",
          en: "MicroVM is already running"
        }),
        port: state.port,
        host: "127.0.0.1",
        privateKey: state.privateKey
      }
    }

    if (state.startPromise) return state.startPromise

    state.startPromise = (async () => {
      registerExitHooks()
      const log = (msg) => {
        if (typeof onLog === "function") onLog(msg)
      }

      // 若未初始化，按需自动就地触发初始化
      const initialized = await this.isInitialized()
      if (!initialized) {
        log(">>> [owo-vm] 检测到微虚拟机尚未部署，自动触发首次初始化...")
        const initRes = await this.init({ onLog })
        if (!initRes.ok) {
          state.startPromise = null
          return initRes
        }
      }

      state.status = "starting"
      state.errorMsg = null
      const paths = getPaths()

      // 确定宿主工作区映射路径与名称
      const targetWorkspace = workspaceDir || workDirTool.getMainWorkDir(0) || process.cwd()
      const dirName = pathLib.basename(targetWorkspace)

      // 探测 CPU 硬件加速独立参数
      let accelType = "tcg"
      if (process.platform === "darwin") {
        accelType = "hvf"
      } else if (process.platform === "win32") {
        accelType = "whpx"
      } else if (process.platform === "linux") {
        accelType = "kvm"
      }

      log(`>>> [owo-vm] 正在启动硬件加速微虚拟机 (-accel ${accelType})...`)

      // 检查当前运行目录下是否有独立二进制
      const binRes = this.getQemuBinInfo()
      if (!binRes.ok) {
        log(`❌ [owo-vm 错误] ${binRes.msg}`)
        state.status = "error"
        state.errorMsg = binRes.msg
        return {
          ok: false,
          msg: binRes.msg
        }
      }

      const binToRun = binRes.data.binPath
      const manifest = readManifest(paths.manifestPath)
      const cpusToUse = String(Number(manifest.cpus) || 2)
      const memToUse = String(Number(manifest.memory) || 2048)

      const args = [
        "-m", memToUse,
        "-smp", cpusToUse,
        "-accel", accelType,
        "-nographic",
        "-snapshot"
      ]

      if (process.arch === "arm64") {
        args.push("-M", "virt", "-cpu", "host")
        const edk2Bios = pathLib.join(paths.biosDir, "edk2-aarch64-code.fd")
        if (fsSync.existsSync(edk2Bios)) {
          args.push("-L", paths.biosDir, "-bios", edk2Bios)
        }
      } else {
        args.push("-M", "q35", "-cpu", "host")
      }

      args.push(
        "-netdev", `user,id=net0,hostfwd=tcp:127.0.0.1:${state.port}-:22`,
        "-device", "virtio-net,netdev=net0,romfile=",
        "-virtfs", `local,path=${targetWorkspace},mount_tag=${dirName},security_model=mapped-xattr,id=ws0`
      )

      const imgRes = getQemuImageInfo()
      if (!imgRes.ok) {
        log(`❌ [owo-vm 错误] ${imgRes.msg}`)
        state.status = "error"
        state.errorMsg = imgRes.msg
        return {
          ok: false,
          msg: imgRes.msg
        }
      }

      const activeImagePath = imgRes.data.imagePath
      if (activeImagePath.endsWith(".iso")) {
        args.push("-cdrom", activeImagePath)
      } else {
        args.push("-drive", `file=${activeImagePath},format=qcow2,if=virtio`)
      }

      try {
        console.log(`[QEMU SPAWN] cmd: ${binToRun} ${args.join(" ")}`)
        const qemuProc = spawn(binToRun, args, {
          stdio: ["pipe", "pipe", "pipe"],
          detached: false,
          windowsHide: true
        })

        state.process = qemuProc
        state.pid = qemuProc.pid

        qemuProc.stdout?.on("data", (chunk) => {
          appendConsoleLog(chunk)
        })

        qemuProc.stderr?.on("data", (chunk) => {
          appendConsoleLog(chunk)
        })

        qemuProc.on("exit", (code) => {
          state.status = "stopped"
          state.process = null
          state.pid = null
          log(`>>> [owo-vm] 微虚拟机进程已退出 (code: ${code})`)
        })

        qemuProc.on("error", (err) => {
          state.status = "error"
          state.errorMsg = err.message
          state.process = null
          state.pid = null
          log(`❌ [owo-vm 错误] 启动进程失败: ${err.message}`)
        })

        state.status = "running"
        log(">>> [owo-vm] 微虚拟机硬件沙箱启动完成，网络监听已就绪。")

        return {
          ok: true,
          msg: trs("虚机/提示/启动成功", {
            cn: "微虚拟机启动成功",
            en: "MicroVM started successfully"
          }),
          port: state.port,
          host: "127.0.0.1",
          username: "vagrant",
          password: "vagrant"
        }
      } catch (err) {
        state.status = "error"
        state.errorMsg = err.message
        log(`❌ [owo-vm 启动异常] ${err.message}`)
        return {
          ok: false,
          msg: trs("虚机/错误/启动失败", {
            cn: `微虚拟机启动失败: ${err.message}`,
            en: `MicroVM boot failed: ${err.message}`
          })
        }
      } finally {
        state.startPromise = null
      }
    })()

    return state.startPromise
  },

  async stop({ onLog } = {}) {
    if (!state.process && state.status === "stopped") {
      return {
        ok: false,
        msg: trs("虚机/错误/尚未运行", {
          cn: "微虚拟机尚未运行",
          en: "MicroVM is not running"
        })
      }
    }
    if (state.process) {
      if (typeof onLog === "function") onLog(">>> [owo-vm] 正在优雅关闭微虚拟机...")
      try {
        state.process.kill("SIGTERM")
      } catch (e) {}

      // 2 秒后强制终止
      await new Promise((res) => setTimeout(res, 2000))
      if (state.process) {
        try {
          state.process.kill("SIGKILL")
        } catch (e) {}
        state.process = null
      }
    }
    state.status = "stopped"
    state.pid = null
    return {
      ok: true,
      msg: trs("虚机/提示/已停止", {
        cn: "微虚拟机已停止",
        en: "MicroVM stopped"
      })
    }
  },

  async restart({ workspaceDir, onLog } = {}) {
    if (state.process || state.status === "running") {
      await this.stop({ onLog })
      await new Promise((res) => setTimeout(res, 600))
    }
    return await this.start({ workspaceDir, onLog })
  },

  getConsoleLogs() {
    return consoleLogs
  },

  clearConsoleLogs() {
    consoleLogs = ""
    return {
      ok: true,
      msg: trs("虚机/提示/控制台已清空", {
        cn: "控制台日志已清空",
        en: "Console log cleared"
      })
    }
  },

  sendConsoleInput(text) {
    if (state.process?.stdin && !state.process.stdin.destroyed) {
      try {
        state.process.stdin.write(text)
        return {
          ok: true,
          msg: trs("虚机/提示/指令已发送", {
            cn: "指令已发送至微虚拟机硬件控制台",
            en: "Command sent to hardware console"
          })
        }
      } catch (e) {
        return {
          ok: false,
          msg: trs("虚机/错误/发送失败", {
            cn: `发送失败: ${e.message}`,
            en: `Failed to send command: ${e.message}`
          })
        }
      }
    }
    return {
      ok: false,
      msg: trs("虚机/错误/未运行无法发送", {
        cn: "微虚拟机未运行，无法发送指令",
        en: "MicroVM is not running, cannot send command"
      })
    }
  },

  addConsoleListener(fn) {
    state.consoleListeners.add(fn)
    return () => state.consoleListeners.delete(fn)
  },

  getDownloadingStatus() {
    return state.downloading
  }
}
