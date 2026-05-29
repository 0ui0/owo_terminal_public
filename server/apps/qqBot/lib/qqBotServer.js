import { WebSocket } from "ws";
import backend from "../backend.js";
import msgCenter from "./botMsgCenter.js";


const options = {
  get: async (key) => {
    return backend.app?.data?.config[key]
  }
};

export default {
  ws: null,
  wsUrl: null,
  reconnectTimer: null,

  /**
   * 启动连接
   * @param {string} wsUrl - WebSocket 地址
   */
  start: async function (wsUrl) {
    // 优先使用传入的地址，如果没有则使用上次保存的地址
    this.wsUrl = wsUrl || this.wsUrl;

    if (!this.wsUrl) {
      throw new Error("丢失wsUrl")
    }

    // 清理旧连接
    this.stop();

    console.log(`[qqBot/WS] 连接本地 OneBot: ${this.wsUrl}`);
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.bindEvents();
    } catch (err) {
      console.error("[qqBot/WS] 连接失败:", err.message);
      this.scheduleReconnect();
    }
  },

  /**
   * 绑定 WS 事件（仅在 start 之后调用，确保 msgCenter 已就绪）
   */
  bindEvents: function () {
    if (!this.ws) return;

    this.ws.on("open", () => {
      console.log("[qqBot/WS] 连接已打开");
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.ws.on("message", async (rawData) => {
      try {
        const localSwitch = await options.get("3rd_qqRobotLocal_switch");

        if (!localSwitch) return;

        const payload = JSON.parse(String(rawData));

        // [精准拦截] 如果消息是机器人自己发出的，则忽略，防止 UI 回显死循环
        if (payload.user_id && payload.self_id && String(payload.user_id) === String(payload.self_id)) {
          return;
        }

        //console.log("payload", JSON.stringify(payload, null, "\t"))


        if (payload.message_type === "group") {
          const msg = payload.raw_message;
          if (msg && msgCenter) {
            await msgCenter.send("qqLocal/group", payload.sender.nickname, msg, {
              meta: payload,
              source: "qqLocal/group"
            });
          }
        } else if (payload.message_type === "private") {
          // 计划书：暂不处理私聊
          console.log("[qqBot/WS] 收到私聊消息，已忽略");
        }
      } catch (err) {
        console.error("[qqBot/WS] 解析消息失败:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[qqBot/WS] 连接已断开");
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[qqBot/WS] WS 错误:", err.message);
    });
  },

  /**
   * 断线重连
   */
  scheduleReconnect: function () {
    if (this.reconnectTimer) return;
    console.log("[qqBot/WS] 10秒后尝试重连...");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start();
    }, 10000);
  },

  /**
   * 停止连接
   */
  stop: function () {
    if (this.ws) {
      try { this.ws.terminate(); } catch (e) { /* ignore */ }
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  },

};
