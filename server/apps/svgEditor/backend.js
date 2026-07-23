import { DispatchTracker } from "../browser/dispatchTracker.js"
import fs from "fs-extra"
import pathLib from "path"
import idTool from "../../tools/idTool.js"

export default {
  async dispatch({ app, action, args, appManager, io }) {
    switch (action) {
      case "screenshot":
        return new Promise(async (resolve) => {
          let sockets = []
          if (io.fetchSockets) {
            sockets = await io.fetchSockets()
          } else if (io.sockets && io.sockets.sockets) {
            sockets = Array.from(io.sockets.sockets.values())
          }

          if (sockets.length === 0) {
            return resolve({ ok: false, msg: "未检测到已连接的客户端" })
          }

          const tracker = DispatchTracker.create(30000)

          io.emit("app:dispatch", {
            appId: app.id,
            action: "screenshot",
            args,
            trackerId: tracker.id
          })

          const result = await tracker.promise

          if (!result || !result.ok || !result.svg) {
            return resolve(result || { ok: false, msg: "前端未返回 SVG 数据" })
          }

          try {
            const sharpMod = await import("sharp")
            const sharp = sharpMod.default || sharpMod

            const pngBuffer = await sharp(Buffer.from(result.svg))
              .resize({
                width: 1024,
                height: 1024,
                fit: "inside",
                withoutEnlargement: true
              })
              .png()
              .toBuffer()

            const uploadDir = pathLib.resolve("./attachment")
            await fs.ensureDir(uploadDir)
            const filename = idTool.get("file") + ".png"
            const savePath = pathLib.join(uploadDir, filename)
            await fs.writeFile(savePath, pngBuffer)

            resolve({
              ok: true,
              msg: "截图生成成功",
              data: {
                id: filename,
                url: `/attachment/${filename}`
              }
            })
          } catch (err) {
            console.error("【svgEditor】SVG → PNG 转换失败:", err)
            resolve({ ok: false, msg: "SVG 转 PNG 失败: " + err.message })
          }
        })

      case "draw":
      case "drawText":
      case "fill":
      case "getElements":
      case "edit":
      case "split":
      case "drawSvg":
      case "group":
      case "ungroup":
      case "layer":
        return new Promise(async (resolve) => {
          let sockets = []
          if (io.fetchSockets) {
            sockets = await io.fetchSockets()
          } else if (io.sockets && io.sockets.sockets) {
            sockets = Array.from(io.sockets.sockets.values())
          }

          if (sockets.length === 0) {
            return resolve({ ok: false, msg: "未检测到已连接的客户端" })
          }

          const tracker = DispatchTracker.create(30000)

          io.emit("app:dispatch", {
            appId: app.id,
            action,
            args,
            trackerId: tracker.id
          })

          const result = await tracker.promise
          resolve(result)
        })

      default:
        return { ok: false, msg: `未知的 svgEditor 动作 "${action}"` }
    }
  }
}
