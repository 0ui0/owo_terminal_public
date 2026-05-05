import comData from "../comData/comData.js"
import ioServer from "../ioServer/ioServer.js"
import timeMachineEngine from "../apps/owoTimeMachine/timeMachineEngine.js"
import pathLib from "path"

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

      // --- 同步快照列表到 comData ---
      if (path) {
        const repoPath = pathLib.resolve(path, ".owoTimeMachine");
        const history = await timeMachineEngine.getHistory({ repoPath });
        await comData.data.edit((data) => {
          data.snapshots = history.ok ? history.data : [];
        });
      } else {
        await comData.data.edit((data) => {
          data.snapshots = [];
        });
      }

      return { ok: true }
    } catch (e) {
      console.error("[CrossFunc] setCustomCwd Error:", e)
      return { ok: false, msg: e.message }
    }
  }
}
