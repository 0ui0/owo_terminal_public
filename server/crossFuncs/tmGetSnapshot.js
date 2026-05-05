import path from "path";
import timeMachineEngine from "../apps/owoTimeMachine/timeMachineEngine.js";

export default {
  name: "tmGetSnapshot",
  func: async (msgId, projectRoot) => {
    try {
      if (!projectRoot) return { ok: false, msg: "未指定项目根目录喵" };
      const repoPath = path.join(projectRoot, ".owoTimeMachine");
      const res = await timeMachineEngine.findSnapshotByMsgId({ repoPath, msgId });
      if (!res.ok) return res;
      return { ok: true, snapshot: res.data };
    } catch (e) {
      console.error("[CrossFunc] tmGetSnapshot Error:", e);
      return { ok: false, msg: e.message };
    }
  }
};
