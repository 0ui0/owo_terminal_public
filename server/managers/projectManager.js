import fs from "fs-extra"
import path from "path"
import comData from "../comData/comData.js"
import aiBasic from "../tools/aiAsk/basic.js"
import appManager from "../apps/appManager.js"
import { tSession } from "../ioServer/ioApis/chat/ioApi_chat.js"
import AdmZip from "adm-zip"

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
          version: "1.1.0",
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

        // 3. App 状态
        appState: appManager.getSummary().map(app => {
          return {
            id: app.id,
            type: app.type,
            data: app.data,
            guiLaunched: app.guiLaunched,
          }
        }),

        // 4. 终端状态
        terminalState: tSession.getSummary()
      }

      // 使用 AdmZip 创建压缩包
      const zip = new AdmZip()
      zip.addFile("project.json", Buffer.from(JSON.stringify(data, null, 2), "utf-8"))

      // 将本地 upload 目录中的所有相关附件打包进去
      const uploadDir = path.resolve("./attachment")
      if (await fs.pathExists(uploadDir)) {
        // 只增加当前项目中被引用的附件？或者简单起见全部打包（如果 upload 目录只服务于当前项目）
        // 根据目前的架构，upload 是会话级的，直接打包整个目录即可
        zip.addLocalFolder(uploadDir, "media")
      }

      zip.writeZip(filePath)

      this.currentProjectPath = filePath
      this.isDirty = false
      console.log(`[ProjectManager] Saved as ZIP bundle to ${filePath}`)
      return { ok: true }
    } catch (e) {
      console.error("[ProjectManager] Save failed:", e)
      throw e
    }
  }

  // === Load ===
  async load(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath)
      let data = null

      // 嗅探格式：根据文件头判定 (ZIP 的签名是 PK\x03\x04, hex: 50 4b 03 04)
      if (fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b && fileBuffer[2] === 0x03 && fileBuffer[3] === 0x04) {
        console.log("[ProjectManager] Detected ZIP bundle format")
        const zip = new AdmZip(fileBuffer)
        const projectEntry = zip.getEntry("project.json")
        if (!projectEntry) throw new Error("Invalid .owo bundle: project.json missing")

        const projectText = zip.readAsText(projectEntry)
        // 兼容旧版：将所有的 /upload/ 引用替换为 /attachment/
        data = JSON.parse(projectText.replace(/\/upload\//g, "/attachment/"))

        // 提取附件到当前的 upload 目录
        const uploadDir = path.resolve("./attachment")
        await fs.ensureDir(uploadDir)

        // 提取 media 文件夹内容到 upload
        const zipEntries = zip.getEntries()
        for (const entry of zipEntries) {
          if (entry.entryName.startsWith("media/") && !entry.isDirectory) {
            const targetFileName = entry.entryName.replace("media/", "")
            await fs.writeFile(path.join(uploadDir, targetFileName), entry.getData())
          }
        }
      } else {
        console.log("[ProjectManager] Detected legacy JSON format")
        const projectText = fileBuffer.toString("utf-8")
        // 同样执行兼容性替换
        data = JSON.parse(projectText.replace(/\/upload\//g, "/attachment/"))
      }

      // 1. 恢复全局数据
      // 注意: 直接替换 comData 可能导致响应式引用断裂，最好是用 set/edit
      // 但 comData.data 是 DynamicData 实例，我们需要保留实例，更新内部 data
      // 假设 DynamicData 有 set 方法，或者我们逐个字段恢复
      await comData.data.edit(d => {
        for (const key in d) delete d[key];
        Object.assign(d, data.comData);
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

      // 3. 恢复 App
      const currentApps = appManager.getSummary()
      for (const app of currentApps) {
        await appManager.close(app.id)
      }

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
      console.log(`[ProjectManager] Successfully Loaded from ${filePath}`)
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
