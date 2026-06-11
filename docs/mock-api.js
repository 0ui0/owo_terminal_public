// website/mock-api.js

(function() {
  console.log("[Mock API] Initializing fetch & XHR interceptors for owo_terminal static preview...");

  // 全局通用词典，保证静态端 i18n 正常工作，不报 i18n 错误，且支持中英文翻译切换
  const globalDict = {
    "通用/保存": { cn: "保存", en: "Save" },
    "通用/取消": { cn: "取消", en: "Cancel" },
    "通用/确认": { cn: "确认", en: "Confirm" },
    "通用/删除": { cn: "删除", en: "Delete" },
    "通用/返回": { cn: "返回", en: "Back" },
    "通用/全屏": { cn: "全屏", en: "Full Screen" },
    "通用/收起": { cn: "收起", en: "Collapse" },
    "通用/展开": { cn: "展开", en: "Expand" },
    "通用/折叠": { cn: "折叠", en: "Fold" },
    "通用/详情": { cn: "详情", en: "Detail" },
    "通用/确认删除": { cn: "确认删除", en: "Confirm Delete" },
    "菜单栏/分类/文件": { cn: "文件", en: "File" },
    "菜单栏/分类/编辑": { cn: "编辑", en: "Edit" },
    "菜单栏/分类/视图": { cn: "视图", en: "View" },
    "菜单栏/分类/开发": { cn: "开发", en: "Develop" },
    "菜单栏/操作/打开": { cn: "打开", en: "Open" },
    "菜单栏/操作/保存": { cn: "保存", en: "Save" },
    "菜单栏/操作/另存为": { cn: "另存为", en: "Save As..." },
    "菜单栏/操作/自动保存": { cn: "自动保存", en: "Auto Save" },
    "菜单栏/操作/退出": { cn: "退出", en: "Quit" },
    "菜单栏/操作/刷新": { cn: "刷新", en: "Reload" },
    "菜单栏/操作/调试工具": { cn: "开发者工具", en: "Developer Tools" },
    "菜单栏/操作/检查更新": { cn: "检查更新", en: "Check for Updates" },
    "菜单栏/编辑/撤销": { cn: "撤销", en: "Undo" },
    "菜单栏/编辑/重做": { cn: "重做", en: "Redo" },
    "菜单栏/编辑/剪切": { cn: "剪切", en: "Cut" },
    "菜单栏/编辑/复制": { cn: "复制", en: "Copy" },
    "菜单栏/编辑/粘贴": { cn: "粘贴", en: "Paste" },
    "菜单栏/编辑/粘贴样式": { cn: "粘贴并匹配样式", en: "Paste and Match Style" },
    "菜单栏/编辑/全选": { cn: "全选", en: "Select All" },
    "设置界面/分组/全局": { cn: "全局", en: "Global" },
    "设置界面/分组/终端": { cn: "终端", en: "Terminal" },
    "设置界面/分组/界面": { cn: "界面", en: "Interface" },
    "设置界面/分组/人工智能": { cn: "人工智能", en: "AI" },
    "设置界面/分组/其他": { cn: "其他", en: "Others" },
    "设置界面/分组/大模型": { cn: "大模型", en: "Models" },
    "设置界面/分组/互动角色": { cn: "互动角色", en: "Actor" },
    "设置界面/分组/基本": { cn: "基本", en: "Basic" },
    "设置界面/分组/通用": { cn: "通用", en: "General" },
    "设置界面/分组/配置": { cn: "配置", en: "Config" },
    "设置界面/字段/命令行程序": { cn: "命令行程序", en: "Shell Path" },
    "设置界面/字段/终端字体": { cn: "终端字体", en: "Terminal Font" },
    "设置界面/字段/角色开关": { cn: "角色开关", en: "Actor Switch" },
    "设置界面/字段/模型开关": { cn: "模型开关", en: "AI Switch" },
    "设置界面/字段/模型列表": { cn: "模型列表", en: "Model List" },
    "设置界面/字段/系统语言": { cn: "系统语言", en: "System Language" },
    "设置界面/模型列表/配置别名": { cn: "配置别名", en: "Alias" },
    "设置界面/模型列表/模型ID": { cn: "模型ID (Model Name)", en: "Model ID" },
    "设置界面/模型列表/APIKey": { cn: "API Key", en: "API Key" },
    "设置界面/模型列表/接口地址": { cn: "接口地址 (Base URL)", en: "Base URL" },
    "设置界面/模型列表/预设提示词": { cn: "预设提示词 (System Prompt)", en: "System Prompt" },
    "设置界面/模型列表/价格权重": { cn: "价格权重", en: "Price Weight" },
    "设置界面/模型列表/消耗倍率": { cn: "消耗倍率", en: "Token Rate" },
    "设置界面/模型列表/余额": { cn: "Token 余额", en: "Remaining Quota" },
    "设置界面/模型列表/启用状态": { cn: "启用状态", en: "Enabled" },
    "设置界面/模型列表/系统内置": { cn: "系统内置", en: "System Built-in" },
    "设置界面/模型列表/未命名": { cn: "未命名模型", en: "Unnamed Model" },
    "设置界面/模型列表/添加": { cn: "+ 添加新模型", en: "+ Add Model" },
    "设置界面/模型列表/导入成功": { cn: "成功导入模型", en: "Imported models successfully" },
    "聊天界面/标题/宅喵终端": { cn: "宅喵终端", en: "OwO Terminal" },
    "聊天界面/词汇/回复": { cn: "回复", en: "Reply" },
    "聊天界面/词汇/引用": { cn: "引用", en: "Quote" },
    "聊天界面/词汇/撤销": { cn: "撤销", en: "Undo" },
    "聊天界面/词汇/暂停": { cn: "暂停", en: "Pause" },
    "聊天界面/词汇/反馈": { cn: "反馈", en: "Feedback" },
    "聊天界面/词汇/应用": { cn: "应用", en: "Apps" },
    "聊天界面/词汇/工作目录": { cn: "工作目录", en: "Cwd" },
    "聊天界面/词汇/程序": { cn: "程序", en: "Program" },
    "导航栏/项目/喵终端": { cn: "喵终端", en: "OwO Terminal" },
    "导航栏/项目/设置": { cn: "设置", en: "Settings" },
    "导航栏/项目/AI选择": { cn: "AI选择", en: "AI Selection" },
    "导航栏/项目/浏览器": { cn: "浏览器", en: "Browser" },
    "导航栏/项目/编辑器": { cn: "编辑器", en: "Editor" },
    "导航栏/项目/文件管理器": { cn: "资源管理器", en: "Explorer" },
    "导航栏/项目/五子棋": { cn: "五子棋", en: "Gomoku" },
    "导航栏/项目/任务管理器": { cn: "任务管理器", en: "Task Manager" },
    "系统/状态/正在尝试连接": { cn: "正在尝试连接...", en: "Connecting..." },
    "系统/消息/载入成功": { cn: "载入成功", en: "Loaded Successfully" },
    "系统/消息/操作成功": { cn: "操作成功", en: "Success" }
  };

  // 从 localStorage 恢复配置
  let mockOptions = {
    global_themeColor: 2,
    global_actorSwitch: 1, // 1表示开启视频立绘模式
    global_actorMove: 1,
    global_actorName: "米卡卡",
    global_language: "cn"
  };

  let mockComData = {
    themeColor: 2, // 经典蓝白 Theme 2
    defaultPet: "default",
    faceAction: "smile",
    playFaces: {
      index: 0,
      list: ["待机状态"],
      current: ""
    },
    targetChatListId: 0,
    chatLists: [
      {
        id: 0,
        name: "会话_2026_首页体验.owo",
        tasks: [
          {
            taskid: "task_1",
            name: "1. 编写 1:1 网页主界面",
            status: "执行中",
            process: 75,
            subtasks: [
              { subtaskid: "sub_1", name: "1.1 复制原版立绘及WebM视频", status: "已完成", process: 100 },
              { subtaskid: "sub_2", name: "1.2 修复立绘遮挡并引入透明视频", status: "执行中", process: 75 },
              { subtaskid: "sub_3", name: "1.3 部署 website 静态归档", status: "规划中", process: 0 }
            ]
          }
        ],
        notes: [
          {
            id: "note_1",
            target: "index.html",
            memory: "使用真实的编译后前端 main.js，并在前端进行 API & WebSocket 级别的 Mock，达成绝对 1:1 的欺诈零容忍真实还原！",
            tasks: [],
            focus: []
          }
        ],
        graph: {
          nodes: {
            "node_1": { id: "node_1", label: "前端完全一致", content: "直接把编译完毕的main和资源复制过来引入，并辅以本地Mock，达成和真实软件的100%一致性。" }
          },
          links: []
        },
        data: [
          {
            uuid: "msg_user_1",
            group: "user",
            name: "用户",
            content: "你好哇，米卡卡！今天我们要重新给软件做个首页，帮我把原版 UI 在网页容器里 1:1 描绘一遍吧。",
            timestamp: 1780409418000,
            tid: "chat_ppc23"
          },
          {
            uuid: "msg_ai_1",
            group: "ai",
            name: "deepseek-v4-flash",
            thinking: "更新一下网点信息表示我上线了。  先查网点图状态，然后回复吧。",
            content: "切，这下看清楚了吧！小爷我已经把原版透明视频和布局彻底修复了！这才是真正的 1:1 经典蓝白（Theme 2）清爽界面，哼！\n\n为了保证 100% 的真实性，我甚至把软件真正的编译前端直接搬到了网页里运行，然后用本地脚本把后台网络接口给代理了。不许对我的智商发出质疑，笨蛋！",
            timestamp: 1780409420000,
            tid: "ask_ppc24"
          }
        ]
      }
    ]
  };

  try {
    const savedOpts = localStorage.getItem('owo_mock_options');
    if (savedOpts) {
      Object.assign(mockOptions, JSON.parse(savedOpts));
    }
    const savedCom = localStorage.getItem('owo_mock_comdata');
    if (savedCom) {
      Object.assign(mockComData, JSON.parse(savedCom));
    }
  } catch (e) {
    console.warn("Failed to load mock data from localStorage:", e);
  }

  // 统一的 fnCall 拦截处理器
  function handleCrossRequest(name, params) {
    console.log(`[Mock Cross Request]: name=${name}, params=`, params);

    if (name === "cmdOptions") {
      if (params && params.length > 0 && Array.isArray(params[0])) {
        const cleanData = params[0];
        cleanData.forEach(item => {
          if (item && item.key !== undefined) {
            mockOptions[item.key] = item.value;
          }
        });
        if (mockOptions.global_themeColor !== undefined) {
          mockComData.themeColor = Number(mockOptions.global_themeColor);
        }
        try {
          localStorage.setItem('owo_mock_options', JSON.stringify(mockOptions));
          localStorage.setItem('owo_mock_comdata', JSON.stringify(mockComData));
        } catch (e) {
          console.warn("Failed to save mock data to localStorage:", e);
        }
        const optArr = Object.entries(mockOptions).map(([key, val]) => ({ key, value: val }));
        return { ok: true, data: optArr };
      } else {
        const optArr = Object.entries(mockOptions).map(([key, val]) => ({ key, value: val }));
        return { ok: true, data: optArr };
      }
    }

    if (name === "getI18n") {
      return {
        ok: true,
        msg: "i18n 语言包已同步",
        dict: globalDict
      };
    }

    if (name === "petPkgList") {
      return { ok: true, data: [] };
    }

    if (name === "petPkgGetAvailableActions") {
      return { ok: true, data: [] };
    }

    return { ok: true, data: [] };
  }

  // 拦截 fetch
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init) {
    let url = typeof resource === 'string' ? resource : resource.url;
    console.log("[Mock Fetch Request]:", url);

    if (url.includes('/api/comData/get')) {
      return new Response(JSON.stringify({ ok: true, data: mockComData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.includes('/api/options/get') || url.includes('/api/options')) {
      const optArr = Object.entries(mockOptions).map(([key, val]) => ({ key, value: val }));
      return new Response(JSON.stringify({ ok: true, data: optArr }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.includes('/api/cross')) {
      try {
        const bodyText = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body);
        const { name, params } = JSON.parse(bodyText);
        const resData = handleCrossRequest(name, params);
        return new Response(JSON.stringify(resData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error("[Mock Fetch Cross Parsing Error]:", e);
      }
    }

    return originalFetch.apply(this, arguments);
  };

  // 拦截 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._method = method;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const self = this;
    console.log("[Mock XHR Request]:", self._url);

    if (self._url && self._url.includes('/api/comData/get')) {
      const responseData = { ok: true, data: mockComData };
      Object.defineProperty(self, 'status', { writable: true, value: 200 });
      Object.defineProperty(self, 'readyState', { writable: true, value: 4 });
      Object.defineProperty(self, 'responseText', {
        writable: true,
        value: JSON.stringify(responseData)
      });
      Object.defineProperty(self, 'response', {
        writable: true,
        value: responseData
      });
      if (self.onreadystatechange) {
        setTimeout(() => self.onreadystatechange({ target: self, currentTarget: self }), 0);
      }
      if (self.onload) {
        setTimeout(() => self.onload({ target: self, currentTarget: self }), 0);
      }
      return;
    }

    if (self._url && self._url.includes('/api/options/get')) {
      const optArr = Object.entries(mockOptions).map(([key, val]) => ({ key, value: val }));
      const responseData = { ok: true, data: optArr };
      Object.defineProperty(self, 'status', { writable: true, value: 200 });
      Object.defineProperty(self, 'readyState', { writable: true, value: 4 });
      Object.defineProperty(self, 'responseText', {
        writable: true,
        value: JSON.stringify(responseData)
      });
      Object.defineProperty(self, 'response', {
        writable: true,
        value: responseData
      });
      if (self.onreadystatechange) {
        setTimeout(() => self.onreadystatechange({ target: self, currentTarget: self }), 0);
      }
      if (self.onload) {
        setTimeout(() => self.onload({ target: self, currentTarget: self }), 0);
      }
      return;
    }

    if (self._url && self._url.includes('/api/cross')) {
      try {
        const { name, params } = JSON.parse(body);
        const responseData = handleCrossRequest(name, params);
        Object.defineProperty(self, 'status', { writable: true, value: 200 });
        Object.defineProperty(self, 'readyState', { writable: true, value: 4 });
        Object.defineProperty(self, 'responseText', {
          writable: true,
          value: JSON.stringify(responseData)
        });
        Object.defineProperty(self, 'response', {
          writable: true,
          value: responseData
        });
        if (self.onreadystatechange) {
          setTimeout(() => self.onreadystatechange({ target: self, currentTarget: self }), 0);
        }
        if (self.onload) {
          setTimeout(() => self.onload({ target: self, currentTarget: self }), 0);
        }
        return;
      } catch (e) {
        console.error("[Mock XHR Cross Parsing Error]:", e);
      }
    }

    return originalSend.apply(this, arguments);
  };

})();
