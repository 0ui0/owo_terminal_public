/* qqBotOnline.js - QQ 官方机器人 API 封装（纯 HTTP 调用保留 + 官方 WebSocket 长连增强版） */

import { QQBot, errorHandler, messageFilter, mentionGate, contentSanitizer, quoteRef } from "@tencent-connect/qqbot-nodejs";
import msgCenter from "./botMsgCenter.js";

export default {
  secret: null,
  clientSecret: "",
  appId: "",
  botToken: "",
  accessToken: {
    value: null,
    timestamp: null,
    expiresIn: 0
  },
  apiUrl: "https://api.sgroup.qq.com",
  apiVersion: "v2",
  wsBot: null,
  wsAppId: "",
  wsSecret: "",
  app: null,
  appManager: null,

  init: function(appId, clientSecret, botToken) {
    if (global.checkType) {
      global.checkType(arguments, ["string", "string"], "QQBotOnline.init(appid,clientSecret)");
    }
    this.clientSecret = clientSecret;
    this.appId = appId;
    this.botToken = botToken;
  },

  pullAccessToken: async function() {
    try {
      if (!this.accessToken.timestamp || (Date.now() - this.accessToken.timestamp >= this.accessToken.expiresIn)) {
        const res0 = await fetch("https://bots.qq.com/app/getAppAccessToken", {
          method: "post",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId: this.appId,
            clientSecret: this.clientSecret
          })
        });
        const res = await res0.json();
        if (!res.access_token) {
          throw new Error("获取QQ机器人通信令牌失败");
        }
        this.accessToken.value = res.access_token;
        this.accessToken.expiresIn = res.expires_in * 1000;
        this.accessToken.timestamp = Date.now();
      }
      return this.accessToken.value;
    } catch (err) {
      throw err;
    }
  },

  getAuthorization: function() {
    return `QQBot ${this.accessToken.value}`;
  },

  msgUser: async function(uid, type, content, ext) {
    try {
      if (global.checkType) {
        global.checkType(arguments, ["string", "number", "string", "object?"], "QQBotOnline.msgUser(uid,type,content,ext)");
      }
      await this.pullAccessToken();
      const res0 = await fetch(`${this.apiUrl}/${this.apiVersion}/users/${uid}/messages`, {
        method: "post",
        headers: {
          Authorization: this.getAuthorization(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          msg_type: type ?? ext?.msg_type ?? 0,
          content: (type === 7 || ext?.msg_type === 7) ? " " : content,
          markdown: ext?.markdown,
          keyboard: ext?.keyboard,
          ark: ext?.ark,
          media: ext?.media,
          message_reference: {},
          event_id: ext?.event_id || "",
          msg_id: ext?.msg_id || "",
          msg_seq: ext?.msg_seq || 1
        })
      });
      const req = await res0.json();
      if (req.err_code) {
        console.error(`[QQBot/用户消息] 发送失败: ${JSON.stringify(req)}`);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[QQBot/用户消息] 发送失败: ${JSON.stringify(req)}`, level: "error" });
        }
      }
      return req;
    } catch (err) {
      throw err;
    }
  },

  msgGroup: async function(gid, type, content, ext) {
    try {
      if (global.checkType) {
        global.checkType(arguments, ["string", "number", "string", "object?"], "QQBotOnline.msgGroup(gid,type,content,ext)");
      }
      await this.pullAccessToken();
      const res0 = await fetch(`${this.apiUrl}/${this.apiVersion}/groups/${gid}/messages`, {
        method: "post",
        headers: {
          Authorization: this.getAuthorization(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          msg_type: type ?? ext?.msg_type ?? 0,
          content: (type === 7 || ext?.msg_type === 7) ? " " : content,
          markdown: ext?.markdown,
          keyboard: ext?.keyboard,
          ark: ext?.ark,
          media: ext?.media,
          message_reference: null,
          event_id: ext?.event_id,
          msg_id: ext?.msg_id,
          msg_seq: ext?.msg_seq || Math.floor(Math.random() * 10)
        })
      });
      const req = await res0.json();
      if (req.err_code) {
        console.error(`[QQBot/群消息] 发送失败: ${JSON.stringify(req)}`);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[QQBot/群消息] 发送失败: ${JSON.stringify(req)}`, level: "error" });
        }
      }
      return req;
    } catch (err) {
      throw err;
    }
  },

  msgChannel: async function(cid, type, content, ext) {
    try {
      if (global.checkType) {
        global.checkType(arguments, ["string", "number", "string", "object?"], "QQBotOnline.msgChannel(cid,type,content,ext)");
      }
      await this.pullAccessToken();
      const res0 = await fetch(`${this.apiUrl}/channels/${cid}/messages`, {
        method: "post",
        headers: {
          Authorization: this.getAuthorization(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          msg_type: type ?? ext?.msg_type ?? 0,
          content: (type === 7 || ext?.msg_type === 7) ? " " : content,
          markdown: ext?.markdown,
          ark: ext?.ark,
          embed: ext?.embed,
          image: ext?.image,
          message_reference: ext?.message_reference,
          event_id: ext?.event_id,
          msg_id: ext?.msg_id
        })
      });
      const req = await res0.json();
      if (req.err_code && String(req.code) !== "304023") {
        console.error(`[QQBot/频道消息] 发送失败: ${JSON.stringify(req)}`);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[QQBot/频道消息] 发送失败: ${JSON.stringify(req)}`, level: "error" });
        }
      }
      return req;
    } catch (err) {
      throw err;
    }
  },

  msgChannelUser: async function(guildid, type, content, ext) {
    try {
      if (global.checkType) {
        global.checkType(arguments, ["string", "number", "string", "object?"], "QQBotOnline.msgChannelUser(guildid,type,content,ext)");
      }
      await this.pullAccessToken();
      const res0 = await fetch(`${this.apiUrl}/dms/${guildid}/messages`, {
        method: "post",
        headers: {
          Authorization: this.getAuthorization(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: (type === 7 || ext?.msg_type === 7) ? " " : content,
          markdown: ext?.markdown,
          ark: ext?.ark,
          embed: ext?.embed,
          image: ext?.image,
          message_reference: ext?.message_reference,
          event_id: ext?.event_id,
          msg_id: ext?.msg_id
        })
      });
      const req = await res0.json();
      if (req.err_code) {
        console.error(`[QQBot/频道私信消息] 发送失败: ${JSON.stringify(req)}`);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[QQBot/频道私信消息] 发送失败: ${JSON.stringify(req)}`, level: "error" });
        }
      }
      return req;
    } catch (err) {
      throw err;
    }
  },








  /**
   * 启动官方 WebSocket 长连接（全局唯一实例）
   * @param {string} appId - 机器人 AppID
   * @param {string} appSecret - 机器人 AppSecret
   * @param {object} app - 当前 App 实例
   * @param {object} appManager - 系统 App 管理器
   */
  wsStart: async function (appId, appSecret, app, appManager) {
    this.app = app;
    this.appManager = appManager;

    if (!appId || !appSecret) {
      console.error("[qqBot/官方WS] 启动失败: 缺少 appId 或 appSecret");
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: "[qqBot/官方WS] 启动失败: 缺少 appId 或 appSecret", level: "error" });
      }
      return false;
    }

    const cleanAppId = String(appId).trim();
    const cleanSecret = String(appSecret).trim();

    // 幂等复用保护：若长连接已就绪且凭据一致，直接保持复用，绝不频繁掐线重连
    if (this.wsBot && this.wsAppId === cleanAppId && this.wsSecret === cleanSecret) {
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 官方长连接已就绪 (AppID: ${cleanAppId})，保持连接复用`, level: "conn" });
      }
      return true;
    }

    if (this.wsBot) {
      await this.wsStop();
    }

    if (this.app && this.appManager) {
      this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 正在连接腾讯官方网关... AppID: ${cleanAppId}`, level: "conn" });
    }

    try {
      const bot = new QQBot({
        appId: cleanAppId,
        appSecret: cleanSecret,
        transport: "websocket",
        baseUrl: "https://api.bot.qq.com",
        logger: {
          info: (t) => {
            if (this.app && this.appManager) {
              this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方SDK] ${t}`, level: "info" });
            }
          },
          warn: (t) => {
            if (this.app && this.appManager) {
              this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方SDK] ${t}`, level: "info" });
            }
          },
          error: (t) => {
            console.error(`[qqBot/官方SDK] ${t}`);
            if (this.app && this.appManager) {
              this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方SDK] ${t}`, level: "error" });
            }
          },
          debug: () => {}
        }
      });

      // 挂载官方洋葱模型中间件链（passthrough: true 确保全量消息透传，不误杀任何群聊消息）
      bot.use(errorHandler());
      bot.use(messageFilter({ skipSelfEcho: true }));
      bot.use(mentionGate({ passthrough: true }));
      bot.use(contentSanitizer({ parseFaceTags: true }));
      bot.use(quoteRef({ maxSize: 500, preferMsgElements: true }));

      // 注册事件监听
      bot.on("ready", () => {
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 官方机器人长连就绪，认证成功！(AppID: ${appId})`, level: "conn" });
        }
      });

      bot.on("disconnected", (event) => {
        const willReconnect = event?.willReconnect;
        const disText = `[qqBot/官方WS] 连接断开 (code: ${event?.code || "未知"})，重连状态: ${willReconnect ? "正在重连..." : "已停止"}`;
        if (!willReconnect) {
          console.error(disText);
        }
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: disText, level: willReconnect ? "conn" : "error" });
        }
      });

      bot.on("error", (err) => {
        const errText = `[qqBot/官方WS] 运行异常: ${err?.message || err}`;
        console.error(errText);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: errText, level: "error" });
        }
      });

      // 入站消息路由
      bot.on("message", async (mCtx) => {
        try {

          const que = {
            meta: {
              t: mCtx.message.rawEventType,
              id: mCtx.message.messageId,
              d: mCtx.message.raw
            },
            replyTarget: mCtx.replyTarget
          };

          // 提取文本与多媒体附件 (图片 / 语音识别 / 文件)
          const parts = [];
          const text = (que.meta.d?.content || "").trim();
          if (text) {
            parts.push(text);
          }
          if (Array.isArray(que.meta.d?.attachments)) {
            for (const att of que.meta.d.attachments) {
              if (att.content_type?.startsWith("image/")) {
                parts.push(`![图片](${att.url})`);
              } else if (att.asr_refer_text) {
                parts.push(`[语音消息: "${att.asr_refer_text}"]`);
              } else if (att.filename) {
                parts.push(`[文件: ${att.filename}](${att.url})`);
              }
            }
          }
          const content = parts.join("\n");
          if (que.meta.d) {
            que.meta.d.content = content;
          }

          if (que.meta.t === "GROUP_AT_MESSAGE_CREATE" || que.meta.t === "GROUP_MESSAGE_CREATE") {
            if (this.app && this.appManager) {
              this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 收到群消息 [群: ${que.meta.d?.group_openid}] 来自: ${que.meta.d?.author?.username || "用户"} 内容: "${content.slice(0, 50)}"`, level: "trigger" });
              if (que.meta.d?.group_openid) {
                this.appManager.dispatch(this.app.id, "discoverGroup", {
                  groupOpenid: String(que.meta.d.group_openid),
                  sender: que.meta.d?.author?.username || "用户",
                  lastMsg: content.slice(0, 40),
                  timestamp: Date.now()
                });
              }
            }
            await msgCenter.send("qqOnline/group", que.meta.d?.author?.username, content, que);
          }
          if (que.meta.t === "MESSAGE_CREATE" || que.meta.t === "AT_MESSAGE_CREATE") {
            if (this.app && this.appManager) {
              this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 收到子频道消息 [子频道: ${que.meta.d?.channel_id}] 来自: ${que.meta.d?.author?.username || "用户"} 内容: "${content.slice(0, 50)}"`, level: "trigger" });
            }
            await msgCenter.send("qqOnline/channel", que.meta.d?.author?.username, content, que);
          }
          if (que.meta.t === "C2C_MESSAGE_CREATE") {
            if (this.app && this.appManager) {
              this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 收到私聊消息 来自: ${que.meta.d?.author?.username || "用户"} 内容: "${content.slice(0, 50)}"`, level: "trigger" });
            }
            await msgCenter.send("qqOnline/private", que.meta.d?.author?.username, content, que);
          }
          if (que.meta.t === "DIRECT_MESSAGE_CREATE") {
            if (this.app && this.appManager) {
              this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 收到频道私信 来自: ${que.meta.d?.author?.username || "用户"} 内容: "${content.slice(0, 50)}"`, level: "trigger" });
            }
            await msgCenter.send("qqOnline/channelPrivate", que.meta.d?.author?.username, content, que);
          }

        } catch (inErr) {
          console.error(`[qqBot/官方WS] 入站处理异常: ${inErr.message}`);
          if (this.app && this.appManager) {
            this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 入站处理异常: ${inErr.message}`, level: "error" });
          }
        }
      });

      this.wsBot = bot;
      this.wsAppId = cleanAppId;
      this.wsSecret = cleanSecret;

      // 非阻塞后台常驻启动，避免阻塞 RPC 回包导致前端假死
      bot.start().catch((err) => {
        console.error(`[qqBot/官方WS] 启动长连接失败: ${err.message}`);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 启动长连接失败: ${err.message}`, level: "error" });
        }
      });

      return true;
    } catch (err) {
      console.error(`[qqBot/官方WS] 启动长连接失败: ${err.message}`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 启动长连接失败: ${err.message}`, level: "error" });
      }
      this.wsBot = null;
      return false;
    }
  },

  /**
   * 停止官方 WebSocket 长连接
   */
  wsStop: async function () {
    if (this.wsBot) {
      try {
        await this.wsBot.stop();
      } catch (err) {
        console.error(`[qqBot/官方WS] 停止连接异常: ${err.message}`);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 停止连接异常: ${err.message}`, level: "error" });
        }
      }
      this.wsBot = null;
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: "[qqBot/官方WS] 官方长连接已安全断开", level: "conn" });
      }
    }
  },

  /**
   * 发送官方群消息（新版 wsMsgGroup 方法，参数与原版 msgGroup 100% 保持一致）
   */
  wsMsgGroup: async function (gid, type, content, ext) {
    if (!this.wsBot) {
      console.error(`[qqBot/官方WS] 发送失败: WebSocket 实例未就绪 (目标群: ${gid})`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 发送失败: WebSocket 实例未就绪 (目标群: ${gid})`, level: "error" });
      }
      return { ok: false, msg: "官方WS未就绪" };
    }

    try {
      if (ext?.replyTarget) {
        const res = await this.wsBot.sendMarkdown(ext.replyTarget, content);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 已被动回复群消息 [群: ${gid}]`, level: "info" });
        }
        return res;
      }

      // 无上下文时走官方主动推送（1000条/群/天）
      const target = {
        scope: "group",
        targetId: gid
      };
      const res = await this.wsBot.sendText(target, content);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 已主动推送群消息 [群: ${gid}]`, level: "info" });
      }
      return res;
    } catch (err) {
      console.error(`[qqBot/官方WS] 群消息发送异常: ${err.message}`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 群消息发送异常: ${err.message}`, level: "error" });
      }
      return { ok: false, msg: err.message };
    }
  },

  /**
   * 发送官方私聊消息（新版 wsMsgUser 方法）
   */
  wsMsgUser: async function (uid, type, content, ext) {
    if (!this.wsBot) {
      console.error(`[qqBot/官方WS] 私聊发送失败: WebSocket 实例未就绪 (用户: ${uid})`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 私聊发送失败: WebSocket 实例未就绪 (用户: ${uid})`, level: "error" });
      }
      return { ok: false, msg: "官方WS未就绪" };
    }

    try {
      if (ext?.replyTarget) {
        const res = await this.wsBot.sendMarkdown(ext.replyTarget, content);
        if (this.app && this.appManager) {
          this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 已回复用户私聊 [用户: ${uid}]`, level: "info" });
        }
        return res;
      }

      const target = {
        scope: "c2c",
        targetId: uid
      };
      const res = await this.wsBot.sendText(target, content);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 已主动发送用户私聊 [用户: ${uid}]`, level: "info" });
      }
      return res;
    } catch (err) {
      console.error(`[qqBot/官方WS] 私聊发送异常: ${err.message}`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 私聊发送异常: ${err.message}`, level: "error" });
      }
      return { ok: false, msg: err.message };
    }
  },

  /**
   * 发送官方子频道消息（纯走官方 SDK，绝不回退兜底，快速失败）
   */
  wsMsgChannel: async function (cid, type, content, ext) {
    if (!this.wsBot) {
      console.error(`[qqBot/官方WS] 子频道发送失败: WebSocket 实例未就绪 (频道: ${cid})`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 子频道发送失败: WebSocket 实例未就绪 (频道: ${cid})`, level: "error" });
      }
      return { ok: false, msg: "官方WS未就绪" };
    }

    try {
      const msgId = ext?.replyTarget?.msgId || ext?.meta?.d?.id;
      const res = await this.wsBot.sendChannelMessage(cid, content, msgId ? { msgId } : undefined);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 已发送子频道消息 [子频道: ${cid}]`, level: "info" });
      }
      return res;
    } catch (err) {
      console.error(`[qqBot/官方WS] 子频道发送异常: ${err.message}`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 子频道发送异常: ${err.message}`, level: "error" });
      }
      return { ok: false, msg: err.message };
    }
  },

  /**
   * 发送官方频道私信消息（纯走官方 SDK，绝不回退兜底，快速失败）
   */
  wsMsgChannelUser: async function (guildid, type, content, ext) {
    if (!this.wsBot) {
      console.error(`[qqBot/官方WS] 频道私聊发送失败: WebSocket 实例未就绪 (Guild: ${guildid})`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 频道私聊发送失败: WebSocket 实例未就绪 (Guild: ${guildid})`, level: "error" });
      }
      return { ok: false, msg: "官方WS未就绪" };
    }

    try {
      const msgId = ext?.replyTarget?.msgId || ext?.meta?.d?.id;
      const res = await this.wsBot.sendDmMessage(guildid, content, msgId ? { msgId } : undefined);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 已发送频道私聊 [Guild: ${guildid}]`, level: "info" });
      }
      return res;
    } catch (err) {
      console.error(`[qqBot/官方WS] 频道私聊发送异常: ${err.message}`);
      if (this.app && this.appManager) {
        this.appManager.dispatch(this.app.id, "log", { text: `[qqBot/官方WS] 频道私聊发送异常: ${err.message}`, level: "error" });
      }
      return { ok: false, msg: err.message };
    }
  }
};


