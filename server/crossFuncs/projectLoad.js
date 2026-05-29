
import Joi from "joi"
import projectManager from "../managers/projectManager.js"
import { dialog } from "electron"
import ioServer from "../ioServer/ioServer.js"
import { trs } from "../tools/i18n.js"
import timeMachineEngine from "../apps/owoTimeMachine/timeMachineEngine.js"
import pathLib from "path"
import comData from "../comData/comData.js"

export default {
  name: "projectLoad",
  func: async ({ path }) => {
    let filePath = path

    if (!filePath) {
      try {
        const { filePaths, canceled } = await dialog.showOpenDialog({
          title: "打开项目",
          filters: [{ name: "Owo Project", extensions: ["owo", "json"] }],
          properties: ["openFile"]
        })

        if (canceled || filePaths.length === 0) {
          return { ok: false, msg: "User canceled" }
        }
        filePath = filePaths[0]
      } catch (e) {
        return { ok: false, msg: "Dialog failed: " + e.message }
      }
    }

    try {
      await projectManager.load(filePath)
      
      if (ioServer.io) {
        projectManager.startAutoSave() // 首次加载后自动开启定时器
        ioServer.io.emit("project:state", { path: filePath, autoSave: true })
        ioServer.io.emit("notice", trs("系统/消息/载入成功"))

        // --- 同步快照列表 ---
        const currentCwd = comData.data.get()?.customCwd;
        if (currentCwd) {
          const repoPath = pathLib.resolve(currentCwd, ".owoTimeMachine");
          const history = await timeMachineEngine.getHistory({ repoPath });
          await comData.data.edit((data) => {
            data.snapshots = history.ok ? history.data : [];
          });
        }
      }

      return { ok: true, msg: "项目已成功载入喵！", path: filePath }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
