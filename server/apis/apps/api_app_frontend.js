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
          // 核心修复：时间戳继承！如果请求带了 ?t=，就复用它；否则生成新的
          const timestamp = req.query.t || Date.now()
          
          // 核心：动态拦截所有相对路径 import，注入统一时间戳，粉碎缓存的同时支持浏览器自行解决循环依赖
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
