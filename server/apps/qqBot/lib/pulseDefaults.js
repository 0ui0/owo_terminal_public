/* pulseDefaults.js - 社交脉冲参数的默认值、元数据与读取逻辑 */

import backend from "../backend.js";

/* 参数元数据：cn 中文名 / en 英文名 / value 默认值 */
export const pulseMeta = {
  dailyGroupLimit: { cn: "群组每日消息上限", en: "Daily Group Limit", value: 160 },
  dailyUserLimit: { cn: "个人每日消息上限", en: "Daily User Limit", value: 20 },
  cooldownMs: { cn: "回复冷却时间(毫秒)", en: "Reply Cooldown (ms)", value: 20000 },
  energyCost: { cn: "回复消耗能量", en: "Reply Energy Cost", value: 10 },
  energyThreshold: { cn: "回复能量门槛", en: "Energy Threshold", value: 10 },
  maxEnergy: { cn: "能量槽上限", en: "Max Energy", value: 100 },
  energyRegenPerHour: { cn: "每小时自然恢复能量", en: "Energy Regen / Hour", value: 20 },
  activeWindowMs: { cn: "活跃窗口时长(毫秒)", en: "Active Window (ms)", value: 300000 },
  excitementAdd: { cn: "每条消息增加兴奋度", en: "Excitement Per Message", value: 0.05 },
  passiveProbMax: { cn: "最大插嘴概率", en: "Max Interject Probability", value: 0.05 },
  chargePerMsg: { cn: "单条消息充能", en: "Charge Per Message", value: 0.5 },
  chargeUserDailyMax: { cn: "单人每日充能上限", en: "User Daily Charge Max", value: 5 },
  chargeGroupDailyMax: { cn: "全群每日充能总上限", en: "Group Daily Charge Max", value: 50 }
};

/* UI 分组顺序 */
export const pulseGroups = [
  {
    key: "limit",
    cn: "限流",
    en: "Rate Limit",
    items: ["dailyGroupLimit", "dailyUserLimit", "cooldownMs"]
  },
  {
    key: "energy",
    cn: "能量",
    en: "Energy",
    items: ["energyCost", "energyThreshold", "maxEnergy", "energyRegenPerHour"]
  },
  {
    key: "attention",
    cn: "注意力",
    en: "Attention",
    items: ["activeWindowMs", "excitementAdd", "passiveProbMax"]
  },
  {
    key: "charge",
    cn: "充能",
    en: "Charge",
    items: ["chargePerMsg", "chargeUserDailyMax", "chargeGroupDailyMax"]
  }
];

/* 读取合并后的参数（存档值优先，缺失回落默认） */
export function getPulseConfig() {
  const saved = backend.app?.data?.config?.pulseConfig || {};
  const merged = {};
  for (const key in pulseMeta) {
    const raw = saved[key];
    const num = Number(raw);
    merged[key] = (raw === undefined || raw === null || raw === "" || !Number.isFinite(num))
      ? pulseMeta[key].value
      : num;
  }
  return merged;
}

export default {
  pulseMeta,
  pulseGroups,
  getPulseConfig
};
