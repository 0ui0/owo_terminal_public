// 全系统统一短 ID 生成器
// 采用 "3位随机前缀 + 业务前缀 + 自增计数" 方案
// 优点：省 Token，且能通过 ID 前缀识别业务来源（c=chat, a=agent, t=terminal, s=system）

const sessionPrefix = Math.random().toString(36).slice(2, 5);
let idCount = 0;

export default {
  get(type = "") {
    idCount++;
    // e.g. "k8ac1", "k8at2"
    return `${type}_${sessionPrefix}${idCount}`
  }
};
