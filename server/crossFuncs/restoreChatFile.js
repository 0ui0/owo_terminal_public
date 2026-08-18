import path from 'path';
import workDirTool from '../tools/workDirTool.js';
import timeMachineEngine from '../apps/owoTimeMachine/timeMachineEngine.js';
import appManager from "../apps/appManager.js";
import ioServer from "../ioServer/ioServer.js"
import fs from 'fs-extra';

/**
 * 交叉函数：时光机还原（两阶段）
 * @param {Object} args { uuid, listId, selected? }
 *   - 无 selected：返回逆向 diff 列表（还原视角，A=新增/D=删除/M=覆盖）
 *   - 有 selected：按勾选路径执行还原（快照有则恢复，快照无则删除工作区文件）
 */
export default {
  name: "restoreChatFile",
  func: async (args) => {
    const { uuid, listId, selected } = args;

    try {
      // 项目根目录 = 该会话主工作目录，备份仓库 = 根目录/.owoTimeMachine
      const projectRoot = workDirTool.getMainWorkDir(listId);
      if (!projectRoot) return { ok: false, msg: "未选定项目目录喵" };
      const repoPath = path.join(projectRoot, ".owoTimeMachine");

      // 获取该消息对应的快照 hash
      const snapRes = await timeMachineEngine.findSnapshotByMsgId({ repoPath, msgId: uuid });
      if (!snapRes.ok || !snapRes.data) return { ok: false, msg: snapRes.msg || "未找到快照喵" };
      const { hash } = snapRes.data;

      // 阶段一：无 selected → 返回逆向 diff 列表
      if (!selected) {
        const diffRes = await timeMachineEngine.diffSnapshot({ repoPath, comparePath: projectRoot, options: { hash } });
        if (!diffRes.ok) return diffRes;
        return { ok: true, msg: "差异列表已获取喵！", data: diffRes.data };
      }

      // 阶段二：有 selected → 执行勾选还原；空勾选直接返回
      if (selected.length === 0) return { ok: false, msg: "未勾选任何文件，未执行还原" };
      const lsRes = await timeMachineEngine.lsTree({ repoPath, hash, relPath: ".", recursive: true });
      if (!lsRes.ok) throw new Error(lsRes.msg);
      const snapshotPaths = new Set(lsRes.data.filter(f => f.type === 'blob').map(f => f.path));

      for (const rel of selected) {
        if (snapshotPaths.has(rel)) {
          // 快照有 → 新增/覆盖：从快照恢复
          const destPath = path.join(projectRoot, rel);
          await timeMachineEngine.restoreFileTo({ repoPath, hash, relPath: rel, destPath });
        } else {
          // 快照无 → 删除：暂不物理删除，先输出路径
          console.log("[restoreChatFile] 待删除文件:", path.join(projectRoot, rel));
          // await fs.remove(path.join(projectRoot, rel));
        }
      }

      // 广播刷新信号，让所有打开的资源管理器刷一下
      for (const app of appManager.apps.values()) {
        if (app.type === 'explorer') {
          const currentPath = app.data?.currentPath;
          if (currentPath) {
            ioServer.io.emit("app:dispatch", { appId: app.id, action: "navigate", args: { path: currentPath } });
          }
        }
      }

      return { ok: true, msg: "所选文件已还原喵！🕒" };
    } catch (e) {
      console.error("[restoreChatFile] Restore Error:", e);
      return { ok: false, msg: "还原失败: " + e.message };
    }
  }
};
