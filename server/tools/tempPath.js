import { app } from "electron"
import pathLib from "path"
import fs from "fs-extra"

class TempPathManager {
  constructor() {
    // 采用操作系统原生进程 PID 作为多实例天然唯一的物理隔离标识符
    this.instanceId = String(process.pid)
  }

  // 获取当前实例 ID (PID)
  getInstanceId() {
    return this.instanceId
  }

  // 获取用户业务数据根目录 (userData/owo_data，彻底隔离 Chromium 底层缓存)
  getUserDataDir() {
    let baseDir
    if (app?.getPath) {
      baseDir = app.getPath("userData")
    } else {
      baseDir = process.env.USER_DATA_DIR || pathLib.resolve(process.cwd(), "data")
    }
    const businessDataDir = pathLib.join(baseDir, "owo_data")
    fs.ensureDirSync(businessDataDir)
    return businessDataDir
  }

  // 获取当前实例 temp/{pid} 下的物理路径（自动确保目录存在）
  get(subPath = "") {
    const userData = this.getUserDataDir()
    const fullPath = subPath
      ? pathLib.join(userData, "temp", this.instanceId, subPath)
      : pathLib.join(userData, "temp", this.instanceId)

    // 如果获取的是子目录（不带文件扩展名），确保该目录存在
    if (!pathLib.extname(subPath)) {
      fs.ensureDirSync(fullPath)
    } else {
      fs.ensureDirSync(pathLib.dirname(fullPath))
    }
    return fullPath
  }

  // 清理当前实例专属的临时目录
  clean() {
    const userData = this.getUserDataDir()
    const instanceDir = pathLib.join(userData, "temp", this.instanceId)
    try {
      if (fs.existsSync(instanceDir)) {
        fs.removeSync(instanceDir)
        console.log(`[TempPath] 已成功清理当前实例 (PID:${this.instanceId}) 临时目录: ${instanceDir}`)
      }
    } catch (e) {
      console.warn(`[TempPath] 清理临时目录 ${instanceDir} 失败:`, e.message)
    }
  }

  // 清理历史残留的已死亡进程孤儿临时目录（安全回收磁盘空间）
  cleanDeadOrphanDirs() {
    try {
      const userData = this.getUserDataDir()
      const tempRoot = pathLib.join(userData, "temp")
      if (!fs.existsSync(tempRoot)) return

      const entries = fs.readdirSync(tempRoot)
      for (const entry of entries) {
        if (entry === this.instanceId) continue
        const pidNum = parseInt(entry, 10)
        if (!isNaN(pidNum) && pidNum > 0) {
          let isRunning = false
          try {
            // 发送信号 0 探测目标 PID 是否仍然存活
            process.kill(pidNum, 0)
            isRunning = true
          } catch (err) {
            isRunning = false
          }
          if (!isRunning) {
            const deadDir = pathLib.join(tempRoot, entry)
            fs.removeSync(deadDir)
            console.log(`[TempPath] 已自动回收已退出进程 (PID:${entry}) 的孤儿临时目录`)
          }
        }
      }
    } catch (e) {
      // 容错忽略
    }
  }
}

export default new TempPathManager()
