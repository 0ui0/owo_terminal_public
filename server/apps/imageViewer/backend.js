import path from "path"
import fs from "fs"

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp"])

export default {
  async init(app, appManager) {
    console.log(`[imageViewer Backend] App ${app.id} initialized.`)
  },

  async destroy(app, appManager) {
    console.log(`[imageViewer Backend] App ${app.id} destroyed.`)
  },

  async dispatch({ app, action, args, appManager, io }) {
    try {
      if (action === "openImage") {
        const { filePath } = args || {}
        if (!filePath) {
          return { ok: false, msg: "缺少图片路径" }
        }

        const cleanPath = filePath.replace(/^file:\/\//, "")
        if (!fs.existsSync(cleanPath)) {
          return { ok: false, msg: `图片文件不存在: ${cleanPath}` }
        }

        const stat = fs.statSync(cleanPath)
        if (!stat.isFile()) {
          return { ok: false, msg: `指定路径不是一个有效的图片文件: ${cleanPath}` }
        }

        const ext = path.extname(cleanPath).toLowerCase()
        const mimeMap = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
          ".bmp": "image/bmp"
        }
        const mimeType = mimeMap[ext] || "image/png"

        const fileBuffer = fs.readFileSync(cleanPath)
        const base64Data = fileBuffer.toString("base64")
        const dataUri = `data:${mimeType};base64,${base64Data}`

        const folder = path.dirname(cleanPath)
        let sisterImages = []
        try {
          const files = fs.readdirSync(folder)
          sisterImages = files
            .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
            .map(f => path.join(folder, f))
        } catch (e) {
          sisterImages = [cleanPath]
        }

        const imageInfo = {
          filePath: cleanPath,
          fileName: path.basename(cleanPath),
          fileSize: stat.size,
          mimeType,
          dataUri,
          mtime: stat.mtime,
          sisterImages
        }

        io.emit("app:dispatch", {
          appId: app.id,
          action: "loadImage",
          args: imageInfo
        })

        return {
          ok: true,
          msg: "图片解构读取成功",
          data: imageInfo
        }
      }

      return { ok: false, msg: `未知操作: ${action}` }
    } catch (err) {
      console.error("[imageViewer Backend Error]", err)
      return { ok: false, msg: `服务器内部错误: ${err.message}` }
    }
  }
}
