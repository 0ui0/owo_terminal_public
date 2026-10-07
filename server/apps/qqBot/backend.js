
/* backend.js - QQ机器人 App 后端入口 */
import msgCenter from './lib/botMsgCenter.js'
import onebot from './lib/qqBotServer.js'
import official from './lib/qqBotOnline.js'
import { qlog, getLogs, clearLogs } from './lib/logger.js'
import { pulseMeta, pulseGroups } from './lib/pulseDefaults.js'
import getToolsList from '../../crossFuncs/getToolsList.js'
import comData from '../../comData/comData.js'
import projectManager from "../../managers/projectManager.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import createAgent from "../../tools/aiAsk/sysCall/createAgent.js"
import fs from "fs-extra"

export default {
  app: null,
  appManager: null,

  /**
   * 初始化：App 启动时执行
   */
  async init(app, appManager) {
    // 先挂载实例引用，供 lib 模块（含日志中心）读取
    this.app = app;
    this.appManager = appManager;

    // 初始化日志存储（随实例生命周期绑定，实例销毁即随 app.data 自动回收）
    if (!app.data.logs) {
      app.data.logs = [];
    }

    qlog(`[qqBot] 初始化后端... AppId: ${app.id}`, "conn");

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
      qlog(`[qqBot] 初始化失败: ${err.message}`, "error");
    }
  },

  /**
   * 启动 WS/API 连接
   */
  async startConnections(app, appManager) {
    const cfg = app.data.config;

    // 只要配置了 wsUrl 就启动常驻连接，网络层始终在线保活，真正开关由消息处理层拦截
    if (cfg["3rd_qqRobotLocal_wsUrl"]) {
      await onebot.stop();
      await onebot.start(cfg["3rd_qqRobotLocal_wsUrl"]);
    }


    // 启动官方机器人 API
    if (cfg["3rd_qqRobot_switch"] && official?.init) {
      official.init(
        cfg["3rd_qqRobot_appid"],
        cfg["3rd_qqRobot_secret"],
        cfg["3rd_qqRobot_token"]
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
              qlog(`[qqBot] ${msg}`, "error");
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
          不要使用俏皮的语气说话，不要使用颜文字和字符表情
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
            qlog(`[qqBot] 群 ${group.name}(${group.groupid}) 智能体已创建 (listId:${group.listId})`, "conn");
          } else {
            qlog(`[qqBot] 群 ${group.name} 创建失败: ${result.msg}`, "error");
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
      qlog(`[qqBot] 子智能体初始化失败: ${err.message}`, "error");
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
        return {
          ok: true,
          msg: "获取配置成功",
          data: app.data.config,
          pulseMeta,
          pulseGroups
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
            officialConfigured: !!(cfg["3rd_qqRobot_appid"] && cfg["3rd_qqRobot_secret"] && cfg["3rd_qqRobot_token"]),
            officialAppId: cfg["3rd_qqRobot_appid"] || ""
          }
        };
      }

      if (action === "setPower") {
        const on = !!args?.on;
        app.data.config = {
          ...app.data.config,
          "3rd_qqRobot_switch": on,
          "3rd_qqRobotLocal_switch": on
        };
        io.emit("app:dispatch", {
          appId: app.id,
          action: "updateConfig",
          args: { config: app.data.config }
        });

        projectManager.markDirty();

        if (on) {
          await this.startConnections(app, appManager);
          await this.initSubAgents(app, appManager);
        }

        qlog(`[qqBot] 机器人已${on ? "启动" : "停止"}`, "conn");
        return { ok: true, msg: on ? "机器人已启动" : "机器人已停止" };
      }

      if (action === "getLogs") {
        return { ok: true, msg: "获取日志成功", data: getLogs(args?.sinceId) };
      }

      if (action === "clearLogs") {
        clearLogs();
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
        qlog("[qqBot] 社交脉冲参数已恢复默认", "conn");
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

        qlog("[qqBot] 配置已更新", "conn");

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
      qlog(`[qqBot] dispatch 错误: ${err.message}`, "error");
      return { ok: false, msg: err.message };
    }
  },

  /**
   * 销毁：App 关闭时执行
   */
  async destroy(app, appManager) {
    if (onebot?.stop) onebot.stop();
    qlog("[qqBot] 后端已停机", "conn");
    this.app = null;
  }
};
