import timeMachineEngine from "../apps/owoTimeMachine/timeMachineEngine.js";
import path from "path";

/**
 * 交叉函数：获取时光机项目状态
 * 专供聊天窗口使用：探测选定【项目目录】是否受到时光机保护
 */
export default {
  name: "tmGetProjectStatus",
  func: async (projectRoot) => {
    try {
      if (!projectRoot) return { ok: false, msg: "未指定项目目录" };

      const gitStatus = await timeMachineEngine.checkGit();
      if (!gitStatus.ok) return { ok: false, gitOk: gitStatus, msg: gitStatus.msg };

      // 判定基准：项目目录下是否存在 .owoTimeMachine 子文件夹，且其内部符合仓库特征
      const repoPath = path.join(projectRoot, ".owoTimeMachine");
      const isReadyRes = await timeMachineEngine.isBackupRepo({ repoPath });
      const isReady = isReadyRes.ok;

      return {
        ok: true,
        isReady: isReady,
        projectRoot,
        repoPath,
        gitOk: true,
        msg: isReady ? "时间机器已就绪！" : "时间机器尚未初始化"
      };

    } catch (e) {
      console.error("[CrossFunc] tmGetProjectStatus failed:", e);
      return { ok: false, gitOk: false, msg: e.message };
    }
  }
};
