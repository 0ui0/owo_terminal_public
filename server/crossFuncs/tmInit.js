import path from 'path';
import fs from 'fs-extra';
import timeMachineEngine from "../apps/owoTimeMachine/timeMachineEngine.js";

export default {
  name: "tmInit",
  func: async (projectRoot) => {
    try {
      if (!projectRoot) return { ok: false, msg: "项目目录未选择" };
      const repoPath = path.join(projectRoot, ".owoTimeMachine");
      await fs.ensureDir(repoPath);
      return await timeMachineEngine.init({ repoPath });
    } catch (e) {
      console.error("[TimeMachine] Init error:", e);
      return { ok: false, msg: e.message };
    }
  }
};
