import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "获取QQ机器人列表",
  id: "getBotAgents",
  async fn(argObj) {
    try {
      const { _localStore } = await import("../lib/botCmds/botCmd_aiAsk.js")
      const { default: subAgents } = await import("../../../tools/aiAsk/subAgents.js")
      const app = [...appManager.apps.values()].find(a => a.type === "qqBot");
      if (!app) return { ok: false, msg: "未找到 qqBot 运行实例" };

      const cfg = app.data.config;
      const groupKeys = ["3rd_qqRobot_groups", "3rd_qqRobotLocal_groups", "3rd_qqRobot_channels"];
      const bots = [];

      for (const key of groupKeys) {
        const groupArr = cfg[key] || [];
        for (const group of groupArr) {
          if (group.listId) {
            const groupid = group.groupid || group.channelid;
            const state = _localStore.groups[groupid] || {};
            const typeLabel = key.includes("Local") ? "本地" : (key.includes("channels") ? "频道" : "官方");
            const agentName = agent ? agent.name : group.name;

            bots.push({
              listId: group.listId,
              agentName: `${agentName}(${typeLabel}-${groupid})`,
              groupName: group.name,
              groupid: groupid,
              type: key.includes("Local") ? "本地QQ群" : (key.includes("channels") ? "QQ频道" : "QQ官方群"),
              switch: group.switch ? "已开启" : "已关闭",
              model: group.derivedFromAgentName || group.model || "默认",
              stats: {
                energy: state.energy != null ? Number(state.energy.toFixed(1)) : "未知",
                excitement: state.excitement != null ? Number(state.excitement.toFixed(2)) : "未知",
                dailyUsage: state.dailyUsage || 0,
                isThinking: !!state.isThinking
              }
            });
          }
        }
      }

      return {
        ok: true,
        msg: `获取到 ${bots.length} 个QQ机器人子智能体状态`,
        data: bots
      }
    } catch (err) {
      console.log(err)
      return { ok: false, msg: err.message }
    }
  },
  joi() {
    return Joi.object({})
  },
  getDoc() {
    return "获取当前系统已连接的所有QQ机器人（群聊/频道）的列表 ID 和状态。主 AI 可以根据返回的 listId，通过 callAgent 或 findHistoryChats 与这些子智能体进行通信或查询历史记录。"
  }
}
