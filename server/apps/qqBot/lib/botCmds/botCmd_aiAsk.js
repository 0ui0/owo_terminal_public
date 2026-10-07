/* botCmd_aiAsk.js - owo_terminal 适配版 (基于 message 数组的精准识别) */
import backend from "../../backend.js";
import options from "../../../../config/options.js";
import getMsgProtocalConfig from "../../../../ioServer/ioApis/chat/getMsgProtocalConfig.js";
import { qlog } from "../logger.js";
import { getPulseConfig } from "../pulseDefaults.js";

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
    const pulse = getPulseConfig();

    if (!_localStore.groups[fromId]) {
      _localStore.groups[fromId] = {
        excitement: 0, energy: pulse.maxEnergy, windowEndTime: 0,
        lastReplyTime: 0, lastUserMsgTime: 0, lastEnergyRegenTime: now,
        dailyUsage: 0, dailyExtraEnergy: 0, lastResetDate: nowDay,
        debounceTimer: null,
        isThinking: false // [思维锁] 初始状态：空闲
      };
    }
    const groupState = _localStore.groups[fromId];

    // 每日重置检查 (单群)
    if (groupState.lastResetDate !== nowDay) {
      qlog(`[qqBot][${fromId}] 跨日重置: ${groupState.lastResetDate} -> ${nowDay}`, "info");
      groupState.dailyUsage = 0;
      groupState.dailyExtraEnergy = 0;
      groupState.lastResetDate = nowDay;
    }

    // 全局用户重置检查
    if (_localStore.lastGlobalResetDate !== nowDay) {
      qlog(`[qqBot] 触发全局跨日重置: ${_localStore.lastGlobalResetDate} -> ${nowDay}`, "info");
      _localStore.lastGlobalResetDate = nowDay;
      for (const uid in _localStore.users) {
        _localStore.users[uid].usage = 0;
        _localStore.users[uid].providedEnergy = 0;
      }
    }

    // 社交能量自然恢复
    const elapsedHours = (Date.now() - groupState.lastEnergyRegenTime) / (1000 * 60 * 60);
    const regenAmount = isNaN(elapsedHours) ? 0 : elapsedHours * pulse.energyRegenPerHour;
    groupState.energy = Math.min(pulse.maxEnergy, groupState.energy + regenAmount);
    groupState.lastEnergyRegenTime = Date.now();
    return groupState;
  },

  // 2. 注意力更新
  updateAttention: (msg, isAtMe, groupState, userId, fromId, userNickname) => {
    const now = Date.now();
    const pulse = getPulseConfig();
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

      if ((groupState.dailyExtraEnergy || 0) < pulse.chargeGroupDailyMax &&
        (userState.providedEnergy || 0) < pulse.chargeUserDailyMax) {

        const charge = pulse.chargePerMsg;
        groupState.energy = Math.min(pulse.maxEnergy, groupState.energy + charge);
        groupState.dailyExtraEnergy = (groupState.dailyExtraEnergy || 0) + charge;
        userState.providedEnergy = (userState.providedEnergy || 0) + charge;
        qlog(`[qqBot][充能] 群:${fromId} | 人:${userNickname}(${userId}) 贡献 ${charge} 点 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`, "energy");
      }
    }

    const hasKeyword = /米卡卡|宅喵|机器人/.test(msg);

    if (isAtMe || hasKeyword) {
      groupState.excitement = 1.0;
      if (now > groupState.windowEndTime) {
        groupState.windowEndTime = now + pulse.activeWindowMs;
      }
    } else {
      // [被动累积]
      groupState.excitement = Math.min(1.0, groupState.excitement + pulse.excitementAdd);
    }
  },

  // 3. 拦截判定
  shouldRespond: async (isAtMe, userId, groupState, msgCenter, listId, meta) => {
    const now = Date.now();
    const pulse = getPulseConfig();

    // [思维锁拦截]
    if (groupState.isThinking) return false;

    // [每日熔断] 单群限额
    if (groupState.dailyUsage >= pulse.dailyGroupLimit) {
      qlog(`[qqBot][拦截] 达到群组日限额 (${groupState.dailyUsage}) (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`, "block");
      return false;
    }

    // [用户级限流] 单人限额
    if (!_localStore.users[userId]) _localStore.users[userId] = { usage: 0, providedEnergy: 0 };
    if (_localStore.users[userId].usage >= pulse.dailyUserLimit) {
      if (isAtMe) {
        qlog(`[qqBot][拦截] 用户 ${userId} 达到个人日限额 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`, "block");
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
    if (now - groupState.lastReplyTime < pulse.cooldownMs) return false;

    // [能量判定]
    if (groupState.energy < pulse.energyThreshold) {
      qlog(`[qqBot][拦截] 能量不足门槛 (${groupState.energy.toFixed(1)}) (🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`, "block");
      return false;
    }

    // [核心判定逻辑]
    if (isAtMe) {
      qlog(`[qqBot][触发] 艾特响应 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`, "trigger");
      return true;
    }

    if (now < groupState.windowEndTime) {
      qlog(`[qqBot][触发] 活跃窗口响应 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`, "trigger");
      return true;
    } else {
      const passiveProb = groupState.excitement * pulse.passiveProbMax;
      const dice = Math.random();
      const isPassive = dice < passiveProb;
      if (isPassive) {
        qlog(`[qqBot][触发] 被动脉冲插嘴 (概率: ${(passiveProb * 100).toFixed(1)}%) (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`, "trigger");
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
    const pulse = getPulseConfig();

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

      const targetModelId = agent.aiConfig?.derivedFromModelId;
      if (!targetModelId) return;

      groupState.lastReplyTime = Date.now();
      groupState.dailyUsage += 1;
      _localStore.users[userId].usage += 1;
      groupState.energy -= pulse.energyCost;
      qlog(`[qqBot][耗能] 回复完成。剩余能量: ${groupState.energy.toFixed(1)} (📊${groupState.dailyUsage}/${pulse.dailyGroupLimit})`, "energy");

      const aiList = await options.get("ai_aiList");
      const currentTokenConfig = aiList.find(m => m.id === targetModelId);

      const currentToolsMode = 5;

      // 启动开关：重置中断控制器并把 agent.replying 置真（与 ioApi_chat 的标准流程一致）
      // 作用①：beforeRun 会把 list.replying 同步给会话 ⇒ 前端才会出现「暂停」按钮，能看出它正在回复
      // 作用②：重置 abortController，避免上一次被中断后 signal 永久为 aborted，导致之后再也无法回复
      agent.noStopRun();

      // 与主系统一致：由 getMsgProtocalConfig 统一从当前会话 defaultTools 装配工具，不再自行过滤并覆盖 tools
      await agent.sendAskByMsgProtocol(getMsgProtocalConfig({
        targetModel: agent, listId, currentTokenConfig,
        extraConfig: {
          // 【核心修复】强制覆盖全局钩子，消除 preToken 读取错误
          onSendAskBefore: async () => {
            const innerAiList = await options.get("ai_aiList");
            const mIdx = innerAiList.findIndex(m => m.id === targetModelId);
            if (mIdx === -1 || innerAiList[mIdx].preTokens <= 0) {
              throw new Error(`[余额预警] ${targetModelId} 配置无效或额度不足`);
            }
          },
          onTokenChange: async (inst, usage) => {
            const innerAiList = await options.get("ai_aiList");
            const mIdx = innerAiList.findIndex(m => m.id === targetModelId);
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
              parseSuccess = true
            } catch (e) {
              if (currentToolsMode === 5) {
                // 解析失败，走模式 5 的 Markdown + extJsonConfig 格式兼容
                let extConfig = {};
                const match = content.match(/<extJsonConfig>([\s\S]+?)<\/extJsonConfig>/);
                if (match && match[1]) {
                  try {
                    extConfig = JSON.parse(match[1].trim());
                  } catch (err) {
                    parseSuccess = false;
                    qlog(`[qqBot] 模式 5 extJsonConfig 解析失败: ${err.message}`, "error");
                  }
                }
                content = content.replace(/<extJsonConfig>[\s\S]*?<\/extJsonConfig>/, "").trim();
                // 只要剥离完标签后的 Markdown 正文非空，且没有发生语法解析错误，即可视作解析成功
                parseSuccess = true

              } else {
                parseSuccess = false;
              }
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
    } catch (err) { qlog(`[qqBot] AI 响应失败: ${err.message}`, "error"); }
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
