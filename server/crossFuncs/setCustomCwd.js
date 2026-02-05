import comData from "../comData/comData.js"
import ioServer from "../ioServer/ioServer.js"

export default {
  name: "setCustomCwd",
  func: async (path) => {
    try {
      console.log(`[CrossFunc] setCustomCwd: Setting to ${path}`)
      await comData.data.edit((data) => {
        data.customCwd = path
      })
      if (ioServer.io) {
        ioServer.io.emit("sys:customCwd", { cwd: path })
      }
      return { ok: true }
    } catch (e) {
      console.error("[CrossFunc] setCustomCwd Error:", e)
      return { ok: false, msg: e.message }
    }
  }
}
