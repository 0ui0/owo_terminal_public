import fs from "fs-extra"
import path from "path"
import comData from "../comData/comData.js"
import aiBasic from "../tools/aiAsk/basic.js"
import appManager from "../apps/appManager.js"
import AdmZip from "adm-zip"
import archiveDb from "../db/archiveDb.js"

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
      // 在关闭数据库前读取所有聊天消息用于文本导出
      let messages = []
      if (archiveDb.tb_chat_messages) {
        messages = await archiveDb.tb_chat_messages.findAll({ raw: true })
      }

      // 临时释放存档数据库文件锁
      await archiveDb.close()

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
        })
      }

      // 使用 AdmZip 创建压缩包
      const zip = new AdmZip()
      zip.addFile("project.json", Buffer.from(JSON.stringify(data, null, 2), "utf-8"))

      // 写入纯文本聊天历史导出
      zip.addFile("chats_export.json", Buffer.from(JSON.stringify(messages, null, 2), "utf-8"))

      // 打包 SQLite 数据库文件
      const sqlitePath = path.resolve("./save/archive.sqlite")
      if (await fs.pathExists(sqlitePath)) {
        zip.addFile("archive.sqlite", await fs.readFile(sqlitePath))
      }

      // 将本地 upload 目录中的所有相关附件打包进去，排除数据库文件和导出历史文件本身
      const uploadDir = path.resolve("./attachment")
      if (await fs.pathExists(uploadDir)) {
        const files = await fs.readdir(uploadDir)
        for (const file of files) {
          const filePathFull = path.join(uploadDir, file)
          const stat = await fs.stat(filePathFull)
          if (stat.isFile() && file !== "archive.sqlite" && file !== "chats_export.json") {
            zip.addFile(`media/${file}`, await fs.readFile(filePathFull))
          }
        }
      }

      zip.writeZip(filePath)

      // 重新加载数据库连接
      await archiveDb.init()

      this.currentProjectPath = filePath
      this.isDirty = false
      console.log(`[ProjectManager] Saved as ZIP bundle to ${filePath}`)
      return { ok: true }
    } catch (e) {
      console.error("[ProjectManager] Save failed:", e)
      // 容错恢复数据库连接
      try {
        await archiveDb.init()
      } catch (err) {
        console.error("Restore DB in save fail:", err)
      }
      throw e
    }
  }

  // === Load ===
  async load(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath)
      let data = null

      // 关闭当前的存档库连接
      await archiveDb.close()

      // 物理删除当前的 SQLite 文件以准备写入/覆盖
      const sqlitePath = path.resolve("./save/archive.sqlite")
      await fs.remove(sqlitePath)

      // 嗅探格式：根据文件头判定 (ZIP 的签名是 PK\x03\x04, hex: 50 4b 03 04)
      if (fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b && fileBuffer[2] === 0x03 && fileBuffer[3] === 0x04) {
        console.log("[ProjectManager] Detected ZIP bundle format")
        const zip = new AdmZip(fileBuffer)
        const projectEntry = zip.getEntry("project.json")
        if (!projectEntry) throw new Error("Invalid .owo bundle: project.json missing")

        const projectText = zip.readAsText(projectEntry)
        // 兼容旧版：将所有的 /upload/ 引用替换为 /attachment/
        data = JSON.parse(projectText.replace(/\/upload\//g, "/attachment/"))

        // 解压 archive.sqlite
        const sqliteEntry = zip.getEntry("archive.sqlite")
        if (sqliteEntry) {
          await fs.ensureDir(path.dirname(sqlitePath))
          await fs.writeFile(sqlitePath, sqliteEntry.getData())
        }

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

      // 重启数据库服务
      await archiveDb.init()

      // 向下兼容：如果旧项目里 chatLists 的 data 数组有内容，则自动迁移并写入 sqlite 数据库，随后清空内存中的 data 数组
      if (data.comData && data.comData.chatLists) {
        for (const list of data.comData.chatLists) {
          if (list.data && list.data.length > 0) {
            for (const msg of list.data) {
              const exists = await archiveDb.tb_chat_messages.findOne({ where: { uuid: msg.uuid } })
              if (!exists) {
                await archiveDb.tb_chat_messages.create({
                  uuid: msg.uuid,
                  content: msg.content,
                  reasoning: msg.reasoning || null,
                  name: msg.name,
                  group: msg.group,
                  timestamp: msg.timestamp || Date.now(),
                  chatListId: list.id,
                  attachments: msg.attachments || [],
                  ask: msg.ask || null,
                  tid: msg.tid || null
                })
              }
            }
            // 清空旧内存，避免内存泄漏
            list.data = []
          }
        }
      }

      // 1. 恢复全局数据
      // 注意: 直接替换 comData 可能导致响应式引用断裂，最好是用 set/edit
      // 但 comData.data 是 DynamicData 实例，我们需要保留实例，更新内部 data
      // 假设 DynamicData 有 set 方法，或者我们逐个字段恢复
      await comData.data.edit(d => {
        for (const key in d) if (key !== "version") delete d[key];
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
      try {
        await archiveDb.init()
      } catch (err) {
        console.error("Restore DB in load fail:", err)
      }
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

  // === Reset ===
  async reset() {
    // 1. 清空路径和计时器
    this.currentProjectPath = null
    this.stopAutoSave()

    // 2. 清空存档 SQLite 数据库文件
    try {
      await archiveDb.close()
      const sqlitePath = path.resolve("./save/archive.sqlite")
      await fs.remove(sqlitePath)
    } catch (dbErr) {
      console.error("[ProjectManager] Reset DB file failed:", dbErr)
    } finally {
      try {
        await archiveDb.init()
      } catch (err) {
        console.error("Restore DB in reset fail:", err)
      }
    }

    // 3. 构造初始数据模板 (Capture from ioServer defaults)
    const initialData = {
      currentModel: "",
      sendMode: "agent",
      call: null,
      inputText: "",
      chatLists: [{
        id: 0,
        linkid: 0,
        replying: false,
        streamChunks: "",
        streamDisplayContent: "",
        streamReasoningChunks: "",
        confirmCmds: [],
        stop: false,
        tasks: [],
        notes: [],
        graph: { nodes: {}, links: [] }
      }],
      quotes: [],
      darkMode: true,
      faceAction: "smile",
      playFaces: {
        current: "",
        list: ["待机状态", "腾空", "上下漂浮", "降落", "待机状态", "待机状态", "待机状态", "左右行走"],
        index: 0,
      },
      currentTid: "",
      toolsMode: 3,
      targetChatListId: 0,
      enableThinking: false,
      thinkControl: false,
      defaultPet: "default",
      customCwd: "",
      snapshots: []
    }

    // 3. 执行物理重置 (改用 edit 以触发 dataSync 观察者，通知前端清空聊天列表)
    if (comData.data) {
      await comData.data.edit(d => {
        for (const key in d) if (key !== "version") delete d[key];
        Object.assign(d, initialData);
      })
    }

    // 4. 重置 AI 运行环境
    aiBasic.list.forEach(model => {
      model.clearAsks()
      model.clearMemorys()
      model.clearFnCallCache()
      model.clearUsage()
    })

    // 5. 关闭所有活动 App
    const apps = appManager.getSummary()
    for (const app of apps) {
      try {
        await appManager.close(app.id)
      } catch (e) {
        console.error(e)
      }
    }

    // 6. 归位脏位
    this.isDirty = false
    console.log("[ProjectManager] Project Reset Complete")
    return { ok: true }
  }
}

export default new ProjectManager()
