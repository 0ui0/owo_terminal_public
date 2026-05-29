import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

// 模块元数据
const appsDir = path.resolve(import.meta.dirname)

// 主线程逻辑
const dirVersions = new Map() // appDirName -> version
const ackCallbacks = new Map() // msgId -> resolve function
let loaderPort = null

/**
 * 增加 App 目录版本号，并通过通讯隧道同步给 Loader 线程 (异步等待 ACK)
 */
export async function bumpAppDir(dirPath) {
  const appDirName = path.basename(dirPath)
  const v = (dirVersions.get(appDirName) || 0) + 1
  dirVersions.set(appDirName, v)

  if (loaderPort) {
    const msgId = Math.random().toString(36).slice(2)
    return new Promise((resolve) => {
      ackCallbacks.set(msgId, resolve)
      loaderPort.postMessage({ type: "UPDATE_DIR_VERSION", appDirName, v, msgId })
      
      // 超时保护
      setTimeout(() => {
        if (ackCallbacks.has(msgId)) {
          ackCallbacks.delete(msgId)
          resolve()
        }
      }, 500)
    })
  }
}

export function getAppVersion(appDirName) {
  return dirVersions.get(appDirName) || 0
}

/**
 * 初始化通讯隧道 (由 app.js 调用)
 */
export function setLoaderPort(port) {
  loaderPort = port
  loaderPort.on("message", (msg) => {
    if (msg?.type === "ACK" && msg.id) {
      const resolve = ackCallbacks.get(msg.id)
      if (resolve) {
        resolve()
        ackCallbacks.delete(msg.id)
      }
    }
  })
}

// Loader 线程逻辑（独立线程，无法访问主线程的 fileVersions）
let remoteDirVersions = new Map()

/**
 * Loader 初始化钩子
 */
export function initialize(data) {
  if (data?.port) {
    data.port.on("message", (msg) => {
      if (msg?.type === "UPDATE_DIR_VERSION") {
        remoteDirVersions.set(msg.appDirName, msg.v)
        // 回传确认信号 (ACK)
        if (msg.msgId) {
          data.port.postMessage({ type: "ACK", id: msg.msgId })
        }
      }
    })
    data.port.start() // 显式启动通讯端口
  }
}

function isUnderApps(filePath) {
  return filePath.startsWith(appsDir)
}

/**
 * 路径解析钩子：精准注入版本号
 */
export async function resolve(specifier, context, nextResolve) {
  // 仅处理相对路径导入且父级在 apps 目录下的情况
  if (!specifier.startsWith(".") || !context?.parentURL) {
    return nextResolve(specifier, context)
  }

  try {
    const result = await nextResolve(specifier, context)
    if (!result?.url?.startsWith("file://")) return result

    // 将 URL 转为标准物理路径
    let resolvedPath
    try {
      resolvedPath = fileURLToPath(result.url)
    } catch (e) {
      return result
    }

    // 检查是否属于 App 目录，并获取所属的 App 文件夹名称
    const relativePath = path.relative(appsDir, resolvedPath)
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return result

    const appDirName = relativePath.split(path.sep)[0]
    if (!appDirName) return result

    // 获取该 App 的全局版本号
    const v = remoteDirVersions.get(appDirName)
    if (!v) return result

    // 注入版本号，粉碎缓存。确保整个 App 的依赖树在同一版本下“整体转生”
    const url = new URL(result.url)
    url.searchParams.set("v", v)

    return {
      ...result,
      url: url.href,
      shortCircuit: true
    }
  } catch (err) {
    // 降级处理：如果解析失败，退回默认逻辑
    return nextResolve(specifier, context)
  }
}
