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

// 通过 backend.js 注入 io 实例（由 backend.js 在 init 时设置 this.appManager）

const options = {
  get: async (key) => backend.app?.data?.config?.[key],
  set: async (key, value) => {
    if (backend.app?.data?.config) {
      backend.app.data.config[key] = value;
    }
  }
};

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

      let listId = ext?.listId || 0;
      if (groupConfig?.switch && groupConfig.listId > 0) {
        listId = groupConfig.listId;
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
        // 推送到前端 UI
        if (backend.appManager?.io) {
          backend.appManager.io.emit("chat", chat);
        }
      }
      else {
        //console.log("[qqBot/msgCenter] localSend 失败:找不到消息对应的本地智能体", { tag, user, msg, ext })
      }

    } catch (innerErr) {
      console.error("[qqBot/msgCenter] localSend 失败:", innerErr, { tag, user, msg, ext });
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
      console.error("[qqBot/msgCenter] qqUserSend 错误:", err);
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
      console.error("[qqBot/msgCenter] qqLocalUserSend 错误:", err);
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
      console.error("[qqBot/msgCenter] qqChannelSend 错误:", err);
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
      console.error("[qqBot/msgCenter] qqChannelUserSend 错误:", err);
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
      console.error("[qqBot/msgCenter] qqGroupSend 错误:", err);
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
          console.log("【错误】qqWsServer.ws未初始化");
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
      console.error("[qqBot/msgCenter] qqLocalGroupSend 错误:", err);
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
      console.error("[qqBot/msgCenter] allSend 缺少 source 参数");
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
      console.error("[qqBot/msgCenter] allSend 缺少 source 参数");
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
          console.error(`[qqBot/msgCenter] 命令 ${file} 执行失败:`, cmdErr);
        }
      }
    } catch (err) {
      console.error("[qqBot/msgCenter] send 错误:", err);
    }
  }
};
