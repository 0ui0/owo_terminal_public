/* 
 * botMsgCenter.js - 消息路由中心 (完全隔离版) 
 * 
 * [HMR 重要注意事项]：
 * 1. 本模块属于 App 业务层，支持热更新（HMR）。
 * 2. 【严禁】在主系统（如 server/ioServer/ 等非 apps 目录）中直接静态 import 本模块。
 * 3. 如果主系统直接 import，会导致主系统永远持有第一次加载的旧版本（僵尸模块），导致热更新失效。
 * 4. 外部系统调用必须通过 appManager.dispatch(appId, "send", args) 进行动态分发。
 */
import pathLib from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import backend from "../backend.js";
import { qlog } from "./logger.js";

// 通过 backend.js 注入 io 实例（由 backend.js 在 init 时设置 this.appManager）

const options = {
  get: async (key) => backend.app?.data?.config?.[key],
  set: async (key, value) => {
    if (backend.app?.data?.config) {
      backend.app.data.config[key] = value;
    }
  }
};

// 已提示过的“未配置目标”集合，避免同一目标反复刷屏
const _ignoredTargets = new Set();

const createMsg = (tag, user, msg) => {
  const tagStr = tag ? `【${tag}】` : "";
  const userStr = user ? user.slice(0, 7) + ":" : "";
  return `${tagStr}${userStr}${msg}`;
};

export default {
  /**
   * 向本地 UI 发送消息（通过注入的 io）
   */
  localSend: async function (tag, user, msg, ext) {
    /*
    const tmp = {
      msg: createMsg(tag, user, msg),
      time: Date.now(),
      user: user || "消息中心",
      uid: 0,
      chatListId: ext?.listId || 0
    };
    const io = backend.appManager?.io;
    if (io) {
      io.emit("chat", tmp);
    }
    */
    try {
      const { meta } = ext || {};
      const fromGroupid = meta?.d?.group_id || meta?.group_id || meta?.d?.channel_id;

      const { default: subAgents } = await import("../../../tools/aiAsk/subAgents.js");
      const { default: chats } = await import("../../../ioServer/ioApis/chat/chats.js");
      const { default: idTool } = await import("../../../tools/idTool.js");

      const groups = (await options.get("3rd_qqRobot_groups")) || [];
      const localGroups = (await options.get("3rd_qqRobotLocal_groups")) || [];
      const channels = (await options.get("3rd_qqRobot_channels")) || [];
      const allGroups = [...groups, ...localGroups, ...channels];
      const groupConfig = allGroups.find(g => String(g.groupid || g.channelid) === String(fromGroupid));

      // 归属判定：群/频道消息必须落到其对应的子智能体会话。
      // 若该目标不在配置里（或尚未创建子智能体），它就不属于任何会话，直接丢弃。
      // 【重要】绝不能兜底到 0（主会话），否则未配置群的消息会污染主 AI 的上下文。
      let listId = ext?.listId || 0;
      if (groupConfig?.switch && groupConfig.listId > 0) {
        listId = groupConfig.listId;
      }
      else if (!ext?.listId) {
        if (!_ignoredTargets.has(String(fromGroupid))) {
          _ignoredTargets.add(String(fromGroupid));
          qlog(`[qqBot/msgCenter] 目标未配置或子智能体未就绪，已忽略该目标的消息 (from: ${fromGroupid})`, "info");
        }
        return;
      }

      const agent = subAgents.get(listId);

      if (agent) {
        const chat = {
          uuid: idTool.get("chat"),
          content: createMsg(tag, user, msg),
          name: user,
          group: ext?.group || "user",
          timestamp: Date.now(),
          chatListId: listId,
          ask: ext?.ask
        };
        await chats.add(chat, listId);
        agent.addAsk(chat.name, "user", chat.content, {
          id: chat.uuid,
          listId
        });
        // 推送到前端 UI（双通道：职责不同，互补，缺一不可）
        // "chat"      —— 消息实体推送：把完整 chat 对象推给前端，是“前端事实收到消息”的接口，供未来实时消费/流式渲染等使用
        // "chat:push" —— 列表刷新指令：只携带 listId，前端收到后清页 + 重新 pull + 滚到底
        // 注意：chat:push 不携带消息内容，只发它前端不会新增消息
        if (backend.appManager?.io) {
          backend.appManager.io.emit("chat", chat);
          backend.appManager.io.emit("chat:push", { listId });
        }
      }
      else {
        //console.log("[qqBot/msgCenter] localSend 失败:找不到消息对应的本地智能体", { tag, user, msg, ext })
      }

    } catch (innerErr) {
      qlog(`[qqBot/msgCenter] localSend 失败: ${innerErr?.message || innerErr}`, "error");
    }
  },

  /**
 * 向 QQ 官方用户私信
 */
  qqUserSend: async function (uid, tag, user, msg, ext) {
    try {
      const qqBotOnline = (await import("./qqBotOnline.js")).default;
      const qqRobotSwitch = await options.get("3rd_qqRobot_switch");
      if (qqRobotSwitch) {
        await qqBotOnline.msgUser(uid, 0, createMsg(tag, user, msg), ext);
      }
    } catch (err) {
      qlog(`[qqBot/msgCenter] qqUserSend 错误: ${err.message}`, "error");
    }
  },

  /**
  * 通过本地 OneBot 向私人发送消息
  */
  qqLocalUserSend: async function (uid, tag, user, msg, ext) {
    try {
      const qqWsServer = (await import("./qqBotServer.js")).default;
      const localSwitch = await options.get("3rd_qqRobotLocal_switch");
      if (localSwitch && qqWsServer.ws) {
        qqWsServer.ws.send(JSON.stringify({
          action: "send_private_msg",
          params: {
            user_id: uid,
            group_id: ext?.group_id,
            message: createMsg(tag, user, msg),
            auto_escape: false
          }
        }));
      }
    } catch (err) {
      qlog(`[qqBot/msgCenter] qqLocalUserSend 错误: ${err.message}`, "error");
    }
  },



  /**
   * 向指定QQ频道发送消息
   */
  qqChannelGroupSend: async function (channelid, tag, user, msg, ext) {
    try {
      const qqBotOnline = (await import("./qqBotOnline.js")).default;
      const qqRobotSwitch = await options.get("3rd_qqRobot_switch");
      if (qqRobotSwitch) {
        await qqBotOnline.msgChannel(channelid, 0, createMsg(tag, user, msg), ext);
      }
    } catch (err) {
      qlog(`[qqBot/msgCenter] qqChannelSend 错误: ${err.message}`, "error");
    }
  },

  async localMsgSendToQqChannelGroups(tag, user, msg, ext) {
    const qqRobotChannels = await options.get("3rd_qqRobot_channels");
    const qqRobotReactAnyGroup = await options.get("3rd_qqRobot_reactAnyGroup");
    const fromChannelid = ext?.meta?.d?.channel_id;

    for (const channel of qqRobotChannels) {
      if (!channel.switch) continue;
      if (channel.listId === ext.listId) {
        await this.qqChannelGroupSend(channel.channelid, tag, user, msg, ext)
      }
    }
  },

  /**
   * 向 QQ 频道私信发送消息
   */
  qqChannelUserSend: async function (guildid, tag, user, msg, ext) {
    try {
      const qqBotOnline = (await import("./qqBotOnline.js")).default;
      const qqRobotSwitch = await options.get("3rd_qqRobot_switch");
      if (qqRobotSwitch) {
        await qqBotOnline.msgChannelUser(guildid, 0, createMsg(tag, user, msg), ext);
      }
    } catch (err) {
      qlog(`[qqBot/msgCenter] qqChannelUserSend 错误: ${err.message}`, "error");
    }
  },

  /**
   * 向指定 QQ 官方群发送消息
   */
  qqGroupSend: async function (groupid, tag, user, msg, ext) {
    try {
      const qqBotOnline = (await import("./qqBotOnline.js")).default;
      const qqRobotSwitch = await options.get("3rd_qqRobot_switch");
      if (qqRobotSwitch) {
        await qqBotOnline.msgGroup(groupid, 0, createMsg(tag, user, msg), ext);
      }
    } catch (err) {
      qlog(`[qqBot/msgCenter] qqGroupSend 错误: ${err.message}`, "error");
    }
  },

  async localMsgSendToQqGroups(tag, user, msg, ext) {
    const qqRobotGroups = await options.get("3rd_qqRobot_groups");
    const qqRobotReactAnyGroup = await options.get("3rd_qqRobot_reactAnyGroup");
    const fromGroupid = ext?.meta?.d?.group_id;

    for (const group of qqRobotGroups) {
      if (!group.switch) continue;
      if (group.listId === ext.listId) {
        await this.qqGroupSend(group.groupid, tag, user, msg, ext);
      }
    }
  },



  /**
   * 通过本地 OneBot 向某个群发送消息
   */
  qqLocalGroupSend: async function (groupid, tag, user, msg, ext) {
    try {
      const qqWsServer = (await import("./qqBotServer.js")).default;
      const localSwitch = await options.get("3rd_qqRobotLocal_switch");
      if (localSwitch) {
        if (!qqWsServer.ws) {
          // HMR / 重连期间模块实例可能被重建，ws 会丢失；这里主动按配置里的地址补连一次，下一条消息即可恢复正常
          const wsUrl = backend.app?.data?.config?.["3rd_qqRobotLocal_wsUrl"];
          qlog(`[qqBot/msgCenter] 本地 WS 未就绪，已触发自动重连 (${wsUrl || "无地址"})，本次发送跳过`, "conn");
          if (wsUrl) {
            qqWsServer.start(wsUrl).catch(err => qlog(`[qqBot/msgCenter] 自动重连失败: ${err.message}`, "error"));
          }
          return;
        }
        qqWsServer.ws.send(JSON.stringify({
          action: "send_group_msg",
          params: {
            group_id: groupid,
            message: createMsg(tag, user, msg),
            auto_escape: false
          },
          echo: ext?.echo
        }));
      }
    } catch (err) {
      qlog(`[qqBot/msgCenter] qqLocalGroupSend 错误: ${err.message}`, "error");
    }
  },

  async localMsgSendToQqLocalGroups(tag, user, msg, ext) {
    const localGroups = await options.get("3rd_qqRobotLocal_groups")

    for (const group of localGroups) {
      if (!group.switch) continue;
      if (group.listId === ext.listId) {
        await this.qqLocalGroupSend(group.groupid, tag, user, msg, ext);
      }

    }
  },


  async privateSend(tag, user, msg, ext) {
    if (!ext?.source) {
      qlog("[qqBot/msgCenter] privateSend 缺少 source 参数", "error");
      return;
    }
    if (ext.source === "qqOnline/private") {
      const unionOpenid = ext.meta?.d?.author?.union_openid;
      await this.qqUserSend(unionOpenid, tag, user, msg, {
        msg_id: ext.meta?.d?.id
      });
    }
    else if (ext.source === "qqLocal/private") {
      const qqNumber = ext.meta?.sender?.user_id;
      if (qqNumber) {
        await this.qqLocalUserSend(qqNumber, tag, user, msg);
      }
    }
    else if (ext.source === "qqOnline/channelPrivate") {
      const guildid = ext.meta?.d?.guild_id;
      if (guildid) {
        await this.qqChannelUserSend(guildid, tag, user, msg, {
          msg_id: ext.meta?.d?.id,
          message_reference: { message_id: ext.meta?.d?.id }
        });
      }
    }
  },
  /**
   * 统一广播（根据来源路由到所有目标）
   */
  allSend_noUse: async function (tag, user, msg, ext) {
    if (!ext?.source) {
      qlog("[qqBot/msgCenter] allSend_noUse 缺少 source 参数", "error");
      return;
    }
    await this.privateSend(tag, user, msg, ext);

    // 群聊消息：广播到所有渠道
    /*
    await this.localSend(tag, user, msg, ext);
    await this.qqChannelsSend(tag, user, msg, {
      msg_id: ext.meta?.d?.channel_id ? ext.meta?.d?.id : undefined,
      message_reference: ext.meta?.d?.channel_id ? { message_id: ext.meta?.d?.id } : undefined,
      ...ext
    });
    if (ext.source === "qqOnline/group") {
      await this.qqGroupsSend(tag, user, msg, {
        msg_id: ext.meta?.d?.group_id ? ext.meta?.d?.id : undefined,
        ...ext
      });
    }
    await this.qqLocalGroupSend(tag, user, msg, ext);
    */
  },

  /**
   * 核心入口：接收消息并路由处理
   */
  send: async function (source, user, msg = "非文本消息", ext) {
    try {
      const { meta } = ext || {};


      //本地智能体列表消息发到对应群，根据ext.listId查找
      if (source === "local") {
        await this.localMsgSendToQqLocalGroups("宅喵终端消息", user, msg, ext);
        await this.localMsgSendToQqChannelGroups("宅喵终端消息", user, msg, ext);
        //await this.localMsgSendToQqGroups("宅喵终端消息", user, msg, ext);
      }

      //群组消息发到对应的本地智能体列表，根据群号查找
      if (source === "qqLocal/group") {
        await this.localSend("宅喵/QQ群", user, msg, ext);
      }
      if (source === "qqOnline/group") {
        await this.localSend("QBot/QQ群", user, msg, ext);
      }
      if (source === "qqOnline/channel") {
        await this.localSend("QQ频道群组", user, msg, ext);
      }

      // 处理机器人命令
      const __dirname = pathLib.dirname(fileURLToPath(import.meta.url));
      const dir = pathLib.resolve(__dirname, "botCmds");
      const files = (await fs.readdir(dir)).filter(f => f.endsWith(".js"));

      for (const file of files) {
        try {
          const botCmd = (await import(`./botCmds/${file}`)).default;
          if (botCmd.cmd) {
            const isWildcard = botCmd.cmd === '*';
            const isMatch = isWildcard || (msg && (msg.match(new RegExp(`/${botCmd.cmd}`)) || msg.match(new RegExp(`^${botCmd.cmd}$`))));
            if (isMatch) {
              await botCmd.run({
                source, user, msg, ext, meta, msgCenter: this
              });
            }
          }
        } catch (cmdErr) {
          qlog(`[qqBot/msgCenter] 命令 ${file} 执行失败: ${cmdErr?.message || cmdErr}`, "error");
        }
      }
    } catch (err) {
      qlog(`[qqBot/msgCenter] send 错误: ${err.message}`, "error");
    }
  }
};
