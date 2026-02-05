import ioServer from "../ioServer/ioServer.js"

export default {
  name: "appActive",
  func: async (appId, options = {}) => {
    try {
      if (ioServer.io) {
        ioServer.io.emit("app:active", { appId, ...options })
        return { ok: true }
      }
      return { ok: false, msg: "Socket server not initialized" }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
