import fs from "fs/promises"
import path from "path"
import comData from "../comData/comData.js"
import aiBasic from "../tools/aiAsk/basic.js"
import appManager from "../apps/appManager.js"
import { tSession } from "../ioServer/ioApis/chat/ioApi_chat.js"

class ProjectManager {
  constructor() {
    this.currentProjectPath = null
    this.autoSaveInterval = null
    this.isDirty = false
  }

  markDirty() {
    this.isDirty = true
  }

  // === Save ===
  async save(filePath) {
    try {
      const data = {
        meta: {
          version: "1.0.0",
          timestamp: Date.now(),
          platform: process.platform
        },
        // 1. 全局数据 (聊天记录, 设置)
        comData: comData.data.get(),

        // 2. AI 状态 (记忆, 上下文)
        aiState: aiBasic.list.map(model => ({
          name: model.name,
          state: model.exportState()
        })),

        // 3. App 状态 (运行中的 App)
        appState: appManager.getSummary().map(app => {
          // 尝试让 backend 导出更详细的状态（如果有）
          const appDef = appManager.appDefs.get(app.type)
          return {
            id: app.id,
            type: app.type,
            data: app.data,
            guiLaunched: app.guiLaunched,
            // TODO: 未来可扩展 backend.exportState(app)
          }
        }),

        // 4. 终端状态 (cwd 等)
        terminalState: tSession.getSummary()
      }

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
      this.currentProjectPath = filePath
      this.isDirty = false
      console.log(`[ProjectManager] Saved to ${filePath}`)
      return { ok: true }
    } catch (e) {
      console.error("[ProjectManager] Save failed:", e)
      throw e
    }
  }

  // === Load ===
  async load(filePath) {
    try {
      const jsonStr = await fs.readFile(filePath, "utf-8")
      const data = JSON.parse(jsonStr)

      // 1. 恢复全局数据
      // 注意: 直接替换 comData 可能导致响应式引用断裂，最好是用 set/edit
      // 但 comData.data 是 DynamicData 实例，我们需要保留实例，更新内部 data
      // 假设 DynamicData 有 set 方法，或者我们逐个字段恢复
      await comData.data.edit(d => {
        Object.assign(d, data.comData)
      })

      // 2. 恢复 AI 状态
      if (data.aiState) {
        data.aiState.forEach(savedModel => {
          const target = aiBasic.list.find(m => m.name === savedModel.name)
          if (target) {
            target.importState(savedModel.state)
          }
        })
      }

      // 3. 恢复 App (先关闭所有现有 App)
      const currentApps = appManager.getSummary()
      for (const app of currentApps) {
        await appManager.close(app.id)
      }

      // 重新启动 App
      if (data.appState) {
        for (const savedApp of data.appState) {
          await appManager.launch(savedApp.type, {
            appId: savedApp.id,
            data: savedApp.data,
            background: !savedApp.guiLaunched
          })
        }
      }

      this.currentProjectPath = filePath
      this.isDirty = false
      console.log(`[ProjectManager] Loaded from ${filePath}`)
      return { ok: true }

    } catch (e) {
      console.error("[ProjectManager] Load failed:", e)
      throw e
    }
  }

  // === Auto Save ===
  startAutoSave(intervalMs = 60000 * 5) {
    this.stopAutoSave()
    this.autoSaveInterval = setInterval(() => {
      if (this.currentProjectPath) {
        this.save(this.currentProjectPath).catch(err => console.error("AutoSave Error:", err))
      }
    }, intervalMs)
  }

  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval)
      this.autoSaveInterval = null
    }
  }
}

export default new ProjectManager()
