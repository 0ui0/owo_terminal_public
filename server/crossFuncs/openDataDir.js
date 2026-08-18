import { shell } from "electron"
import tempPath from "../tools/tempPath.js"

export default {
  name: "openDataDir",
  func: async () => {
    try {
      const userDataDir = tempPath.getUserDataDir()
      await shell.openPath(userDataDir)
      return { ok: true, msg: "已打开数据目录" }
    } catch (e) {
      console.error("[CrossFunc] 打开数据目录失败:", e)
      return { ok: false, msg: e.message }
    }
  }
}
