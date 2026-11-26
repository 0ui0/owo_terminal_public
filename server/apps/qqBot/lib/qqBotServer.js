import { WebSocket } from "ws";
import msgCenter from "./botMsgCenter.js";

export default {
  ws: null,
  wsUrl: "",
  reconnectTimer: null,
  app: null,
  appManager: null,

  /**
   * 启动连接
   * @param {string} wsUrl - WebSocket 地址
   * @param {object} app - 当前 App 实例
   * @param {object} appManager - 系统 App 管理器
   */
  async start(wsUrl, app, appManager) {
    this.app = app;
    this.appManager = appManager;
    this.wsUrl = wsUrl;

    if (this.ws) {
      this.appManager.dispatch(this.app.id, "log", {
        text: "[qqBot/WS] start: WS实例已存在",
        level: "conn"
      });
      return;
    }

    this.appManager.dispatch(this.app.id, "log", {
      text: `[qqBot/WS] 连接本地 OneBot: ${this.wsUrl}`,
      level: "conn"
    });

    try {
      this.ws = new WebSocket(this.wsUrl);
      this.bindEvents();
    } catch (err) {
      console.error(`[qqBot/WS] 连接失败: ${err.message}`);
      this.appManager.dispatch(this.app.id, "log", {
        text: `[qqBot/WS] 连接失败: ${err.message} 10秒后尝试重连...`,
        level: "error"
      });

      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.start(this.wsUrl, this.app, this.appManager);
        }, 10000);
      }
    }
  },

  /**
   * 绑定 WS 事件
   */
  bindEvents() {
    this.ws.on("open", () => {
      this.appManager.dispatch(this.app.id, "log", {
        text: "[qqBot/WS] 连接已打开",
        level: "conn"
      });
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.ws.on("message", async (rawData) => {
      try {
        const localSwitch = this.app.data.config["3rd_qqRobotLocal_switch"];
        if (!localSwitch) return;

        const payload = JSON.parse(String(rawData));

        // [精准拦截] 如果消息是机器人自己发出的，则忽略，防止 UI 回显死循环
        if (payload.user_id && payload.self_id && String(payload.user_id) === String(payload.self_id)) {
          return;
        }

        //console.log("payload", JSON.stringify(payload, null, "\t"))

        if (payload.message_type === "group") {
          const msg = payload.raw_message;
          if (msg) {
            await msgCenter.send("qqLocal/group", payload.sender.nickname, msg, {
              meta: payload,
              source: "qqLocal/group"
            });
          }
        } else if (payload.message_type === "private") {
          // 计划书：暂不处理私聊
          this.appManager.dispatch(this.app.id, "log", {
            text: "[qqBot/WS] 收到私聊消息，已忽略",
            level: "info"
          });
        }
      } catch (err) {
        console.error(`[qqBot/WS] 解析消息失败: ${err.message}`);
        this.appManager.dispatch(this.app.id, "log", {
          text: `[qqBot/WS] 解析消息失败: ${err.message}`,
          level: "error"
        });
      }
    });

    this.ws.on("close", () => {
      this.appManager.dispatch(this.app.id, "log", {
        text: "[qqBot/WS] 连接已断开",
        level: "conn"
      });
    });

    this.ws.on("error", (err) => {
      const detail = Array.isArray(err.errors)
        ? err.errors.map(e => e.message || e.code).join("; ")
        : (err.code ? `${err.code}: ${err.message || ""}`.trim() : err.message);
      console.error(`[qqBot/WS] WS 错误: ${detail}`);
      this.appManager.dispatch(this.app.id, "log", {
        text: `[qqBot/WS] WS 错误: ${detail}`,
        level: "error"
      });
    });
  },

  /**
   * 停止连接
   */
  stop() {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch (err) {
        console.error(`[qqBot/WS] 停止WS失败: ${err.message}`);
        this.appManager.dispatch(this.app.id, "log", {
          text: `[qqBot/WS] 停止WS失败: ${err.message}`,
          level: "error"
        });
      }
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
};
