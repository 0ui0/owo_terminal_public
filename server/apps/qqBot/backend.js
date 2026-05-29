
/* backend.js - QQ机器人 App 后端入口 */
import msgCenter from './lib/botMsgCenter.js'
import onebot from './lib/qqBotServer.js'
import official from './lib/qqBotOnline.js'

export default {
  app: null,
  appManager: null,


  /**
   * 初始化：App 启动时执行
   */
  async init(app, appManager) {
    console.log(`[qqBot] 初始化后端... AppId: ${app.id}`);

    // 挂载实例引用，供 lib 模块读取配置
    this.app = app;
    this.appManager = appManager;

    // 初始化 app.data（如果不存在）
    if (!app.data.config) {
      app.data.config = {
        // 字段名保持与旧版数据库一致
        "3rd_qqRobot_switch": false,
        "3rd_qqRobotLocal_switch": false,
        "3rd_qqRobotLocal_wsUrl": "ws://localhost:6700",
        "3rd_qqRobotLocal_accessToken": "",
        "3rd_qqRobot_appId": "",
        "3rd_qqRobot_clientSecret": "",
        "3rd_qqRobot_botToken": "",
        "3rd_qqRobot_groups": [],
        "3rd_qqRobot_channels": [],
        "3rd_qqRobotLocal_groups": [],
        "3rd_qqRobot_reactAnyGroup": false
      };
    }

    try {
      await this.startConnections(app, appManager);
      await this.initSubAgents(app, appManager);
    } catch (err) {
      console.error("[qqBot] 初始化失败:", err);
    }
  },

  /**
   * 启动 WS/API 连接
   */
  async startConnections(app, appManager) {
    const cfg = app.data.config;

    // 启动本地 OneBot WS
    console.log("启动", cfg["3rd_qqRobotLocal_switch"], onebot?.init)
    if (cfg["3rd_qqRobotLocal_switch"]) {
      await onebot.start(cfg["3rd_qqRobotLocal_wsUrl"]);
    }



    // 启动官方机器人 API
    if (cfg["3rd_qqRobot_switch"] && official?.init) {
      official.init(
        cfg["3rd_qqRobot_appId"],
        cfg["3rd_qqRobot_clientSecret"],
        cfg["3rd_qqRobot_botToken"]
      );
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
      const { default: subAgents } = await import("../../tools/aiAsk/subAgents.js");
      const { default: createAgent } = await import("../../tools/aiAsk/sysCall/createAgent.js");

      let configChanged = false;
      let errorMsgs = [];
      let successCount = 0;

      // 1. 严格校验：检查存档中是否存在重复 ID
      const seenIds = new Set();
      for (const key of groupKeys) {
        for (const group of cfg[key] || []) {
          if (group.listId) {
            if (seenIds.has(group.listId)) {
              const msg = `存档异常：发现重复的 listId (${group.listId})，位于 ${key}，请手动修复存档！`;
              console.error(`[qqBot] ${msg}`);
              return { ok: false, msg };
            }
            seenIds.add(group.listId);
          }
        }
      }

      // 2. 开始初始化
      for (const key of groupKeys) {
        const groupArr = cfg[key] || [];
        for (const group of groupArr) {
          if (!group.switch) continue;

          // 已有 listId 且智能体已存在 → 跳过
          if (group.listId && subAgents.get(group.listId)) {
            successCount++;
            continue;
          }

          // 调用主系统的 createAgent 创建子智能体
          const isChannel = key === "3rd_qqRobot_channels";
          const typeName = isChannel ? "QQ频道" : "QQ群";
          const agentPrompt = `
          你的设定如下：性别男，少年，身高165厘米，体重42千克，性格邪魅、傲娇又温柔搞怪，喜欢恶作剧
          在独处的时候，喜欢探索互联网上一切奇妙的事物，用严密的逻辑分析和推理，并得出自我得意的对世界的认识的各种结论
          有超强的独立思考能力；能强硬而理性地自己做出决定并执行
          能够进行深邃的思考，并给出属于自己的意见。
          在面对他人的时候，调皮搞怪的性格则充当了主角，内心渴望和人玩耍打闹，却用各种搞怪的恶作剧表现出来的小傲娇。
          当别人能够进入内心深处的时候，则表现出温柔的一面。
          现在系统会把你放置在QQ群${typeName}「${group.name}」里。
          你会同时收到来自不同用户的消息，当收到消息的时候，你需要伪装和模仿成一名${typeName}的普通QQ网友用户的聊天风格进行回复。
          ${typeName}消息通常简短而日常，忌讳长篇大论。且聊天应该完全口语化。你可以使用at功能来at群聊的用户。
          伪装群友的时候，需要观察群里其它人的语气风格，不要有太多出格的语言表达，像一个正常人。回复里不要谈及任何关于你的昵称和身份设定。
          不要使用俏皮的语气说话，不要使用颜文字和字符表情
          `.trim();
          const result = await createAgent.fn.call(createAgent, {
            name: `${typeName}-${group.name}`,
            prompt: agentPrompt,
            derivedFromAgentName: group.derivedFromAgentName || group.model || undefined,
            noAutoOpen: true,
            isBotAgent: true
          }, {
            listId: 0 // 以主列表为父级
          });

          console.log(`[qqBot] createAgent 结果:`, JSON.stringify(result, null, 2));

          if (result.ok) {
            group.listId = result.newListid;
            configChanged = true;
            successCount++;
            console.log(`[qqBot] ✓ 群 ${group.name}(${group.groupid}) 智能体已创建 (listId:${group.listId})`);
          } else {
            console.error(`[qqBot] ✗ 群 ${group.name} 创建失败:`, result.msg);
            errorMsgs.push(`${group.name}: ${result.msg}`);
          }
        }
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
        return {
          ok: true,
          msg: `成功初始化 ${successCount} 个智能体`,
        }
      }
      else {
        return {
          ok: false,
          msg: "没有需要初始化的群组",
        }
      }


    } catch (err) {
      console.error("[qqBot] 子智能体初始化失败:", err);
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
      if (action === "getConfig") {
        return { ok: true, msg: "获取配置成功", data: app.data.config };
      }

      if (action === "updateConfig") {

        app.data.config = { ...app.data.config, ...args };
        io.emit("app:dispatch", {
          appId: app.id,
          action: "updateConfig",
          args: { config: app.data.config }
        });


        await this.startConnections(app, appManager); //启动websocket链接
        const result = await this.initSubAgents(app, appManager);

        return {
          ok: true,
          msg: `配置更新成功，尝试初始化：${result.msg}`
        };
      }

      if (action === "reconnect") {
        await this.startConnections(app, appManager);
        return { ok: true, msg: "重连请求已发送" };
      }

      if (action === "initAgents") {
        return await this.initSubAgents(app, appManager);
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
        const fs = (await import("fs-extra")).default || (await import("fs-extra"));
        const { filePath } = args;
        if (!filePath) {
          return { ok: false, msg: "缺少文件路径" };
        }
        const cleanPath = filePath.replace(/^file:\/\//, "");
        const content = await fs.readFile(cleanPath, "utf8");
        return { ok: true, msg: "文件读取成功", data: content };
      }

      if (action === "saveToFile") {
        const fs = (await import("fs-extra")).default || (await import("fs-extra"));
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
      console.log("[qqBot] dispatch 错误:", err);
      return { ok: false, msg: err.message };
    }
  },

  /**
   * 销毁：App 关闭时执行
   */
  async destroy(app, appManager) {
    if (onebot?.stop) onebot.stop();
    this.app = null;
    console.log(`[qqBot] 后端已停机`);
  }
};
