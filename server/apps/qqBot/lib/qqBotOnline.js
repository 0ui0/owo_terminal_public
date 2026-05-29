/* qqBotOnline.js - QQ 官方机器人 API 封装（纯 HTTP 调用） */

export default {
  secret: null,
  accessToken: {
    value: null,
    timestamp: null,
    expiresIn: 0
  },
  apiUrl: "https://api.sgroup.qq.com",
  apiVersion: "v2",

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
        console.error("[用户消息]", { type, content, req });
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
        console.error("[群消息]", { type, content, req });
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
        console.error("[频道消息]", { type, content, req });
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
        console.error("[频道私信消息]", { type, content, req });
      }
      return req;
    } catch (err) {
      throw err;
    }
  }
};
