import fs from "fs/promises"
import path from "path"
import { shell } from "electron"


export default {
  async init(app, appManager) {
    app.data.currentPath = process.cwd()
    app.data.history = [app.data.currentPath] // 历史记录栈
    app.data.historyIndex = 0
    app.data.clipboard = null // { type: 'copy'|'cut', files: [] }
    console.log(`[Explorer] Init at ${app.data.currentPath}`)
  },

  async dispatch({ app, action, args, appManager, io }) {
    const { currentPath } = app.data

    try {
      switch (action) {

        // ====== 导航与列表 ======

        case "ls":
          return await this.listDir(args.path || currentPath)

        case "navigate":
          let targetPath = args.path
          if (targetPath === "..") {
            targetPath = path.dirname(currentPath)
          } else {
            targetPath = path.resolve(currentPath, targetPath)
          }

          // 验证是否存在且为目录
          try {
            const stat = await fs.stat(targetPath)
            if (!stat.isDirectory()) {
              return { error: "目标不是文件夹" }
            }
          } catch (e) {
            return { error: "路径不存在" }
          }

          app.data.currentPath = targetPath

          // 历史记录处理
          if (!args.isHistoryOp) {
            app.data.history = app.data.history.slice(0, app.data.historyIndex + 1)
            app.data.history.push(targetPath)
            app.data.historyIndex++
          }

          // 广播更新
          io.emit("app:dispatch", {
            appId: app.id,
            action: "updatePath",
            args: { path: targetPath, files: (await this.listDir(targetPath)).data }
          })

          return { ok: true, path: targetPath }

        case "history":
          const delta = args.delta || 0
          const newIndex = app.data.historyIndex + delta
          if (newIndex >= 0 && newIndex < app.data.history.length) {
            app.data.historyIndex = newIndex
            const backPath = app.data.history[newIndex]
            // 复用 navigate 逻辑
            return this.dispatch({
              app, action: "navigate",
              args: { path: backPath, isHistoryOp: true },
              appManager, io
            })
          }
          return { ok: false }

        // ====== 文件操作 ======

        case "open":
          const filePath = path.resolve(currentPath, args.filename)
          const stat = await fs.stat(filePath)

          if (stat.isDirectory()) {
            return this.dispatch({ app, action: "navigate", args: { path: filePath }, appManager, io })
          } else {
            // 智能文件关联
            const ext = path.extname(filePath).toLowerCase()

            // 1. 文本/代码 -> Editor
            if ([".js", ".json", ".md", ".txt", ".log", ".css", ".html", ".py", ".java", ".c", ".cpp", ".h", ".ts", ".xml", ".yaml", ".yml"].includes(ext)) {
              await appManager.launch("editor", { data: { filePath } })
              return { ok: true, msg: "已用编辑器打开" }
            }

            // 2. 网页/HTML -> Browser (如果它是 .html 既可以用编辑器看源码，也可以用浏览器看效果，这里优先浏览器如果是明确的 web 文件，但 text 列表里已经包含了 html 以便于编辑。这里做个特殊判断：如果有 explicit mode 参数)
            // 修正：根据计划，.html 默认用浏览器
            if (ext === ".html" || ext === ".htm") {
              await appManager.launch("browser", { data: { url: `file://${filePath}` } })
              return { ok: true, msg: "已用浏览器打开" }
            }

            // 3. 默认系统打开
            await shell.openPath(filePath)
            return { ok: true, msg: "已调用系统打开" }
          }

        case "delete":
          const filesToDelete = args.files || []
          for (const file of filesToDelete) {
            const target = path.resolve(currentPath, file)
            console.log(`[Explorer] Trashing: ${target}`)
            await shell.trashItem(target)
          }
          // 刷新
          return this.dispatch({ app, action: "navigate", args: { path: currentPath, isHistoryOp: true }, appManager, io })

        case "mkdir":
          if (args.name) {
            await fs.mkdir(path.resolve(currentPath, args.name), { recursive: true })
            return this.dispatch({ app, action: "navigate", args: { path: currentPath, isHistoryOp: true }, appManager, io })
          }
          return { error: "缺少文件夹名称" }

        case "newFile":
          if (args.name) {
            const target = path.resolve(currentPath, args.name)
            try {
              await fs.writeFile(target, "", { flag: 'wx' }) // fail if exists
            } catch (e) {
              return { error: "文件已存在或无法创建" }
            }
            return this.dispatch({ app, action: "navigate", args: { path: currentPath, isHistoryOp: true }, appManager, io })
          }
          return { error: "缺少文件名" }

        case "rename":
          if (args.oldName && args.newName) {
            await fs.rename(path.resolve(currentPath, args.oldName), path.resolve(currentPath, args.newName))
            return this.dispatch({ app, action: "navigate", args: { path: currentPath, isHistoryOp: true }, appManager, io })
          }
          return { error: "参数不完整" }

        case "paste":
          // args: { mode: 'copy'|'cut', files: ['fullPath1', ...], targetPath: ... }
          // Note: Frontend should pass full paths of source files.
          // However frontend usually has names. 
          // Let's assume frontend passes absolute paths for safety or relative?
          // Frontend clipboard logic will store: { mode, items: [{name, path}] }.
          // So args should contain source paths.

          // args: { mode, files, targetPath, decisions = {} }
          // decisions: { 'filename': 'override' | 'skip' | 'rename' }

          const { mode, files, targetPath: destPathArg, decisions = {} } = args
          const destPath = destPathArg || currentPath

          if (!files || !Array.isArray(files) || files.length === 0) return { error: "剪贴板为空" }

          const conflicts = []
          const operations = []

          console.log(`[Explorer] Paste: ${files.length} files to ${destPath}`, { mode, decisions })

          // Pre-check phase
          for (const src of files) {
            const basename = path.basename(src)
            const dest = path.resolve(destPath, basename)

            let action = decisions[basename]

            if (!action) {
              // Check existence
              try {
                await fs.access(dest)
                // Exists
                if (mode === "cut" && src === dest) {
                  // 同位置剪切，静默跳过
                  continue
                } else {
                  conflicts.push(basename)
                  continue
                }
              } catch {
                action = 'write' // Normal write
              }
            }

            if (action && action !== 'skip') {
              // 关键修复：防止 self-copy 导致的 EINVAL
              if (mode === 'copy' && src === dest && (action === 'write' || action === 'override')) {
                continue
              }
              operations.push({ src, dest, action, basename })
            }
          }

          // 如果仍有未决冲突，返回错误状态
          if (conflicts.length > 0) {
            console.log(`[Explorer] Conflicts detected:`, conflicts)
            return { status: "conflict", files: conflicts }
          }

          // Execute phase
          console.log(`[Explorer] Executing ${operations.length} operations`, operations)
          for (const op of operations) {
            const { src, dest, action, basename } = op
            let finalDest = dest

            if (action === 'rename') {
              finalDest = await (async (baseDest) => {
                let newDest = baseDest
                let counter = 1
                const ext = path.extname(baseDest)
                const name = path.basename(baseDest, ext)
                const dir = path.dirname(baseDest)
                while (true) {
                  try {
                    await fs.access(newDest)
                    newDest = path.join(dir, `${name} copy ${counter}${ext}`)
                    counter++
                  } catch { return newDest }
                }
              })(dest)
            }

            if (mode === "cut") {
              try {
                await fs.rename(src, finalDest)
              } catch (e) {
                // rename might fail across devices, fallback to copy+unlink
                await fs.cp(src, finalDest, { recursive: true, force: true })
                await fs.rm(src, { recursive: true, force: true })
              }
            } else {
              await fs.cp(src, finalDest, { recursive: true, force: true })
            }
          }

          return this.dispatch({ app, action: "navigate", args: { path: destPath, isHistoryOp: true }, appManager, io })

        // ====== AI 辅助 ======

        case "getState":
          return { ok: true, currentPath, files: (await this.listDir(currentPath)).data }

        default:
          return { error: "未知操作" }
      }
    } catch (e) {
      console.error("[Explorer]", e)
      return { error: e.message }
    }
  },

  async listDir(dirPath) {
    try {
      const dirents = await fs.readdir(dirPath, { withFileTypes: true })
      const files = await Promise.all(dirents.map(async (d) => {
        let stats = {}
        try {
          stats = await fs.stat(path.join(dirPath, d.name))
        } catch (e) { }

        return {
          name: d.name,
          isDirectory: d.isDirectory(),
          size: stats.size || 0,
          mtime: stats.mtimeMs || 0,
          type: d.isDirectory() ? "folder" : path.extname(d.name).slice(1)
        }
      }))

      // 排序: 文件夹优先，然后按名称
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      return { ok: true, data: files }
    } catch (e) {
      return { error: `无法读取目录: ${e.message}` }
    }
  }
}
