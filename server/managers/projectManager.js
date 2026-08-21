import fs from "fs-extra"
import path from "path"
import comData from "../comData/comData.js"
import defaultComData from "../tools/defaultComData.js"
import subAgents from "../tools/aiAsk/subAgents.js"
import appManager from "../apps/appManager.js"
import AdmZip from "adm-zip"
import archiveDb from "../db/archiveDb.js"
import migrations from "./owoMigrations.js"
import tempPath from "../tools/tempPath.js"
import options from "../config/options.js"

class ProjectManager {
  constructor() {
    this.currentProjectPath = null
    this.isDirty = false
    
    // 全局唯一自动保存心跳 (5分钟)
    setInterval(() => {
      const isAutoSave = options.get("global_projectAutoSave")
      if (isAutoSave === 1 && this.currentProjectPath && this.isDirty) {
        this.save(this.currentProjectPath).catch(err => console.error("AutoSave Error:", err))
      }
    }, 60000 * 5)
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
          version: "1.3.0",
          timestamp: Date.now(),
          platform: process.platform
        },
        // 1. 全局数据 (聊天记录, 设置)
        comData: comData.data.get(),

        // 2. AI 状态 (记忆, 上下文)
        aiState: Array.from(subAgents.getAll()).map(([listId, agent]) => ({
          listId: listId,
          name: agent.name,
          state: agent.exportState()
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
      const sqlitePath = tempPath.get("save/archive.sqlite")
      if (await fs.pathExists(sqlitePath)) {
        zip.addFile("archive.sqlite", await fs.readFile(sqlitePath))
      }

      // 将本地 upload 目录中的所有相关附件打包进去，排除数据库文件和导出历史文件本身
      const uploadDir = tempPath.get("attachment")
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
  async load(filePath, opts = {}) {
    try {
      const fileBuffer = await fs.readFile(filePath)
      let data = null

      const CURRENT_VERSION = "1.3.0"; // 最新系统存档版本号

      // 嗅探格式：根据文件头判定 (ZIP 的签名是 PK\x03\x04, hex: 50 4b 03 04)
      let zip = null
      if (fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b && fileBuffer[2] === 0x03 && fileBuffer[3] === 0x04) {
        console.log("[ProjectManager] Detected ZIP bundle format")
        zip = new AdmZip(fileBuffer)
        const projectEntry = zip.getEntry("project.json")
        if (!projectEntry) throw new Error("Invalid .owo bundle: project.json missing")

        const projectText = zip.readAsText(projectEntry)
        data = JSON.parse(projectText)
      } else {
        console.log("[ProjectManager] Detected legacy JSON format")
        const projectText = fileBuffer.toString("utf-8")
        data = JSON.parse(projectText)
      }

      // 结构迁移：无版本号或低于当前版本的存档，跑迁移链对齐到当前结构
      const savedVersion = data.meta?.version || "0";
      if (!migrations.canMigrate(savedVersion) && !opts.forceConvert) {
        return {
          ok: false,
          msg: "VERSION_MISMATCH",
          currentVersion: CURRENT_VERSION,
          savedVersion: savedVersion
        };
      }
      data = await migrations.run(data, CURRENT_VERSION)

      // 版本匹配（或兼容模式），才开始破坏性操作：关闭当前的存档库连接
      await archiveDb.close()

      // 物理删除当前的 SQLite 文件及所有可能存在的 WAL 残留
      const sqlitePath = tempPath.get("save/archive.sqlite")
      await fs.remove(sqlitePath)
      await fs.remove(sqlitePath + "-wal")
      await fs.remove(sqlitePath + "-shm")

      // 解压 archive.sqlite（仅 ZIP 格式）
      if (zip) {
        const sqliteEntry = zip.getEntry("archive.sqlite")
        if (sqliteEntry) {
          await fs.ensureDir(path.dirname(sqlitePath))
          await fs.writeFile(sqlitePath, sqliteEntry.getData())
        }

        // 提取附件到当前的 upload 目录
        const uploadDir = tempPath.get("attachment")
        await fs.ensureDir(uploadDir)

        // 提取 media 文件夹内容到 upload
        const zipEntries = zip.getEntries()
        for (const entry of zipEntries) {
          if (entry.entryName.startsWith("media/") && !entry.isDirectory) {
            const targetFileName = entry.entryName.replace("media/", "")
            await fs.writeFile(path.join(uploadDir, targetFileName), entry.getData())
          }
        }
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

      // 2. 按存档中的模型重建各沙盒实例（currentModel 转换已由迁移链完成）
      const savedLists = data.comData?.chatLists || [];
      for (const list of savedLists) {
        if (list.currentModelId) {
          try {
            await subAgents.initAgent(list.id, list.currentModelId);
          } catch (e) {
            console.warn(`[ProjectManager] initAgent(${list.id}, ${list.currentModelId}) failed:`, e.message);
          }
        }
      }

      // 3. 恢复 AI 状态
      if (data.aiState) {
        data.aiState.forEach(savedModel => {
          const listId = savedModel.listId !== undefined ? savedModel.listId : 0;
          const target = subAgents.get(listId);
          if (target) {
            target.importState(savedModel.state)
            if (savedModel.name) {
              target.name = savedModel.name
              if (target.aiConfig) target.aiConfig.name = savedModel.name
            }
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



  // === Reset ===
  async reset() {
    // 1. 【UI 响应先行】立即重置全局 comData 数据 (触发 dataSync 观察者，通知前端 0ms 瞬间清空聊天列表)
    if (comData.data) {
      await comData.data.edit(d => {
        for (const key in d) if (key !== "version") delete d[key];
        Object.assign(d, defaultComData());
      })
    }

    // 2. 清空路径和计时器，归位脏位
    this.currentProjectPath = null
    // 注：自动保存已重构为 constructor 内 setInterval 心跳，无需 stopAutoSave
    this.isDirty = false

    // 3. 重置 AI 运行环境
    for (const [id, agent] of subAgents.getAll()) {
      agent.clearAsks()
      agent.initPrompt()
      agent.clearMemorys()
      agent.clearFnCallCache()
      agent.clearUsage()
    }

    // 4. 关闭所有活动 App
    const apps = appManager.getSummary()
    for (const app of apps) {
      try {
        await appManager.close(app.id)
      } catch (e) {
        console.error(e)
      }
    }

    // 5. 后台清理与重建存档 SQLite 数据库文件及临时附件
    try {
      await archiveDb.close()
      const sqlitePath = tempPath.get("save/archive.sqlite")
      await fs.remove(sqlitePath)
      await fs.remove(sqlitePath + "-wal")
      await fs.remove(sqlitePath + "-shm")
      const uploadDir = tempPath.get("attachment")
      await fs.emptyDir(uploadDir)
    } catch (dbErr) {
      console.error("[ProjectManager] Reset DB file failed:", dbErr)
    } finally {
      try {
        await archiveDb.init()
      } catch (err) {
        console.error("Restore DB in reset fail:", err)
      }
    }

    console.log("[ProjectManager] Project Reset Complete")
    return { ok: true }
  }
}

export default new ProjectManager()
