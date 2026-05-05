import fs from "fs/promises"
import path from "path"
import appManager from "../../apps/appManager.js"

export default async () => {
  return {
    path: "/api/apps/{appType}/{filename*}",
    method: "get",
    options: {},
    handler: async (req, h) => {
      const { appType, filename } = req.params
      const appDef = appManager.appDefs.get(appType)

      if (!appDef || !appDef.frontendPath) {
        return h.response("App not found").code(404)
      }

      const appDir = path.dirname(appDef.frontendPath)
      const filePath = path.join(appDir, filename)

      try {
        if (filename.endsWith('.js')) {
          let content = await fs.readFile(filePath, 'utf-8')
          const timestamp = Date.now()
          // 核心：动态拦截所有相对路径 import，强行注入时间戳，彻底粉碎浏览器 ESM 缓存
          content = content.replace(/(import\s+.*?from\s+['"]|import\s*\(\s*['"]|from\s+['"]|import\s+['"])(\.\/|\.\.\/)(.*?)(['"])/g, (match, p1, p2, p3, p4) => {
            if (p3.includes('?')) return match
            return `${p1}${p2}${p3}?t=${timestamp}${p4}`
          })
          return h.response(content).type('application/javascript').header('Cache-Control', 'no-cache, no-store, must-revalidate')
        }
        return h.file(filePath).header('Cache-Control', 'no-cache, no-store, must-revalidate')
      } catch (e) {
        return h.response("File not found").code(404)
      }
    }
  }
}
