/* botCmd_aiAsk.js - owo_terminal 适配版 (基于 message 数组的精准识别) */
import backend from "../../backend.js";
import options from "../../../../config/options.js";
import getMsgProtocalConfig from "../../../../ioServer/ioApis/chat/getMsgProtocalConfig.js";
// ==========================================
// ⚙️ 社交脉冲配置字典 (UI可配置)
// ==========================================
const botPulseConfig = {
  dailyGroupLimit: { cnName: "群组每日消息上限", enName: "dailyGroupLimit", value: 160 },
  dailyUserLimit: { cnName: "个人每日消息上限", enName: "dailyUserLimit", value: 20 },
  cooldownMs: { cnName: "回复冷却时间(毫秒)", enName: "cooldownMs", value: 20000 },
  energyCost: { cnName: "回复消耗能量", enName: "energyCost", value: 10 },
  energyThreshold: { cnName: "回复能量门槛", enName: "energyThreshold", value: 10 },
  maxEnergy: { cnName: "能量槽上限", enName: "maxEnergy", value: 100 },
  energyRegenPerHour: { cnName: "每小时自然恢复能量", enName: "energyRegenPerHour", value: 20 },
  activeWindowMs: { cnName: "活跃窗口时长(毫秒)", enName: "activeWindowMs", value: 300000 },
  excitementAdd: { cnName: "每条消息增加兴奋度", enName: "excitementAdd", value: 0.05 },
  passiveProbMax: { cnName: "最大插嘴概率", enName: "passiveProbMax", value: 0.05 },
  chargePerMsg: { cnName: "单条消息充能", enName: "chargePerMsg", value: 0.5 },
  chargeUserDailyMax: { cnName: "单人每日充能上限", enName: "chargeUserDailyMax", value: 5 },
  chargeGroupDailyMax: { cnName: "全群每日充能总上限", enName: "chargeGroupDailyMax", value: 50 }
};

// ==========================================
// 🧠 本地状态存储 (持久化于模块内存)
// ==========================================
export const _localStore = {
  groups: {},
  users: {},
  lastGlobalResetDate: new Date().toLocaleDateString()
};

// ==========================================
// 🛡️ 门卫模块 (Guard): 负责状态、注意力、防御与拦截
// ==========================================
const Guard = {
  // 1. 获取或初始化群组状态
  getGroupState: (fromId) => {
    const now = Date.now();
    const nowDay = new Date().toLocaleDateString();

    if (!_localStore.groups[fromId]) {
      _localStore.groups[fromId] = {
        excitement: 0, energy: botPulseConfig.maxEnergy.value, windowEndTime: 0,
        lastReplyTime: 0, lastUserMsgTime: 0, lastEnergyRegenTime: now,
        dailyUsage: 0, dailyExtraEnergy: 0, lastResetDate: nowDay,
        debounceTimer: null,
        isThinking: false // [思维锁] 初始状态：空闲
      };
    }
    const groupState = _localStore.groups[fromId];

    // 每日重置检查 (单群)
    if (groupState.lastResetDate !== nowDay) {
      console.log(`[qqBot][${fromId}] 跨日重置: ${groupState.lastResetDate} -> ${nowDay}`);
      groupState.dailyUsage = 0;
      groupState.dailyExtraEnergy = 0;
      groupState.lastResetDate = nowDay;
    }

    // 全局用户重置检查
    if (_localStore.lastGlobalResetDate !== nowDay) {
      console.log(`[qqBot] 触发全局跨日重置: ${_localStore.lastGlobalResetDate} -> ${nowDay}`);
      _localStore.lastGlobalResetDate = nowDay;
      for (const uid in _localStore.users) {
        _localStore.users[uid].usage = 0;
        _localStore.users[uid].providedEnergy = 0;
      }
    }

    // 社交能量自然恢复
    const elapsedHours = (Date.now() - groupState.lastEnergyRegenTime) / (1000 * 60 * 60);
    const regenAmount = isNaN(elapsedHours) ? 0 : elapsedHours * botPulseConfig.energyRegenPerHour.value;
    groupState.energy = Math.min(botPulseConfig.maxEnergy.value, groupState.energy + regenAmount);
    groupState.lastEnergyRegenTime = Date.now();
    return groupState;
  },

  // 2. 注意力更新
  updateAttention: (msg, isAtMe, groupState, userId, fromId, userNickname) => {
    const now = Date.now();
    // 指数衰减兴奋度
    if (groupState.lastUserMsgTime > 0) {
      const elapsed = (now - groupState.lastUserMsgTime) / 1000;
      groupState.excitement *= Math.pow(0.7, elapsed / 30);
    }
    groupState.lastUserMsgTime = now;

    // [社交充能]：每条消息都会为机器人提供微量能量，即便它打算回话
    if (userId && userId !== "unknown") {
      if (!_localStore.users[userId]) _localStore.users[userId] = { usage: 0, providedEnergy: 0 };
      const userState = _localStore.users[userId];

      if ((groupState.dailyExtraEnergy || 0) < botPulseConfig.chargeGroupDailyMax.value &&
        (userState.providedEnergy || 0) < botPulseConfig.chargeUserDailyMax.value) {

        const charge = botPulseConfig.chargePerMsg.value;
        groupState.energy = Math.min(botPulseConfig.maxEnergy.value, groupState.energy + charge);
        groupState.dailyExtraEnergy = (groupState.dailyExtraEnergy || 0) + charge;
        userState.providedEnergy = (userState.providedEnergy || 0) + charge;
        console.log(`[qqBot][充能] 群:${fromId} | 人:${userNickname}(${userId}) 贡献 ${charge} 点 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`);
      }
    }

    const hasKeyword = /米卡卡|宅喵|机器人/.test(msg);

    if (isAtMe || hasKeyword) {
      groupState.excitement = 1.0;
      if (now > groupState.windowEndTime) {
        groupState.windowEndTime = now + botPulseConfig.activeWindowMs.value;
      }
    } else {
      // [被动累积]
      groupState.excitement = Math.min(1.0, groupState.excitement + botPulseConfig.excitementAdd.value);
    }
  },

  // 3. 拦截判定
  shouldRespond: async (isAtMe, userId, groupState, msgCenter, listId, meta) => {
    const now = Date.now();

    // [思维锁拦截]
    if (groupState.isThinking) return false;

    // [每日熔断] 单群限额
    if (groupState.dailyUsage >= botPulseConfig.dailyGroupLimit.value) {
      console.log(`[qqBot][拦截] 达到群组日限额 (${groupState.dailyUsage}) (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`);
      return false;
    }

    // [用户级限流] 单人限额
    if (!_localStore.users[userId]) _localStore.users[userId] = { usage: 0, providedEnergy: 0 };
    if (_localStore.users[userId].usage >= botPulseConfig.dailyUserLimit.value) {
      if (isAtMe) {
        console.log(`[qqBot][拦截] 用户 ${userId} 达到个人日限额 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`);
        const tips = ["米卡卡累了喵~", "别吵，明天再来！", "额度不足喵~"];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        const replyExt = { listId, meta };
        await msgCenter.localMsgSendToQqLocalGroups("系统", "系统", tip, replyExt);
        await msgCenter.localMsgSendToQqGroups("系统", "系统", tip, replyExt);
        await msgCenter.localMsgSendToQqChannelGroups("系统", "系统", tip, replyExt);
      }
      return false;
    }

    // [冷静期]
    if (now - groupState.lastReplyTime < botPulseConfig.cooldownMs.value) return false;

    // [能量判定]
    if (groupState.energy < botPulseConfig.energyThreshold.value) {
      console.log(`[qqBot][拦截] 能量不足门槛 (${groupState.energy.toFixed(1)}) (🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`);
      return false;
    }

    // [核心判定逻辑]
    if (isAtMe) {
      console.log(`[qqBot][触发] 艾特响应 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`);
      return true;
    }

    if (now < groupState.windowEndTime) {
      console.log(`[qqBot][触发] 活跃窗口响应 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`);
      return true;
    } else {
      const passiveProb = groupState.excitement * botPulseConfig.passiveProbMax.value;
      const dice = Math.random();
      const isPassive = dice < passiveProb;
      if (isPassive) {
        console.log(`[qqBot][触发] 被动脉冲插嘴 (概率: ${(passiveProb * 100).toFixed(1)}%) (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`);
      }
      return isPassive;
    }
  },

  // 4. 防抖延时触发
  debounceExecute: (fromId, callback) => {
    const groupState = Guard.getGroupState(fromId);
    if (groupState.debounceTimer) clearTimeout(groupState.debounceTimer);
    groupState.debounceTimer = setTimeout(() => {
      groupState.debounceTimer = null;
      callback();
    }, 5000);
  }
};

// ==========================================
// 🚀 执行模块 (Executor): 负责环境识别与 AI 通讯
// ==========================================
const Executor = {
  // 识别环境：从原始 meta.message 中判定艾特
  resolveContext: (sendParams) => {
    const { source, meta, user } = sendParams;
    let fromId = null;
    if (source === "qqLocal/group") fromId = meta?.group_id;
    else if (source === "qqOnline/group") fromId = meta?.d?.group_id;
    else if (source === "qqOnline/channel") fromId = meta?.d?.channel_id;

    if (!fromId) return {};

    // [零假设艾特判定]
    const selfId = String(meta?.self_id || meta?.d?.self_id);
    const isAtMe = (Array.isArray(meta?.message) && meta.message.some(m =>
      m.type === "at" && String(m.data?.qq) === selfId
    )) || (meta?.d?.mentions && Array.isArray(meta.d.mentions) && meta.d.mentions.some(m => String(m.id) === selfId));

    // 唯一标识提取优先级：本地QQ号 > 官方OpenID > 官方频道作者ID > 系统用户名
    const userId = meta?.user_id || meta?.d?.author?.union_openid || meta?.d?.author?.id || meta?.author?.id || user || "unknown";
    return { fromId, userId, userNickname: user, isAtMe, groupState: Guard.getGroupState(fromId) };
  },

  // 获取群组配置
  getGroupConfig: (source, fromId) => {
    const config = backend.app?.data?.config;
    let search = [];
    if (source === "qqLocal/group") search = config?.["3rd_qqRobotLocal_groups"] || [];
    else if (source === "qqOnline/group") search = config?.["3rd_qqRobot_groups"] || [];
    else if (source === "qqOnline/channel") search = config?.["3rd_qqRobot_channels"] || [];

    const found = search.find(g => String(g.groupid || g.channelid) === String(fromId));
    return found || null;
  },

  executeThinking: async (sendParams) => {
    const { msgCenter, ext, meta, source, user } = sendParams;
    const { fromId, userId, isAtMe, groupState } = Executor.resolveContext(sendParams);

    // [开启思维锁]
    groupState.isThinking = true;

    try {
      const { default: subAgents } = await import("../../../../tools/aiAsk/subAgents.js");
      let listId = ext?.listId || 0;

      if (!listId) {
        const found = Executor.getGroupConfig(source, fromId);
        if (found?.switch) listId = found.listId;
      }
      if (!listId) return;

      const agent = subAgents.get(listId);
      if (!agent) return;

      const targetName = agent.aiConfig?.derivedFromAgentName;
      if (!targetName) return;

      groupState.lastReplyTime = Date.now();
      groupState.dailyUsage += 1;
      _localStore.users[userId].usage += 1;
      groupState.energy -= botPulseConfig.energyCost.value;
      console.log(`[qqBot][耗能] 回复完成。剩余能量: ${groupState.energy.toFixed(1)} (📊${groupState.dailyUsage}/${botPulseConfig.dailyGroupLimit.value})`);

      const aiList = await options.get("ai_aiList");
      const currentTokenConfig = aiList.find(m => m.name === targetName);

      const allowApps = ["browser"];
      for (const app of allowApps) await backend.appManager.registerAppTools(app);
      const tools = backend.appManager.getTools().filter(t => allowApps.includes(t._appType) || t.id === 'findHistoryChats');

      await agent.sendAskByMsgProtocol(getMsgProtocalConfig({
        targetModel: agent, listId, currentTokenConfig,
        extraConfig: {
          tools, toolsMode: 1,
          // 【核心修复】强制覆盖全局钩子，消除 preToken 读取错误
          onSendAskBefore: async () => {
            const innerAiList = await options.get("ai_aiList");
            const mIdx = innerAiList.findIndex(m => m.name === targetName);
            if (mIdx === -1 || innerAiList[mIdx].preTokens <= 0) {
              throw new Error(`[余额预警] ${targetName} 配置无效或额度不足`);
            }
          },
          onTokenChange: async (inst, usage) => {
            const innerAiList = await options.get("ai_aiList");
            const mIdx = innerAiList.findIndex(m => m.name === targetName);
            if (innerAiList[mIdx]) {
              innerAiList[mIdx].preTokens = Number(innerAiList[mIdx].preTokens) - Number(usage.totalT);
              await options.set("ai_aiList", innerAiList);
            }
          },
          onResponse: async (reply) => {
            let content = reply.content;
            let parseSuccess = false;
            try {
              const p = JSON.parse(content);
              content = p.content || content;
              parseSuccess = true;
            } catch (e) {
              // 解析失败说明是中间过程、报错或非 JSON 格式
              parseSuccess = false;
            }

            const replyExt = { listId, meta, group: reply.group, ask: reply };

            // [全量记录] 本地 UI 放行。如果解析成功则发纯文本，失败则发原始 JSON/报错
            await msgCenter.localSend(null, "宅喵", content, replyExt);

            // [精准过滤] 只有正常的智能体回复且解析成功的纯文本才发往 QQ 渠道
            if (reply.group !== "agent") return;
            if (!parseSuccess) return;

            await msgCenter.localMsgSendToQqLocalGroups(null, null, content, replyExt);
            await msgCenter.localMsgSendToQqGroups(null, null, content, replyExt);
            await msgCenter.localMsgSendToQqChannelGroups(null, null, content, replyExt);
          }
        }
      }));
    } catch (err) { console.error("[qqBot] AI 响应失败:", err); }
    finally {
      // [解除思维锁]
      groupState.isThinking = false;
    }
  }
};

export default {
  cmd: "*",
  run: async function (sendParams) {
    const { fromId, userId, userNickname, isAtMe, groupState } = Executor.resolveContext(sendParams);
    if (!fromId) return;

    // [开关前置校验] 只有开启了开关的群组才允许充能和响应
    const groupConfig = Executor.getGroupConfig(sendParams.source, fromId);
    if (!groupConfig?.switch) return;

    Guard.updateAttention(sendParams.msg, isAtMe, groupState, userId, fromId, userNickname);

    const ok = await Guard.shouldRespond(isAtMe, userId, groupState, sendParams.msgCenter, sendParams.ext?.listId, sendParams.meta);
    if (!ok) return;

    Guard.debounceExecute(fromId, async () => {
      await Executor.executeThinking(sendParams);
    });
  }
};
