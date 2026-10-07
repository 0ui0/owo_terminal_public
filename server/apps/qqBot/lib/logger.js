/* logger.js - qqBot 统一日志中心：控制台输出 + 前端控制台面板双向同步 */

import backend from "../backend.js";

const MAX_LOGS = 500;

let _seq = 0;

/**
 * 写入一条日志（存入当前 App 实例的 app.data.logs 中，随实例共存亡）
 * @param {string} text  日志正文
 * @param {string} level 级别：info | trigger | block | energy | conn | error
 */
export function qlog(text, level = "info") {
  const item = {
    id: ++_seq,
    time: Date.now(),
    level,
    text: String(text)
  };

  const logs = backend.app?.data?.logs;
  if (logs) {
    logs.push(item);
    if (logs.length > MAX_LOGS) {
      logs.splice(0, logs.length - MAX_LOGS);
    }
  }

  try {
    if (level === "error") {
      console.error(item.text);
    } else {
      console.log(item.text);
    }
  } catch (err) {
    console.error("[qqBot/logger] 控制台输出失败:", err);
  }

  try {
    const io = backend.appManager?.io;
    const appId = backend.app?.id;
    if (io && appId) {
      io.emit("app:dispatch", {
        appId,
        action: "log",
        args: item
      });
    }
  } catch (err) {
    console.error("[qqBot/logger] 推送日志到前端失败:", err);
  }

  return item;
}

/* 按 id 增量获取日志（从当前实例的 app.data.logs 读取） */
export function getLogs(sinceId) {
  const from = Number(sinceId) || 0;
  const logs = backend.app?.data?.logs || [];
  return logs.filter(item => item.id > from);
}

export function clearLogs() {
  if (backend.app?.data?.logs) {
    backend.app.data.logs.length = 0;
  }
  return { ok: true, msg: "日志已清空" };
}

export default {
  qlog,
  getLogs,
  clearLogs
};
