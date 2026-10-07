import fs from "fs-extra"
import path from "path"
import AdmZip from "adm-zip"
import tempPath from "../tools/tempPath.js"

export default {
  name: "appPkgInstall",
  func: async ({ path: zipPath }) => {
    try {
      const zipEntries = new AdmZip(zipPath).getEntries()
      // 过滤系统垃圾文件
      const isValid = (entry) => !entry.isDirectory && !entry.entryName.startsWith("__MACOSX") && !entry.entryName.includes(".DS_Store")
      const hasExactFile = (filePath) => zipEntries.some(entry => isValid(entry) && entry.entryName === filePath)

      // === 1. 结构检查：支持「zip 根目录」与「一层子目录包装」两种结构 ===
      const wrapDirEntry = zipEntries.find(entry => entry.isDirectory && entry.entryName.split("/").filter(Boolean).length === 1)
      const rootRef = hasExactFile("app.json")
        ? ""
        : (wrapDirEntry ? wrapDirEntry.entryName.split("/").filter(Boolean).join("/") + "/" : "")

      if (!hasExactFile(rootRef + "app.json")) {
        return { ok: false, msg: "安装失败：zip 根目录或一级子目录下必须存在 app.json" }
      }

      // === 2. 解析 app.json（与 appManager.loadappDefs 同一校验口径） ===
      const appJsonEntry = zipEntries.find(entry => entry.entryName === rootRef + "app.json")
      const appJson = JSON.parse(appJsonEntry.getData().toString("utf-8"))
      if (!appJson.id) return { ok: false, msg: "安装失败：app.json 缺少 id 字段" }

      const appIdStr = String(appJson.id)
      const appNameStr = appJson.name || appIdStr

      // === 3. 目标目录：用户 App 目录 / <appId> ===
      const userAppsDir = tempPath.getUserAppsDir()
      const targetDir = path.join(userAppsDir, appIdStr)
      if (path.dirname(targetDir) !== userAppsDir) {
        return { ok: false, msg: `安装失败：非法的 app id (${appIdStr})` }
      }

      // 重名会覆盖内置定义、破坏已装 App，必须拒绝
      if (await fs.pathExists(path.resolve(import.meta.dirname, "../apps", appIdStr))) {
        return { ok: false, msg: `安装失败：app id「${appIdStr}」与系统内置 App 重名` }
      }
      if (await fs.pathExists(targetDir)) {
        return { ok: false, msg: `安装失败：已存在同名 App 目录「${appIdStr}」，请先卸载` }
      }

      // === 4. 解压（失败即回滚，不留残缺目录） ===
      await fs.ensureDir(targetDir)
      try {
        for (const entry of zipEntries) {
          if (!isValid(entry) || !entry.entryName.startsWith(rootRef)) continue

          const fullPath = path.join(targetDir, entry.entryName.slice(rootRef.length))
          if (!fullPath.startsWith(targetDir + path.sep)) {
            throw new Error(`zip 内含非法路径: ${entry.entryName}`)
          }

          await fs.ensureDir(path.dirname(fullPath))
          await fs.writeFile(fullPath, entry.getData())
        }
      } catch (err) {
        await fs.remove(targetDir)
        throw err
      }

      // 解压到位后，由 appManager.watchAppDefs 监听目录变动自动完成热加载与注册
      console.log(`[appPkgInstall] 已安装 ${appIdStr} -> ${targetDir}`)
      return { ok: true, msg: `App「${appNameStr}」安装成功`, id: appIdStr, name: appNameStr, dir: targetDir }
    } catch (err) {
      console.error("[appPkgInstall] 安装失败:", err)
      return { ok: false, msg: `安装失败：${err.message}` }
    }
  }
}
