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
        return h.file(filePath)
      } catch (e) {
        return h.response("File not found").code(404)
      }
    }
  }
}
