import fs from "fs/promises"
import path from "path"
import fileState from "../../tools/fileState.js"


export default {
  async init(app, appManager) {
    const args = app.data || {}
    app.data.filePath = args.filePath || ""
    app.data.content = args.content || ""
    app.data.isDiff = args.isDiff || false
    app.data.originalContent = args.originalContent || ""
    app.data.proposedContent = args.proposedContent || ""

    // 如果有 filePath，尝试获取 mtime，如无 content 顺便读取 content
    if (app.data.filePath) {
      try {
        const resolvedPath = path.resolve(app.data.filePath)
        if (!app.data.content) {
          app.data.content = await fs.readFile(resolvedPath, "utf-8")
        }
        app.data.filePath = resolvedPath // 确保存的是绝对路径
        const stat = await fs.stat(resolvedPath)
        app.data.mtime = stat.mtimeMs
        console.log(`[Editor Backend] Initialized with file: ${resolvedPath}`)
      } catch (e) {
        console.error(`[Editor Backend] Failed to read/stat initial file: ${app.data.filePath}`, e.message)
      }
    }
  },

  async dispatch({ app, action, args, appManager, io }) {
    switch (action) {
      case "open":
        try {
          const content = await fs.readFile(args.filePath, "utf-8")
          const stat = await fs.stat(args.filePath)
          app.data.filePath = args.filePath
          app.data.content = content
          app.data.mtime = stat.mtimeMs
          app.data.isDiff = false

          // 显式通知前端更新
          io.emit("app:dispatch", { appId: app.id, action, args: { filePath: args.filePath, content } })

          return { ok: true, msg: "读取文件成功", data: { filePath: args.filePath, content, isDiff: false } }
        } catch (e) {
          console.error(e)
          return { ok: false, msg: `读取文件失败: ${e.message}` }
        }

      case "save":
        try {
          const targetPath = args.filePath || app.data.filePath
          if (!targetPath) {
            return { ok: false, msg: "缺少保存路径" }
          }

          // 检查文件是否在外部被修改
          let stat = null
          try {
            stat = await fs.stat(targetPath)
          } catch (e) {
            // 文件不存在，可能是新文件保存
          }

          if (stat && app.data.mtime && stat.mtimeMs !== app.data.mtime) {
            if (!args.force) {
              return {
                ok: false,
                code: "MODIFIED_EXTERNALLY",
                msg: "文件在外部已被修改，直接保存将覆盖外部的修改！"
              }
            }
          }

          await fs.writeFile(targetPath, args.content, "utf-8")
          const newStat = await fs.stat(targetPath)
          app.data.filePath = targetPath
          app.data.content = args.content
          app.data.mtime = newStat.mtimeMs

          // 闭环同步全局 fileState，确保 AI 侧状态与用户手动保存绝对一致
          fileState.set(targetPath, {
            timestamp: newStat.mtimeMs || Date.now(),
            content: args.content,
            startLine: 0,
            endLine: 0
          })

          return { ok: true, msg: `[编辑器]保存成功（appid：${app.id}）`, data: { filePath: targetPath } } // 返回路径与成功提示
        } catch (e) {
          console.error(e)
          return { ok: false, msg: `保存文件失败: ${e.message}` }
        }

      case "readDiskContent":
        try {
          const targetPath = args.filePath || app.data.filePath
          if (!targetPath) {
            return { ok: false, msg: "缺少保存路径" }
          }
          const content = await fs.readFile(targetPath, "utf-8")
          return { ok: true, msg: "读取成功", data: { content } }
        } catch (e) {
          console.error(e)
          return { ok: false, msg: `读取文件失败: ${e.message}` }
        }

      case "showDiff":
        // 用于 AI 修改代码前的预览
        app.data.filePath = args.filePath
        app.data.originalContent = args.originalContent
        app.data.proposedContent = args.proposedContent
        app.data.isDiff = true
        app.data.confirmId = args.confirmId
        // 通知前端渲染 Diff
        io.emit("app:dispatch", { appId: app.id, action, args })
        // 自动唤起窗口到前台
        io.emit("app:active", { appId: app.id })
        return {
          ok: true,
          data: {
            filePath: args.filePath,
            originalContent: args.originalContent,
            proposedContent: args.proposedContent,
            isDiff: true,
            confirmId: args.confirmId
          }
        }

      case "acceptDiff":
        // 接受修改：仅更新内存内容
        console.log(`[Editor Backend] acceptDiff for ${app.id}. Updates memory only.`)
        app.data.content = args.proposedContent
        app.data.isDiff = false
        return { ok: true, msg: "内容已在内存中更新", data: { saved: false } }

      case "getContent":
        return { ok: true, data: { content: app.data.content, filePath: app.data.filePath } }

      default:
        // 后端不支持的操作统一返回错误
        return { ok: false, msg: "未知的操作" }
    }
  }
}
