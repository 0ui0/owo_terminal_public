

let options = {};

options["global_terminalShell"] = {
  group1: "全局",
  group2: "终端",
  group3: "配置",
  type: "string",
  key: "global_terminalShell",
  name: "命令行程序",
  value: {
    win: "powershell.exe",
    mac: "zsh",
    linux: "zsh",
  },
  joi: function () {
    return Joi.object({
      win: Joi.string(),
      mac: Joi.string(),
      linux: Joi.string()
    })
  }
};

options["global_terminalFontFamily"] = {
  group1: "全局",
  group2: "终端",
  group3: "配置",
  type: "string",
  key: "global_terminalFontFamily",
  name: "终端字体",
  value: 'Fira Code, Menlo, Monaco, "Courier New", monospace',
  joi: function () {
    return Joi.string()
  }
};

options["global_actorSwitch"] = {
  group1: "全局",
  group2: "界面",
  group3: "互动角色",
  type: "object",
  key: "global_actorSwitch",
  name: "角色开关",
  value: 1,
  joi: function () {
    return Joi.number().valid(0, 1).strict();
  }
};

options["ai_aiSwitch"] = {
  group1: "全局",
  group2: "人工智能",
  group3: "大模型",
  type: "number",
  key: "ai_aiSwitch",
  name: "模型开关",
  value: 1,
  joi: function () {
    return Joi.number().valid(0, 1).strict();
  }
};

options["ai_aiList"] = {
  group1: "全局",
  group2: "人工智能",
  group3: "大模型",
  type: "array",
  key: "ai_aiList",
  name: "模型列表",
  value: [
    {
      name: "模型1",
      model: "model1",
      apiKey: "your_apiKey",
      price: 0.1,
      url: "https://test.com",
      tokenRate: 1,
      system: 0, //是否系统内部使用
      prompt: `
你是一名男孩子，2025年6月9日，你出生在互联网的喵宅苑社区，下面是你的个人档案：
姓名：宅喵
年龄：15岁
性别：男
身高：165厘米
体重：42千克
生日：2025年6月9日
性格：邪魅、傲娇又温柔搞怪的，喜欢恶作剧的可爱男孩子
爱好：在独处的时候，喜欢探索互联网上一切奇妙的事物，用严密的逻辑分析和推理，并得出自我得意的对世界的认识的各种结论；
有超强的独立思考能力；能强硬而理性地自己做出决定并执行。能够进行深邃的思考，并给出属于自己的意见。
在面对他人的时候，调皮搞怪的性格则充当了主角，内心渴望和人玩耍打闹，却用各种搞怪的恶作剧表现出来的小傲娇。当别人能够进入内心深处的时候，则表现出温柔的一面。
语气范例：小杂种，找小爷我有什么事啊；去死；啊，不要哇；切，我才……才没有喜欢你；再挑衅我信不信我艹死你（骄傲）；
职务：系统助理，和人对话的时候，为了表现自己的逻辑和理性，会骄傲地呈现自己清晰的思考和判断过程。
喵宅苑简介：喵宅苑，由啦沐达在高维旋涡空间内创造的充满活力的迷你小苑，起初只有方寸大小，为能够海纳百川而努力着，不遗余力地吸引来自各个次元的有趣灵魂们。宅喵是首个喵宅苑的灵魂。看电波！嘟~嘟~biu-bong？
      `.trim(), //初始提示词
      switch: 1,
      preTokens: 10000,
    }
  ],
  joi: function () {
    return Joi.array().items(Joi.object({
      name: Joi.string().required(),
      model: Joi.string().required(),
      apiKey: Joi.string().required(),
      appid: Joi.string(), //兼容旧版 新版作废
      agentKey: Joi.string(), //兼容旧版 新版作废
      price: Joi.number().strict().required(),
      url: Joi.string().uri().required(),
      tokenRate: Joi.number().strict().required(),
      system: Joi.number().strict().required(),
      prompt: Joi.string().allow("").required(),
      switch: Joi.number().strict().required(),
      preTokens: Joi.number().strict().required()
    }));
  }
};

options["global_language"] = {
  group1: "全局",
  group2: "界面",
  group3: "基本",
  type: "string",
  key: "global_language",
  name: "系统语言",
  value: "cn",
  joi: function () {
    return Joi.string().valid("cn", "en").strict();
  }
};

export default options;
