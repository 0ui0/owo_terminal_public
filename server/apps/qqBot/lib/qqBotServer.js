import { WebSocket } from "ws";
import backend from "../backend.js";
import msgCenter from "./botMsgCenter.js";
import { qlog } from "./logger.js";


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

    if(this.ws){
      qlog(`[qqBot/WS] start:WS实例已存在`, "conn");
      return
    }

    qlog(`[qqBot/WS] 连接本地 OneBot: ${this.wsUrl}`, "conn");
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.bindEvents();
    } catch (err) {
      qlog(`[qqBot/WS] 连接失败: ${err.message} 10秒后尝试重连...`, "error");

      if(this.reconnectTimer){
        return
      }

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.start();
      }, 10*1000);
    }
  },

  /**
   * 绑定 WS 事件（仅在 start 之后调用，确保 msgCenter 已就绪）
   */
  bindEvents: function () {
    if (!this.ws) return;

    this.ws.on("open", () => {
      qlog("[qqBot/WS] 连接已打开", "conn");
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
          qlog("[qqBot/WS] 收到私聊消息，已忽略", "info");
        }
      } catch (err) {
        qlog(`[qqBot/WS] 解析消息失败: ${err.message}`, "error");
      }
    });

    this.ws.on("close", () => {
      qlog("[qqBot/WS] 连接已断开", "conn");
    });

    this.ws.on("error", (err) => {
      const detail = Array.isArray(err.errors)
        ? err.errors.map(e => e.message || e.code).join("; ")
        : (err.code ? `${err.code}: ${err.message || ""}`.trim() : err.message);
      qlog(`[qqBot/WS] WS 错误: ${detail}`, "error");
    });
  },

  /**
   * 停止连接
   */
  stop: function () {
    if (this.ws) {
      try { 
        this.ws.removeAllListeners();
        this.ws.terminate(); 
      } catch (err) {
        qlog(`[qqBot/WS] 停止WS失败 ${err.message}`, "conn");
      }
      this.ws = null;
    }
    if (this.reconnectTimer) {
      this.reconnectTimer = clearTimeout(this.reconnectTimer);
    }
  },

};
