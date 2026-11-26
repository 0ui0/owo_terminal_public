/* botCmd_aiAsk.js - owo_terminal 适配版 (基于 message 数组的精准识别) */
import options from "../../../../config/options.js";
import getMsgProtocalConfig from "../../../../ioServer/ioApis/chat/getMsgProtocalConfig.js";

// ==========================================
// 🧠 本地状态存储 (持久化于模块内存)
// ==========================================
export const _localStore = {
  groups: {},
  users: {},
  lastGlobalResetDate: new Date().toLocaleDateString()
};

// ==========================================
// ⚙️ 社交脉冲默认运行参数 (纯数字底层默认值)
// ==========================================
const DEFAULT_PULSE = {
  dailyGroupLimit: 160,
  dailyUserLimit: 20,
  cooldownMs: 20000,
  energyCost: 10,
  energyThreshold: 10,
  maxEnergy: 100,
  energyRegenPerHour: 20,
  activeWindowMs: 300000,
  excitementAdd: 0.05,
  passiveProbMax: 0.05,
  chargePerMsg: 0.5,
  chargeUserDailyMax: 5,
  chargeGroupDailyMax: 50
};

export default {
  cmd: "*",
  run: async function (sendParams) {
    const { source, user, msg, ext, meta, msgCenter } = sendParams;
    const { app, appManager } = msgCenter;
    const config = app.data.config;
    const pulse = { ...DEFAULT_PULSE, ...(config.pulseConfig || {}) };

    // [目标群ID解析]
    const fromId = (source === "qqLocal/group") ? meta?.group_id
      : (source === "qqOnline/group") ? meta?.d?.group_openid
      : (source === "qqOnline/channel") ? meta?.d?.channel_id
      : null;

    if (!fromId) return;

    // [开关前置校验] 只有开启了开关的群组才允许充能和响应
    const search = (source === "qqLocal/group") ? (config["3rd_qqRobotLocal_groups"] || [])
      : (source === "qqOnline/group") ? (config["3rd_qqRobot_groups"] || [])
      : (source === "qqOnline/channel") ? (config["3rd_qqRobot_channels"] || [])
      : [];

    const groupConfig = search.find(g => String(g.groupid || g.channelid) === String(fromId));
    if (!groupConfig?.switch) return;

    // [官方与本地统一艾特判定]
    // 1. 官方机器人权威判定：事件名为 GROUP_AT 或 腾讯云端标记 mentions[].is_you
    // 2. 本地 OneBot 判定：通过 self_id 匹配消息 CQ 码中的 at
    const isOfficialAt = meta?.t === "GROUP_AT_MESSAGE_CREATE" || Boolean(meta?.d?.mentions?.some(m => m?.is_you));
    const isLocalAt = Boolean(meta?.self_id && Array.isArray(meta?.message) && meta.message.some(m => m.type === "at" && String(m.data?.qq) === String(meta.self_id)));
    const isAtMe = isOfficialAt || isLocalAt;

    // 唯一标识提取优先级：本地QQ号 > 官方OpenID > 官方频道作者ID > 系统用户名
    const userId = meta?.user_id || meta?.d?.author?.union_openid || meta?.d?.author?.id || meta?.author?.id || user || "unknown";

    // 每日重置检查 (单群)
    const now = Date.now();
    const nowDay = new Date().toLocaleDateString();

    if (!_localStore.groups[fromId]) {
      _localStore.groups[fromId] = {
        excitement: 0,
        energy: pulse.maxEnergy,
        windowEndTime: 0,
        lastReplyTime: 0,
        lastUserMsgTime: 0,
        lastEnergyRegenTime: now,
        dailyUsage: 0,
        dailyExtraEnergy: 0,
        lastResetDate: nowDay,
        debounceTimer: null,
        isThinking: false // [思维锁] 初始状态：空闲
      };
    }
    const groupState = _localStore.groups[fromId];

    // 每日重置检查 (单群)
    if (groupState.lastResetDate !== nowDay) {
      appManager.dispatch(app.id, "log", {
        text: `[qqBot][${fromId}] 跨日重置: ${groupState.lastResetDate} -> ${nowDay}`,
        level: "info"
      });
      groupState.dailyUsage = 0;
      groupState.dailyExtraEnergy = 0;
      groupState.lastResetDate = nowDay;
    }

    // 全局用户重置检查
    if (_localStore.lastGlobalResetDate !== nowDay) {
      appManager.dispatch(app.id, "log", {
        text: `[qqBot] 触发全局跨日重置: ${_localStore.lastGlobalResetDate} -> ${nowDay}`,
        level: "info"
      });
      _localStore.lastGlobalResetDate = nowDay;
      for (const uid in _localStore.users) {
        _localStore.users[uid].usage = 0;
        _localStore.users[uid].providedEnergy = 0;
      }
    }

    // 社交能量自然恢复
    const elapsedHours = (now - groupState.lastEnergyRegenTime) / (1000 * 60 * 60);
    const regenAmount = isNaN(elapsedHours) ? 0 : elapsedHours * pulse.energyRegenPerHour;
    groupState.energy = Math.min(pulse.maxEnergy, groupState.energy + regenAmount);
    groupState.lastEnergyRegenTime = now;

    // 指数衰减兴奋度
    if (groupState.lastUserMsgTime > 0) {
      const elapsedSec = (now - groupState.lastUserMsgTime) / 1000;
      groupState.excitement *= Math.pow(0.7, elapsedSec / 30);
    }
    groupState.lastUserMsgTime = now;

    // [社交充能]：每条消息都会为机器人提供微量能量，即便它打算回话
    if (userId !== "unknown") {
      if (!_localStore.users[userId]) {
        _localStore.users[userId] = { usage: 0, providedEnergy: 0 };
      }
      const userState = _localStore.users[userId];
      if (groupState.dailyExtraEnergy < pulse.chargeGroupDailyMax && userState.providedEnergy < pulse.chargeUserDailyMax) {
        groupState.energy = Math.min(pulse.maxEnergy, groupState.energy + pulse.chargePerMsg);
        groupState.dailyExtraEnergy += pulse.chargePerMsg;
        userState.providedEnergy += pulse.chargePerMsg;
        appManager.dispatch(app.id, "log", {
          text: `[qqBot][充能] 群:${fromId} | 人:${user}(${userId}) 贡献 ${pulse.chargePerMsg} 点 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`,
          level: "energy"
        });
      }
    }

    // 注意力更新
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

    // [思维锁拦截]
    if (groupState.isThinking) return;

    // [每日熔断] 单群限额
    if (groupState.dailyUsage >= pulse.dailyGroupLimit) {
      appManager.dispatch(app.id, "log", {
        text: `[qqBot][拦截] 达到群组日限额 (${groupState.dailyUsage}) (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`,
        level: "block"
      });
      return;
    }

    // [用户级限流] 单人限额
    const userUsage = _localStore.users[userId]?.usage || 0;
    if (userUsage >= pulse.dailyUserLimit) {
      if (isAtMe) {
        appManager.dispatch(app.id, "log", {
          text: `[qqBot][拦截] 用户 ${userId} 达到个人日限额 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`,
          level: "block"
        });
        const tips = ["米卡卡累了喵~", "别吵，明天再来！", "额度不足喵~"];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        const replyExt = { listId: groupConfig.listId, meta };
        await msgCenter.localMsgSendToQqLocalGroups("系统", "系统", tip, replyExt);
        await msgCenter.localMsgSendToQqGroups("系统", "系统", tip, replyExt);
        await msgCenter.localMsgSendToQqChannelGroups("系统", "系统", tip, replyExt);
      }
      return;
    }

    // [冷静期]
    if (now - groupState.lastReplyTime < pulse.cooldownMs) return;

    // [能量判定]
    if (groupState.energy < pulse.energyThreshold) {
      appManager.dispatch(app.id, "log", {
        text: `[qqBot][拦截] 能量不足门槛 (${groupState.energy.toFixed(1)}) (🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`,
        level: "block"
      });
      return;
    }

    // [核心判定逻辑]
    let willReply = false;
    if (isAtMe) {
      appManager.dispatch(app.id, "log", {
        text: `[qqBot][触发] 艾特响应 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`,
        level: "trigger"
      });
      willReply = true;
    } else if (now < groupState.windowEndTime) {
      appManager.dispatch(app.id, "log", {
        text: `[qqBot][触发] 活跃窗口响应 (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)} 📊${groupState.dailyUsage})`,
        level: "trigger"
      });
      willReply = true;
    } else {
      const passiveProb = groupState.excitement * pulse.passiveProbMax;
      if (Math.random() < passiveProb) {
        appManager.dispatch(app.id, "log", {
          text: `[qqBot][触发] 被动脉冲插嘴 (概率: ${(passiveProb * 100).toFixed(1)}%) (⚡${groupState.energy.toFixed(1)} 🔥${groupState.excitement.toFixed(2)})`,
          level: "trigger"
        });
        willReply = true;
      }
    }

    if (!willReply) return;

    // 4. 防抖延时触发
    if (groupState.debounceTimer) clearTimeout(groupState.debounceTimer);
    groupState.debounceTimer = setTimeout(async () => {
      groupState.debounceTimer = null;
      // [开启思维锁]
      groupState.isThinking = true;

      try {
        let listId = ext?.listId || 0;
        if (!listId) {
          if (groupConfig?.switch) listId = groupConfig.listId;
        }
        if (!listId) return;

        const { default: subAgents } = await import("../../../../tools/aiAsk/subAgents.js");
        const agent = subAgents.get(listId);
        if (!agent) return;

        // 【重要架构说明】：必须读取模型实例自带的标准出厂属性 modelId。
        // 原因：derivedFromModelId 仅是创建智能体时用于显式覆盖特定底座的临时入参。当用户选择“系统默认”时，该字段按设计保持为空(undefined)，智能体会直接继承主控 AI (0号) 的模型并写入 modelId。
        // 若在此处读取 derivedFromModelId，会导致系统默认模式下无法获取模型 ID 而触发下方静默拦截，导致机器人不回复！因此此处统一读取真实出厂的 modelId。
        const targetModelId = agent.aiConfig.modelId;
        if (!targetModelId) return;

        groupState.lastReplyTime = Date.now();
        groupState.dailyUsage += 1;
        if (_localStore.users[userId]) {
          _localStore.users[userId].usage += 1;
        }
        groupState.energy -= pulse.energyCost;

        appManager.dispatch(app.id, "log", {
          text: `[qqBot][耗能] 回复完成。剩余能量: ${groupState.energy.toFixed(1)} (📊${groupState.dailyUsage}/${pulse.dailyGroupLimit})`,
          level: "energy"
        });

        const aiList = await options.get("ai_aiList");
        const currentTokenConfig = aiList.find(m => m.id === targetModelId);
        const currentToolsMode = 5;

        // 启动开关：重置中断控制器并把 agent.replying 置真（与 ioApi_chat 的标准流程一致）
        // 作用①：beforeRun 会把 list.replying 同步给会话 ⇒ 前端才会出现「暂停」按钮，能看出它正在回复
        // 作用②：重置 abortController，避免上一次被中断后 signal 永久为 aborted，导致之后再也无法回复
        agent.noStopRun();

        // 与主系统一致：由 getMsgProtocalConfig 统一从当前会话 defaultTools 装配工具，不再自行过滤并覆盖 tools
        await agent.sendAskByMsgProtocol(getMsgProtocalConfig({
          targetModel: agent,
          listId,
          currentTokenConfig,
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
                parseSuccess = true;
              } catch (e) {
                if (currentToolsMode === 5) {
                  // 解析失败，走模式 5 的 Markdown + extJsonConfig 格式兼容
                  const match = content.match(/<extJsonConfig>([\s\S]+?)<\/extJsonConfig>/);
                  if (match && match[1]) {
                    try {
                      JSON.parse(match[1].trim());
                    } catch (err) {
                      console.error(`[qqBot] 模式 5 extJsonConfig 解析失败: ${err.message}`);
                      appManager.dispatch(app.id, "log", {
                        text: `[qqBot] 模式 5 extJsonConfig 解析失败: ${err.message}`,
                        level: "error"
                      });
                    }
                  }
                  content = content.replace(/<extJsonConfig>[\s\S]*?<\/extJsonConfig>/, "").trim();
                  // 只要剥离完标签后的 Markdown 正文非空，且没有发生语法解析错误，即可视作解析成功
                  parseSuccess = true;
                } else {
                  parseSuccess = false;
                }
              }

              const replyExt = { listId, meta, group: reply.group, ask: reply };

              // [全量记录] 本地 UI 放行。如果解析成功则发纯文本，失败则发原始 JSON/报错
              await msgCenter.localSend(null, "宅喵", content, replyExt);

              // [精准过滤] 只有正常的智能体回复且解析成功的纯文本才发往 QQ 渠道
              if (reply.group !== "agent" || !parseSuccess) return;

              await msgCenter.localMsgSendToQqLocalGroups(null, null, content, replyExt);
              await msgCenter.localMsgSendToQqGroups(null, null, content, replyExt);
              await msgCenter.localMsgSendToQqChannelGroups(null, null, content, replyExt);
            }
          }
        }));
      } catch (err) {
        console.error(`[qqBot] AI 响应失败: ${err.message}`);
        appManager.dispatch(app.id, "log", {
          text: `[qqBot] AI 响应失败: ${err.message}`,
          level: "error"
        });
      } finally {
        // [解除思维锁]
        groupState.isThinking = false;
      }
    }, 5000);
  }
};
