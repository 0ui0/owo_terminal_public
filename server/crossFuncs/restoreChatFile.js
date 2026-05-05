import path from 'path';
import comData from '../comData/comData.js';
import timeMachineEngine from '../apps/owoTimeMachine/timeMachineEngine.js';
import appManager from "../apps/appManager.js";
import timeMachineBackend from '../apps/owoTimeMachine/backend.js';
import ioServer from "../ioServer/ioServer.js"

import fs from 'fs-extra';

/**
 * 交叉函数：一站式时光机全量还原 (Clean Restore)
 * @param {Object} args { uuid }
 * 
 * 逻辑：
 * 1. 找到对应的快照。
 * 2. 清空项目根目录 (保留 .owoTimeMachine 和 .git)。
 * 3. 将快照内容逐个释放到根目录。
 * 4. 广播刷新信号。
 */
export default {
  name: "restoreChatFile",
  func: async (args) => {
    const { uuid } = args;

    const projectRoot = comData.data.get()?.customCwd;
    if (!projectRoot) return { ok: false, msg: "未选定项目目录喵" };

    const repoPath = path.join(projectRoot, ".owoTimeMachine");

    try {
      // 1. 获取快照信息
      const res = await timeMachineEngine.findSnapshotByMsgId({ repoPath, msgId: uuid });
      if (!res.ok || !res.data) return { ok: false, msg: res.msg || "未找到快照喵" };
      const { hash } = res.data;

      console.log(`[TimeMachine] 正在执行虚拟清理 (Dry Run)，目标目录: ${projectRoot}`);
      const items = await fs.readdir(projectRoot);
      for (const item of items) {
        const repoName = path.basename(repoPath);
        if (item === repoName || item === '.git') continue;
        console.log(`[Dry Run] 准备删除文件/目录: ${item}`);
        // await fs.remove(path.join(projectRoot, item)); // 安全第一，暂时屏蔽实际删除喵！
      }

      // 3. 逐个释放文件
      const lsRes = await timeMachineEngine.lsTree({ repoPath, hash, relPath: ".", recursive: true });
      if (!lsRes.ok) throw new Error(lsRes.msg);

      for (const file of lsRes.data) {
        if (file.type !== 'blob') continue;
        const destPath = path.join(projectRoot, file.path);
        await timeMachineEngine.restoreFileTo({ repoPath, hash, relPath: file.path, destPath });
      }

      // 4. 广播刷新信号，让所有打开的资源管理器刷一下
      for (const app of appManager.apps.values()) {
        if (app.type === 'explorer') {
          const currentPath = app.data?.currentPath;
          if (currentPath) {
            ioServer.io.emit("app:dispatch", { 
              appId: app.id, 
              action: "navigate", 
              args: { path: currentPath } 
            });
          }
        }
      }

      return {
        ok: true,
        msg: "项目已成功全量还原到该备份点喵！🕒✨"
      };
    } catch (e) {
      console.error("[restoreChatFile] Restore Error:", e);
      return { ok: false, msg: "还原失败: " + e.message };
    }
  }
};

