import fs from "fs/promises"
import path from "path"


export default {
  async init(app, appManager) {
    const args = app.data || {}
    app.data.filePath = args.filePath || ""
    app.data.content = args.content || ""
    app.data.isDiff = args.isDiff || false
    app.data.originalContent = args.originalContent || ""
    app.data.proposedContent = args.proposedContent || ""

    // 如果有 filePath 但没 content，尝试读取
    if (app.data.filePath && !app.data.content) {
      try {
        const resolvedPath = path.resolve(app.data.filePath)
        app.data.content = await fs.readFile(resolvedPath, "utf-8")
        app.data.filePath = resolvedPath // 确保存的是绝对路径
        console.log(`[Editor Backend] Initialized with file: ${resolvedPath}`)
      } catch (e) {
        console.error(`[Editor Backend] Failed to read initial file: ${app.data.filePath}`, e.message)
      }
    }
  },

  async dispatch({ app, action, args, appManager, io }) {
    switch (action) {
      case "open":
        try {
          const content = await fs.readFile(args.filePath, "utf-8")
          app.data.filePath = args.filePath
          app.data.content = content
          app.data.isDiff = false

          // 显式通知前端更新
          io.emit("app:dispatch", { appId: app.id, action, args: { filePath: args.filePath, content } })

          return { ok: true, data: { filePath: args.filePath, content, isDiff: false } }
        } catch (e) {
          console.log(e)
          return { ok: false, msg: `读取文件失败: ${e.message}` }
        }

      case "save":
        try {
          const targetPath = args.filePath || app.data.filePath
          if (!targetPath) throw new Error("缺少保存路径")

          await fs.writeFile(targetPath, args.content, "utf-8")
          app.data.filePath = targetPath
          app.data.content = args.content
          return { ok: true, data: { filePath: targetPath } } // 返回路径供 AppManager 同步
        } catch (e) {
          return { ok: false, msg: `保存文件失败: ${e.message}` }
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
