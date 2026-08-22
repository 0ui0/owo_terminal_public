export const AI_PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek (深度求索)",
    url: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-v4-pro",
    models: [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "deepseek-v4-flash-vision-exp",
      "deepseek-r1"
    ]
  },
  {
    id: "openai",
    name: "OpenAI",
    url: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-5.6-sol",
    models: [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "o4-mini",
      "o3",
      "gpt-4o"
    ]
  },
  {
    id: "gemini",
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-3.7-flash",
    models: [
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.1-pro",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash"
    ]
  },
  {
    id: "qwen",
    name: "阿里通义千问 (DashScope)",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyUrl: "https://dashscope.console.aliyun.com/",
    defaultModel: "qwen3.8-max",
    models: [
      "qwen3.8-max",
      "qwen3.7-plus",
      "qwen3.5-turbo",
      "qwen-vl-plus"
    ]
  },
  {
    id: "zhipu",
    name: "智谱清言 (GLM)",
    url: "https://open.bigmodel.cn/api/paas/v4",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    defaultModel: "glm-5.3",
    models: [
      "glm-5.3",
      "glm-5.2",
      "glm-5-turbo",
      "glm-5v-turbo"
    ]
  },
  {
    id: "kimi",
    name: "月之暗面 (Kimi / Moonshot)",
    url: "https://api.moonshot.cn/v1",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    defaultModel: "kimi-k3",
    models: [
      "kimi-k3",
      "kimi-k3-thinking",
      "kimi-k3-code"
    ]
  },
  {
    id: "stepfun",
    name: "阶跃星辰 (StepFun)",
    url: "https://api.stepfun.com/v1",
    keyUrl: "https://platform.stepfun.com/",
    defaultModel: "step-2-16k",
    models: [
      "step-2-16k",
      "step-2-mini",
      "step-1-flash",
      "step-1v-32k"
    ]
  },
  {
    id: "lingyi",
    name: "零一万物 (01.AI)",
    url: "https://api.lingyiwanwu.com/v1",
    keyUrl: "https://platform.lingyiwanwu.com/",
    defaultModel: "yi-lightning",
    models: [
      "yi-lightning",
      "yi-large",
      "yi-medium"
    ]
  },
  {
    id: "custom",
    name: "自定义厂商 (OpenAI 兼容)",
    url: "",
    keyUrl: "",
    defaultModel: "",
    models: []
  }
]
