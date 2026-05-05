import path from 'path';
import { pathToFileURL } from 'url';

let timeMachineEngine;

/**
 * 时光机后端路由分发器
 */
const actions = {
  // 路由 A：加载备份 (App 专用)
  loadBackup: async ({ repoPath }) => {
    try {
      const repoCheck = await timeMachineEngine.isBackupRepo({ repoPath });
      if (!repoCheck.ok) {
        return { ok: false, msg: repoCheck.msg || "非法的备份仓库路径" };
      }
      const res = await timeMachineEngine.getHistory({ repoPath });
      if (!res.ok) return res;
      return { ok: true, history: res.data, repoPath, gitOk: true };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  // 路由 C：初始化备份
  init: async ({ repoPath }) => {
    try {
      return await timeMachineEngine.init({ repoPath });
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  // 路由 D：创建快照
  snap: async ({ repoPath, msg }) => {
    try {
      return await timeMachineEngine.snapshot({ repoPath, message: msg });
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  // 路由 E：获取特定版本列表
  ls: async (args) => {
    return await timeMachineEngine.lsTree(args);
  },

  // 路由 F：还原 (原位)
  restore: async ({ hash, relPath, repoPath }) => {
    try {
      return await timeMachineEngine.restore({ repoPath, hash, relPath });
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  // 路由 H：定点还原 (跨目录)
  restoreTo: async ({ repoPath, hash, relPath, destPath }) => {
    try {
      return await timeMachineEngine.restoreFileTo({ repoPath, hash, relPath, destPath });
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  // 路由 G：查看目录树
  lsTree: async (args) => {
    return await timeMachineEngine.lsTree(args);
  },

  // 路由 I：获取文件内容
  getFileContent: async ({ hash, relPath, repoPath }) => {
    try {
      return await timeMachineEngine.getFileContent({ repoPath, hash, relPath });
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  // 路由 J：检测嵌套仓库
  detectNested: async ({ repoPath }) => {
    try {
      return await timeMachineEngine.detectNested({ repoPath });
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  // 路由 K：删除快照
  deleteSnapshot: async ({ repoPath, id }) => {
    try {
      return await timeMachineEngine.deleteSnapshot({ repoPath, id });
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },
};

/**
 * 确保引擎已加载（用于应对热更新后的变量丢失）
 */
async function ensureEngine() {
  if (!timeMachineEngine) {
    console.log("[owoTimeMachine] Loading engine...");
    const enginePath = path.resolve(import.meta.dirname, './timeMachineEngine.js');
    const engineUrl = pathToFileURL(enginePath).href;
    const module = await import(`${engineUrl}?t=${Date.now()}`);
    console.log("[owoTimeMachine] Module imported:", !!module, !!module.default);
    timeMachineEngine = module.default;
    if (!timeMachineEngine) {
      console.error("[owoTimeMachine] CRITICAL: timeMachineEngine is undefined after import!");
    } else {
      await timeMachineEngine.checkGit();
      console.log("[owoTimeMachine] Engine initialized successfully.");
    }
  }
}

export default {
  // App 初始化钩子
  init: async (app) => {
    await ensureEngine();
    return { ok: true };
  },

  dispatch: async ({ app, action, args, appManager, io }) => {
    await ensureEngine(); // 每次分发前确保引擎可用
    if (actions[action]) {
      return await actions[action](args);
    }
    return { ok: false, msg: `owoTimeMachine dispatch未知操作: ${action}` };
  }
};
