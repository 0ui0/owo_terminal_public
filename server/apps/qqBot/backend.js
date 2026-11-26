
/* backend.js - QQ机器人 App 后端入口 */
import msgCenter from './lib/botMsgCenter.js'
import onebot from './lib/qqBotServer.js'
import official from './lib/qqBotOnline.js'
import getToolsList from '../../crossFuncs/getToolsList.js'
import comData from '../../comData/comData.js'
import projectManager from "../../managers/projectManager.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import createAgent from "../../tools/aiAsk/sysCall/createAgent.js"
import fs from "fs-extra"

export default {
  // [多实例注册表]：以 app.id 为 Key 独立管理每一个实例的运行时上下文与状态
  instances: new Map(),
  _seq: 0, // 日志自增序列号，供前端控制台增量拉取 (sinceId) 比对去重

  // 兼容过渡指针（指向当前活跃实例）
  app: null,
  appManager: null,

  /**
   * 初始化：App 启动时执行
   */
  async init(app, appManager) {
    this.app = app;
    this.appManager = appManager;

    // 注册到多实例池
    this.instances.set(app.id, {
      app,
      appManager,
      qrStop: null,
      discoveredGroups: [],
      createdAt: Date.now()
    });

    // 初始化日志存储（随实例生命周期绑定，实例销毁即随 app.data 自动回收）
    if (!app.data.logs) {
      app.data.logs = [];
    }

    // 挂载消息中心实例与管理器
    msgCenter.init(app, appManager);

    this.dispatch({
      app,
      action: "log",
      args: { text: `[qqBot] 初始化后端实例... AppId: ${app.id}`, level: "conn" },
      appManager,
      io: appManager?.io
    });

    // 初始化 app.data（如果不存在）
    if (!app.data.config) {
      app.data.config = {
        // 字段名保持与旧版数据库一致
        "3rd_qqRobot_switch": false,
        "3rd_qqRobot_debugMode": false,
        "3rd_qqRobot_reactAnyGroup": false,
        "3rd_qqRobot_qqNum": "",
        "3rd_qqRobot_appid": "",
        "3rd_qqRobot_token": "",
        "3rd_qqRobot_secret": "",
        "3rd_qqRobot_groups": [],
        "3rd_qqRobot_channels": [],
        "3rd_qqRobotLocal_switch": false,
        "3rd_qqRobotLocal_qqNum": "",
        "3rd_qqRobotLocal_wsUrl": "ws://localhost:3100",
        "3rd_qqRobotLocal_groups": []
      };
    }

    try {
      await this.startConnections(app, appManager);
      await this.initSubAgents(app, appManager);
    } catch (err) {
      this.dispatch({
        app,
        action: "log",
        args: { text: `[qqBot] 初始化失败: ${err.message}`, level: "error" },
        appManager,
        io: appManager?.io
      });
    }
  },

  /**
   * 启动 WS/API 连接
   */
  async startConnections(app, appManager) {
    const cfg = app.data.config;

    const localSwitch = !!cfg["3rd_qqRobotLocal_switch"];
    const officialSwitch = !!cfg["3rd_qqRobot_switch"];

    // 本地 OneBot 连接（严格看开关，绝不自启）
    if (localSwitch && cfg["3rd_qqRobotLocal_wsUrl"]) {
      await onebot.stop();
      await onebot.start(cfg["3rd_qqRobotLocal_wsUrl"], app, appManager);
    } else {
      await onebot.stop();
    }

    // 官方机器人 WebSocket 长连（严格看开关，绝不自启）
    const appId = cfg["3rd_qqRobot_appid"];
    const secret = cfg["3rd_qqRobot_secret"];
    if (officialSwitch && appId && secret && official?.wsStart) {
      await official.wsStop();
      await official.wsStart(appId, secret, app, appManager);
    } else {
      if (official?.wsStop) await official.wsStop();
    }
  },

  /**
   * 核心：为配置中的每个群组初始化子智能体
   */
  async initSubAgents(app, appManager) {
    try {
      const cfg = app.data.config;
      const groupKeys = ["3rd_qqRobot_groups", "3rd_qqRobotLocal_groups", "3rd_qqRobot_channels"];

      // 动态导入主系统模块
      

      let configChanged = false;
      let errorMsgs = [];
      let successCount = 0;
      let updatedExistingCount = 0;

      // 1. 严格校验：检查存档中是否存在重复 ID
      const seenIds = new Set();
      for (const key of groupKeys) {
        for (const group of cfg[key] || []) {
          if (group.listId) {
            if (seenIds.has(group.listId)) {
              const msg = `存档异常：发现重复的 listId (${group.listId})，位于 ${key}，请手动修复存档！`;
              this.dispatch({ app, action: "log", args: { text: `[qqBot] ${msg}`, level: "error" }, appManager, io: appManager?.io });
              return { ok: false, msg };
            }
            seenIds.add(group.listId);
          }
        }
      }

      // 2. 开始初始化
      const grantedToolIdListMap = new Map();
      for (const key of groupKeys) {
        const groupArr = cfg[key] || [];
        for (const group of groupArr) {
          if (!group.switch) continue;

          // 已有 listId 且智能体已存在 → 同步覆盖现有会话的工具配置
          if (group.listId && subAgents.get(group.listId)) {
            const grantedTools = Array.isArray(group.toolIdList) ? group.toolIdList : [];
            grantedToolIdListMap.set(group.listId, grantedTools);
            await comData.data.edit(data => {
              const targetChatList = data.chatLists?.find(item => item.id === group.listId);
              if (targetChatList) {
                targetChatList.defaultTools = [...grantedTools];
                targetChatList.allowUseTools = [...grantedTools];
              }
            });
            updatedExistingCount++;
            successCount++;
            continue;
          }

          // 该接入目标的工具集：直接使用配置数组
          const grantedToolIdList = Array.isArray(group.toolIdList) ? group.toolIdList : [];

          // 调用主系统的 createAgent 创建子智能体
          const isChannel = key === "3rd_qqRobot_channels";
          const typeName = isChannel ? "QQ频道" : "QQ群";
          const personality = (group.prompt && group.prompt.trim()) ? group.prompt.trim() : "";
          const envInstruction = `
          现在系统会把你放置在QQ群${typeName}「${group.name}」里。
          你会同时收到来自不同用户的消息，当收到消息的时候，你需要伪装和模仿成一名${typeName}的普通QQ网友用户的聊天风格进行回复。
          ${typeName}消息通常简短而日常，忌讳长篇大论。且聊天应该完全口语化。你可以使用at功能来at群聊的用户。
          伪装群友的时候，需要观察群里其它人的语气风格，不要有太多出格的语言表达，像一个正常人。回复里不要谈及任何关于你的昵称和身份设定。
          减少使用颜文字和字符表情（会被识别成ai），只在需要特别表达情绪的时候点缀使用
          `.trim();
          const agentPrompt = personality ? `${personality}\n\n${envInstruction}` : envInstruction;
          const result = await createAgent.fn.call(createAgent, {
            name: `${typeName}-${group.name}`,
            prompt: agentPrompt,
            derivedFromModelId: group.derivedFromModelId || undefined,
            noAutoOpen: true,
            isBotAgent: true
          }, {
            listId: 0, // 以主列表为父级
            defaultTools: grantedToolIdList,
            allowUseTools: grantedToolIdList
          });

          if (result.ok) {
            group.listId = result.newListid;
            grantedToolIdListMap.set(group.listId, grantedToolIdList);
            configChanged = true;
            successCount++;
            this.dispatch({
              app,
              action: "log",
              args: { text: `[qqBot] 群 ${group.name}(${group.groupid}) 智能体已创建 (listId:${group.listId})`, level: "conn" },
              appManager,
              io: appManager?.io
            });
          } else {
            this.dispatch({
              app,
              action: "log",
              args: { text: `[qqBot] 群 ${group.name} 创建失败: ${result.msg}`, level: "error" },
              appManager,
              io: appManager?.io
            });
            errorMsgs.push(`${group.name}: ${result.msg}`);
          }
        }
      }

      // 把「授予的工具」与「会被确认拦截的工具」的交集写入各会话的免确认白名单
      for (const [listId, grantedToolIdList] of grantedToolIdListMap) {
        const confirmableRes = await getToolsList.func(listId);
        await comData.data.edit(data => {
          data.chatLists.find(item => item.id === listId).skipConfirmTools = confirmableRes.data
            .filter(tool => grantedToolIdList.includes(tool.id))
            .map(tool => tool.id);
        });
      }

      // 如果分配了新 listId，推送配置更新给前端
      if (configChanged && appManager?.io) {
        appManager.io.emit("app:dispatch", {
          appId: app.id,
          action: "updateConfig",
          args: { config: cfg }
        });
      }

      if (errorMsgs.length > 0) {
        return {
          ok: false,
          msg: `初始化完成，但存在错误：\n${errorMsgs.join("\n")}`
        };
      }

      if (successCount > 0) {
        let msg = `成功初始化 ${successCount} 个智能体`;
        if (updatedExistingCount > 0) {
          msg += `（已同步覆盖 ${updatedExistingCount} 个已有会话配置。⚠️为避免前缀缓存穿透，建议在会话列表内重新配置一次模型）`;
        }
        return {
          ok: true,
          msg,
        }
      }
      else {
        return {
          ok: false,
          msg: "没有需要初始化的群组",
        }
      }


    } catch (err) {
      this.dispatch({
        app,
        action: "log",
        args: { text: `[qqBot] 子智能体初始化失败: ${err.message}`, level: "error" },
        appManager,
        io: appManager?.io
      });
      return { ok: false, msg: "初始化异常: " + err.message };
    }
  },

  /**
   * 消息处理中心（前端 fnCall("appDispatch", ...) 触发）
   */
  async dispatch({ app, action, args, appManager, io }) {
    try {
      /**
       * [HMR 核心路由]
       * 由于主系统（如 Socket.IO）不能直接静态 import 本模块下的 lib 文件，
       * 必须通过此 dispatch 接口作为“中转港口”，从而确保外部调用始终指向最新的 HMR 实例。
       */
      if (action === "log") {
        const text = String(args?.text || "");
        const level = args?.level || "info";

        const item = {
          id: ++this._seq,
          time: Date.now(),
          level,
          text
        };

        if (!app.data.logs) {
          app.data.logs = [];
        }
        app.data.logs.push(item);
        if (app.data.logs.length > 500) {
          app.data.logs.shift();
        }

        if (io) {
          io.emit("app:dispatch", { appId: app.id, action: "log", args: item });
        }
        return { ok: true, msg: "日志已记录" };
      }

      if (action === "discoverGroup") {
        const groupOpenid = String(args?.groupOpenid || "").trim();
        if (!groupOpenid) {
          return { ok: false, msg: "缺少 groupOpenid" };
        }
        const inst = this.instances.get(app.id);
        if (!inst) {
          return { ok: false, msg: "实例未注册" };
        }
        if (!Array.isArray(inst.discoveredGroups)) {
          inst.discoveredGroups = [];
        }
        const record = {
          groupOpenid,
          sender: String(args?.sender || "用户"),
          lastMsg: String(args?.lastMsg || ""),
          timestamp: Number(args?.timestamp) || Date.now()
        };
        inst.discoveredGroups = [
          record,
          ...inst.discoveredGroups.filter((item) => item.groupOpenid !== groupOpenid)
        ].slice(0, 50);
        if (io) {
          io.emit("app:dispatch", {
            appId: app.id,
            action: "discoveredGroups",
            args: inst.discoveredGroups
          });
        }
        return { ok: true, msg: "已记录探测群", data: inst.discoveredGroups };
      }

      if (action === "getDiscoveredGroups") {
        const inst = this.instances.get(app.id);
        return {
          ok: true,
          msg: "获取已探测群列表成功",
          data: Array.isArray(inst?.discoveredGroups) ? inst.discoveredGroups : []
        };
      }

      if (action === "getConfig") {
        return {
          ok: true,
          msg: "获取配置成功",
          data: app.data.config
        };
      }

      if (action === "getStatus") {
        const cfg = app.data.config || {};
        return {
          ok: true,
          msg: "获取状态成功",
          data: {
            localSwitch: !!cfg["3rd_qqRobotLocal_switch"],
            localConnected: !!(onebot?.ws && onebot.ws.readyState === 1),
            localUrl: cfg["3rd_qqRobotLocal_wsUrl"] || "",
            officialSwitch: !!cfg["3rd_qqRobot_switch"],
            officialConnected: !!(official?.wsBot),
            officialConfigured: !!(cfg["3rd_qqRobot_appid"] && cfg["3rd_qqRobot_secret"]),
            officialAppId: cfg["3rd_qqRobot_appid"] || ""
          }
        };
      }

      if (action === "setPower") {
        const on = !!args?.on;
        // 互斥开关：若配置了官方凭据，优先以官方为主通道；否则以本地为主通道
        const preferOfficial = !!(app.data.config["3rd_qqRobot_appid"] && app.data.config["3rd_qqRobot_secret"]);

        app.data.config = {
          ...app.data.config,
          "3rd_qqRobot_switch": preferOfficial ? on : false,
          "3rd_qqRobotLocal_switch": preferOfficial ? false : on
        };

        io.emit("app:dispatch", {
          appId: app.id,
          action: "updateConfig",
          args: { config: app.data.config }
        });

        projectManager.markDirty();

        await this.startConnections(app, appManager);
        if (on) {
          await this.initSubAgents(app, appManager);
        }

        const modeName = preferOfficial ? "官方机器人" : "本地OneBot";
        this.dispatch({ app, action: "log", args: { text: `[qqBot] ${modeName}已${on ? "启动" : "停止"}`, level: "conn" }, appManager, io });
        return { ok: true, msg: on ? `${modeName}已启动` : `${modeName}已停止` };
      }

      if (action === "startQrBind") {
        try {
          const { startQrConnect } = await import("@tencent-connect/qqbot-connector");
          const session = this.instances.get(app.id);
          if (session?.qrStop) {
            try { session.qrStop(); } catch (e) {}
            session.qrStop = null;
          }

          this.dispatch({ app, action: "log", args: { text: "[qqBot] 正在生成手机 QQ 扫码连接凭证...", level: "conn" }, appManager, io });

          const qrStopFn = startQrConnect({
            onSuccess: async (credentials) => {
              const cred = credentials?.[0];
              if (cred?.appId && cred?.appSecret) {
                this.dispatch({
                  app,
                  action: "log",
                  args: { text: `[qqBot] 扫码绑定成功！已获取 AppID: ${cred.appId}，正在自动切换并启动官方长连接...`, level: "conn" },
                  appManager,
                  io
                });
                app.data.config["3rd_qqRobot_appid"] = cred.appId;
                app.data.config["3rd_qqRobot_secret"] = cred.appSecret;
                // 互斥切换：打开官方机器人，关闭本地 OneBot
                app.data.config["3rd_qqRobot_switch"] = true;
                app.data.config["3rd_qqRobotLocal_switch"] = false;
                projectManager.markDirty();

                // 立即拉起官方长连接，满足手机端的实时握手在线验证
                this.startConnections(app, appManager);

                io.emit("app:dispatch", {
                  appId: app.id,
                  action: "updateConfig",
                  args: { config: app.data.config }
                });

                io.emit("app:dispatch", {
                  appId: app.id,
                  action: "qrBindSuccess",
                  args: { appId: cred.appId, appSecret: cred.appSecret }
                });
              }
              if (session) session.qrStop = null;
            },
            onFailure: (error) => {
              const errText = `[qqBot] 扫码流程中止或失败: ${error?.message || error}`;
              console.error(errText);
              this.dispatch({ app, action: "log", args: { text: errText, level: "error" }, appManager, io });
              io.emit("app:dispatch", {
                appId: app.id,
                action: "qrBindFailure",
                args: { message: error?.message || String(error) }
              });
              if (session) session.qrStop = null;
            },
            onQrDisplayed: async (url) => {
              let qrImg = "";
              try {
                const QRCode = (await import("qrcode")).default;
                qrImg = await QRCode.toDataURL(url, { margin: 1, width: 220 });
              } catch (qrErr) {
                console.error(`[qqBot] 二维码生成图片失败: ${qrErr.message}`);
                this.dispatch({ app, action: "log", args: { text: `[qqBot] 二维码生成图片失败: ${qrErr.message}`, level: "error" }, appManager, io });
              }
              this.dispatch({ app, action: "log", args: { text: `[qqBot] 二维码就绪，手机 QQ 授权链接: ${url}`, level: "conn" }, appManager, io });
              io.emit("app:dispatch", {
                appId: app.id,
                action: "qrDisplayed",
                args: { url, qrImg }
              });
            }
          }, {
            displayQrCodeToConsole: true
          });

          if (session) session.qrStop = qrStopFn;

          return { ok: true, msg: "扫码任务已创建，请在终端查看二维码或在弹窗中扫码" };
        } catch (err) {
          console.error(`[qqBot] 调起扫码失败: ${err.message}`);
          this.dispatch({ app, action: "log", args: { text: `[qqBot] 调起扫码失败: ${err.message}`, level: "error" }, appManager, io });
          return { ok: false, msg: err.message };
        }
      }

      if (action === "stopQrBind") {
        const session = this.instances.get(app.id);
        if (session?.qrStop) {
          try { session.qrStop(); } catch (e) {}
          session.qrStop = null;
        }
        return { ok: true, msg: "扫码流程已取消" };
      }

      if (action === "getLogs") {
        const logs = app.data.logs || [];
        const sinceId = args?.sinceId ? Number(args.sinceId) : 0;
        const data = sinceId > 0 ? logs.filter(item => item.id > sinceId) : logs;
        return { ok: true, msg: "获取日志成功", data };
      }

      if (action === "clearLogs") {
        app.data.logs = [];
        return { ok: true, msg: "日志已清空" };
      }

      if (action === "resetPulse") {
        app.data.config = { ...app.data.config, pulseConfig: {} };

        projectManager.markDirty();

        io.emit("app:dispatch", {
          appId: app.id,
          action: "updateConfig",
          args: { config: app.data.config }
        });
        this.dispatch({ app, action: "log", args: { text: "[qqBot] 社交脉冲参数已恢复默认", level: "conn" }, appManager, io });
        return { ok: true, msg: "已恢复默认参数" };
      }

      if (action === "updateConfig") {

        app.data.config = { ...app.data.config, ...args };
        io.emit("app:dispatch", {
          appId: app.id,
          action: "updateConfig",
          args: { config: app.data.config }
        });

        // 打通 owo 存档持久化：配置变更后标记项目为脏
        projectManager.markDirty();

        this.dispatch({ app, action: "log", args: { text: "[qqBot] 配置已更新", level: "conn" }, appManager, io });

        await this.startConnections(app, appManager); //启动websocket链接
        const result = await this.initSubAgents(app, appManager);

        return {
          ok: true,
          msg: `配置更新成功，尝试初始化：${result.msg}`
        };
      }

      if (action === "send") {
        const { source, tag, msg, ext } = args;
        return await msgCenter.send(source, tag, msg, ext);
      }

      if (action === "openAgentWindow") {
        const { listId, name } = args;
        io.emit("agentWindow:open", { listId, name: name || `智能体 ${listId}` });
        return { ok: true, msg: "窗口打开请求已发送" };
      }

      if (action === "readFile") {
        const { filePath } = args;
        if (!filePath) {
          return { ok: false, msg: "缺少文件路径" };
        }
        const cleanPath = filePath.replace(/^file:\/\//, "");
        const content = await fs.readFile(cleanPath, "utf8");
        return { ok: true, msg: "文件读取成功", data: content };
      }

      if (action === "saveToFile") {
        const { filePath, content } = args;
        if (!filePath || content === undefined) {
          return { ok: false, msg: "缺少路径或内容" };
        }
        const cleanPath = filePath.replace(/^file:\/\//, "");
        await fs.writeFile(cleanPath, content, "utf8");
        return { ok: true, msg: "文件保存成功" };
      }

      return { ok: false, msg: `未知动作: ${action}` };
    } catch (err) {
      console.error(`[qqBot] dispatch 错误: ${err.message}`);
      this.dispatch({ app, action: "log", args: { text: `[qqBot] dispatch 错误: ${err.message}`, level: "error" }, appManager, io });
      return { ok: false, msg: err.message };
    }
  },

  /**
   * 销毁：App 实例关闭时执行
   */
  async destroy(app, appManager) {
    const session = this.instances.get(app.id);
    if (session?.qrStop) {
      try { session.qrStop(); } catch (e) {}
      session.qrStop = null;
    }
    this.dispatch({
      app,
      action: "log",
      args: { text: `[qqBot] 实例已停机: ${app.id}`, level: "conn" },
      appManager,
      io: appManager?.io
    });

    // 从实例注册表中注销
    this.instances.delete(app.id);

    // 仅当所有实例全部关闭时，才停止底层全局网络连接，绝不伤及其他存活实例
    if (this.instances.size === 0) {
      if (onebot?.stop) onebot.stop();
      if (official?.wsStop) await official.wsStop();
      this.app = null;
      this.appManager = null;
      msgCenter.init(null, null);
    } else {
      const nextSession = this.instances.values().next().value;
      this.app = nextSession.app;
      this.appManager = nextSession.appManager;
      msgCenter.init(nextSession.app, nextSession.appManager);
    }
  }
};
