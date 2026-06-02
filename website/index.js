// website/index.js

// 全局中英文文本对照大字典 (按 README.md 原生脉络对齐)
const webDict = {
  zh: {
    // 导航栏
    "nav/website": "喵宅苑",
    "nav/features": "设计与痛点",
    "nav/models": "模型接入",
    "nav/gallery": "机能图谱",
    "nav/license": "授权 FAQ",
    "nav/github": "GitHub 源码",

    // 视口区
    "hero/tag": "ฅ^•ﻌ•^ฅ 你的二次元 AI 协同终端",
    "hero/title": "写代码，<br>怎么能少了<span>二次元</span>？",
    "hero/desc": "<b>宅喵终端 (owo_terminal)</b> 是一个融合了 1:1 二次元透明立绘微交互、Reasoning 深度思考折叠展现与任务树进度追踪的 AI 协同终端。我们用影子时光机为您提供物理级的版本快照恢复，让每一次重构都充满温情与安全感。",
    "hero/action/download": "立即下载",
    "hero/action/more": "阅读设计初衷",

    // 交互模拟
    "sim/title": "交互动作模拟：",
    "sim/restore": "⏳ 模拟 PTY 时光机还原",
    "sim/rpg": "⚔️ 开启内置文字RPG事件",
    "sim/pout": "💬 捏脸/调戏内置角色",

    // 痛点与诞生初衷
    "intro/title": "为什么设计 <span>宅喵终端</span>？",
    "intro/p1": "一直以来，作者尝试了市面上的很多 AI IDE 软件（如 Trae、codeX、antigravity 等），但都不能完全满意。我们渴望的不仅仅是一个冰冷的代码输出文本框，而是一个充满陪伴温度、有形象、有表情、有动作的二次元协同伴侣。",
    "intro/p2": "更重要的是，在 AI 时代，我们**必须拥有一个自己能够完全掌控所有通信交互流程的 AI 终端程序**。因此，宅喵终端应运而生！",

    // 架构与设计语言
    "arch/title": "经典蓝白美学 与 <span>盲盒架构</span>",
    "arch/p1": "<b>设计语言</b>：宅喵终端继承了 <a href=\"https://www.iw-i.com\" target=\"_blank\">喵宅苑</a> 标志性的清爽淡蓝发光设计风格，UI 骨架极其简洁明朗，专为追求品质感的极客开发者定制。",
    "arch/p2": "<b>系统核心 + App 盲盒架构</b>：软件拆分为两大层次：",
    "arch/core/title": "⚙️ 系统核心 (Core)",
    "arch/core/desc": "由作者本人精雕细琢，核心的每一行逻辑、通信协议与拦截机制都绝对安全可控，确保底层的稳固。",
    "arch/app/title": "🎁 盲盒应用 (App System)",
    "arch/app/desc": "具体的扩展应用 (如编辑器、时光机、资源管理器) 全权交由 AI 编写及审查。作者不干预细节，人机互补，释放 AI 自治生产力。",

    // 接入模型指南
    "models/title": "快速创建与 <span>接入大模型</span>",
    "models/desc": "本软件为纯本地运行，本身不提供任何云端大模型服务，用户需自己寻找兼容 OpenAI 接口地址的服务商进行一键接入：",
    "models/list/ollama": "本地大模型运行框架。无需 API Key，完全免费且支持断网离线使用，是宅喵终端强力推荐的真·隐私伴侣。",
    "models/list/deepseek": "高性价比的明星模型。其 Reasoning 思考过程回传有专门的完美 UI 折叠渲染适配。",
    "models/list/openai": "行业风向标，提供 GPT-4o、o1/o3 等顶级模型，支持前缀缓存与原生工具调用 (Function Calling)。",
    "models/list/anthropic": "提供 Claude 3.5 Sonnet 等公认代码能力最顶级的模型，多轮连续重构体验佳。",
    "models/list/siliconflow": "国内优秀的模型 API 聚合与托管平台，提供了极速且低成本的 DeepSeek/Qwen 托管服务。",
    "models/setup/title": "🛠️ 接入大模型只需 3 步",
    "models/setup/step1": "获取服务商官网的 <span class=\"code-inline\">apiKey</span>、<span class=\"code-inline\">Base URL</span> (与 OpenAI 兼容) 以及 <span class=\"code-inline\">模型ID</span>。",
    "models/setup/step2": "打开设置面板 -> 「人工智能」 -> 「添加新模型」。",
    "models/setup/step3": "输入相应配置保存即可（模型别名可以任意取，但不能重名）。",

    // 画廊区说明
    "gallery/title": "核心机能 <span>实机图谱</span>",
    "gallery/desc": "点击分类查看宅喵在各场景下的真实工作状态，支持点击放大预览高清细节",
    "gallery/tab/0": "🎭 交互界面",
    "gallery/tab/1": "🔒 终端与安全",
    "gallery/tab/2": "⏳ 时光机快照",
    "gallery/tab/3": "⚡ 缓存与游戏",

    // 画廊卡片标题与详细文案
    "gallery/item/preview/title": "经典蓝白双栏主界面",
    "gallery/item/preview/desc": "清爽的浅蓝色发光边框 UI，搭配精致的二次元透明抠像角色视频。角色首尾帧平滑拼接，待机呼吸极其自然，写代码时伙伴会根据 AI 执行状态做出实时表情回馈，提供满满的治愈感。",
    "gallery/item/lang/title": "全局多语言切换",
    "gallery/item/lang/desc": "软件内置完美的 i18n 国际化字典包，支持一键在简体中文与英文之间瞬间切换，包含所有的菜单、配置字段、FAQ 以及工具说明，完全满足全球化无缝开发需求。",
    
    "gallery/item/term_ask/title": "node-pty 安全确认拦截",
    "gallery/item/term_ask/desc": "集成真实的 xterm.js 命令行终端。当 AI 试图执行写命令时，系统核心会强制触发安全确认弹窗，并要求 AI 附带解释。支持人工修改参数、拒绝或补充说明驳回，绝不静默运行。",
    "gallery/item/term_reply/title": "真实命令行返回",
    "gallery/item/term_reply/desc": "AI 执行的所有命令结果将 100% 实时反馈在终端流中。注意：软件内部没有使用虚拟沙盒环境，一切命令均执行在你的真实电脑上，请特别警惕删除文件等高危命令，建议由人工手动处理。",

    "gallery/item/tm1/title": "时光机文件级备份 (.owoTimeMachine)",
    "gallery/item/tm1/desc": "选定工作目录后强制开启影子快照备份。备份文件隔离存放于隐藏的 <span class=\"code-inline\">.owoTimeMachine</span> 下。系统会自动将该目录追加到项目的 <span class=\"code-inline\">.gitignore</span> 中，与项目已有的 Git 仓库完全互不干扰、相得益彰。",
    "gallery/item/tm2/title": "可视化差异比对与拖拽还原",
    "gallery/item/tm2/desc": "支持时间线点查。你可以在时间机器 App 中将历史 commit 节点下的某一个文件直接拖出并覆盖到资源管理器 App 中。系统会挨个弹窗询问是要覆盖还是跳过，实现极具物理感的文件级精确还原。",

    "gallery/item/undo/title": "前缀缓存 (Prefix Caching) 节约资费",
    "gallery/item/undo/desc": "大模型处理长对话通常依赖前缀缓存。传统的整段撤回容易导致缓存穿透，白白浪费 API 资费。我们强烈提倡使用【撤到本条】功能，这只会清除尾部局部会话，保住头部缓存，极速且省钱。",
    "gallery/item/rpg/title": "内置盲盒文字 RPG 游戏 App",
    "gallery/item/rpg/desc": "工作累了？随时可以使用内置的小型 RPG 游戏 App。大模型会化身地城领主自主设计森林、城堡等游戏场景，并生成各种带交互选项的剧情分支，让你在终端里就能与伙伴开启妙趣横生的剧情互动。",

    // 授权条款与 FAQ
    "faq/title": "授权协议 与 <span>常见疑问</span>",
    "faq/q1": "它的授权协议是怎样的？我能免费修改代码吗？",
    "faq/a1": "本项目使用自定义的 <b>“非商业、源码可见”</b> 授权协议：<br><strong style=\"color: #62ba46\">[ 可以这样做 ]</strong> 免费个人学习、学术研究、与好友共同体验调试、自由二开并发布修改版源码。<br><strong style=\"color: #ff6159\">[ 绝不可以 ]</strong> 未经授权作为商业产品售卖牟利，或者删除及隐藏原有著作权声明。详情请参阅 LICENSE.md。",
    "faq/q2": "时光机影子备份是否会污染我已有的 Git 库？",
    "faq/a2": "完全不会。时光机影子工作区拥有自己完全隔离的 Git 控制库（位于 <span class=\"code-inline\">.owoTimeMachine/</span> 隐藏文件夹下）。主系统会自动将该文件夹写入项目 <span class=\"code-inline\">.gitignore</span> 中，保证两者互不干扰。",

    // 页脚
    "foot/website": "喵宅苑官网",
    "foot/repo": "GitHub 仓库",
    "foot/license": "授权条款",
    "foot/copy": "© 2026 owo_terminal. 由 0ui0 & 米卡卡 (AI Partner) 联合呈献 ฅ^•ﻌ•^ฅ"
  },
  en: {
    // Navigation
    "nav/website": "Miao Zhai Yuan",
    "nav/features": "Design & Focus",
    "nav/models": "Models",
    "nav/gallery": "Showcase",
    "nav/license": "License FAQ",
    "nav/github": "GitHub Source",

    // Hero Area
    "hero/tag": "ฅ^•ﻌ•^ฅ Your Anime AI Co-programming Terminal",
    "hero/title": "Coding? <br>How Can You Miss <span>Anime</span>?",
    "hero/desc": "<b>OwO Terminal (owo_terminal)</b> rejects cold and boring IDE interactions. We blend 1:1 anime transparent avatar micro-interactions, reasoning streams, and hierarchical task progress tracking into a gorgeous classic blue-white terminal, guarded by owoTimeMachine to keep every refactoring secure and warm.",
    "hero/action/download": "Download Now",
    "hero/action/more": "Read Design Intention",

    // Simulation
    "sim/title": "Simulation Actions:",
    "sim/restore": "⏳ Restore TimeMachine",
    "sim/rpg": "⚔️ Start RPG Adventure",
    "sim/pout": "💬 Tickle Built-in Partner",

    // Painpoints
    "intro/title": "Why Designing <span>OwO Terminal</span>?",
    "intro/p1": "For a long time, the author tried mainstream AI IDEs like Trae, codeX, and antigravity, but none were fully satisfying. We expect more than a cold text output box—we crave a warm companion with a visual presence, facial expressions, and dynamic animations.",
    "intro/p2": "More importantly, in the AI era, we **must possess an AI terminal program where we can fully control all communication and interaction flows**. Hence, OwO Terminal was born!",

    // Architecture
    "arch/title": "Classic Blue-White Aesthetics & <span>Sandbox Apps</span>",
    "arch/p1": "<b>Design Language</b>: OwO Terminal inherits the iconic pale-blue glowing style of <a href=\"https://www.iw-i.com\" target=\"_blank\">Miao Zhai Yuan</a>. The UI framework is clear and minimal, tailored for quality-oriented developers.",
    "arch/p2": "<b>Core + Sandboxed App Architecture</b>: The software is split into two robust layers:",
    "arch/core/title": "⚙️ Core Engine (System Core)",
    "arch/core/desc": "Hand-crafted by the author. Every line of logic, protocol, and interception is 100% secure and under absolute control.",
    "arch/app/title": "🎁 Sandboxed Apps (App System)",
    "arch/app/desc": "Extended apps (like editors, time machines, explorers) are written and reviewed by AI. Author stays away from details, maximizing AI productivity.",

    // Models
    "models/title": "Quick Start & <span>LLM Configuration</span>",
    "models/desc": "This software runs entirely locally. It does not provide any remote model API services. You need to connect to OpenAI-compatible API providers:",
    "models/list/ollama": "Local LLM runner. No API keys required, free, runs offline. Highly recommended as a true privacy co-pilot.",
    "models/list/deepseek": "Star model with ultimate cost efficiency. Its Reasoning stream is perfectly formatted with collapse UI rendering.",
    "models/list/openai": "Industry leader offering GPT-4o, o1/o3. Native support for Prefix Caching and Tool Callings.",
    "models/list/anthropic": "State-of-the-art programming intelligence (Claude 3.5 Sonnet). Perfect for heavy multi-file refactoring.",
    "models/list/siliconflow": "Premier Chinese inference hosting, delivering super fast DeepSeek/Qwen APIs at extremely low costs.",
    "models/setup/title": "🛠️ Setup LLM in 3 Steps",
    "models/setup/step1": "Obtain <span class=\"code-inline\">apiKey</span>, OpenAI-compatible <span class=\"code-inline\">Base URL</span>, and <span class=\"code-inline\">Model Name</span> from your provider.",
    "models/setup/step2": "Open Settings Panel -> 'AI' -> 'Add Model'.",
    "models/setup/step3": "Input configurations and save (Alias must be unique).",

    // Gallery
    "gallery/title": "Core Features <span>Visual Showcase</span>",
    "gallery/desc": "Click tabs below to see actual screenshots of the built-in partner in different workflows. Click to expand.",
    "gallery/tab/0": "🎭 Interface",
    "gallery/tab/1": "🔒 Terminal",
    "gallery/tab/2": "⏳ TimeMachine",
    "gallery/tab/3": "⚡ Caching & RPG",

    // Gallery Cards
    "gallery/item/preview/title": "Classic Blue-White Double Column Layout",
    "gallery/item/preview/desc": "Vibrant pale-blue glowing borders with high-definition transparent anime avatar videos. Loop animations are seamlessly stitched for a natural breathing idle. The partner reacts with real-time expressions to AI progress, offering a warm and healing workspace.",
    "gallery/item/lang/title": "Global Localization Switch",
    "gallery/item/lang/desc": "Full i18n localization support. Switch instantly between Simplified Chinese and English. All menus, config labels, FAQs, and system call docs are fully translated to suit global developers.",
    
    "gallery/item/term_ask/title": "node-pty Secure Interception",
    "gallery/item/term_ask/desc": "Integrated with authentic xterm.js terminal. Before the AI runs write commands, the Core prompts a safety dialog with AI explanation. Developers can edit, approve, or reject. Never runs silently.",
    "gallery/item/term_reply/title": "Real Terminal Output",
    "gallery/item/term_reply/desc": "All execution results print directly onto the xterm layout. Note: Commands run on your real computer without virtual boxes. Be extremely careful with destructive operations like file deletion.",

    "gallery/item/tm1/title": "File-Level Backup (.owoTimeMachine)",
    "gallery/item/tm1/desc": "Selecting workspace path triggers automatic shadow snapshots. Backups are isolated under a hidden <span class=\"code-inline\">.owoTimeMachine</span> folder, which is auto-appended to <span class=\"code-inline\">.gitignore</span>, keeping your project Git clean.",
    "gallery/item/tm2/title": "Visual Diff & Drag-to-Restore",
    "gallery/item/tm2/desc": "Supports timeline point checking. Drag any historical version of a file directly from the TimeMachine timeline into Explorer App. The system asks to overwrite or skip for precise restoration.",

    "gallery/item/undo/title": "Prefix Caching Optimization",
    "gallery/item/undo/desc": "Frontier models rely on Prefix Caching. Standard history rewind breaks cache entirely, leading to massive API bills. We advocate 'Rewind Here', clearing only tail sessions to keep cache intact and save token fees.",
    "gallery/item/rpg/title": "Built-in Text RPG Game App",
    "gallery/item/rpg/desc": "Tired of refactoring? Launch the built-in RPG app. The LLM acts as a dungeon master, generating scenario settings like forests or dungeons, and offering multiple interaction branches right inside your terminal.",

    // FAQ & License
    "faq/title": "License Terms & <span>FAQs</span>",
    "faq/q1": "What is the license? Can I modify code for free?",
    "faq/a1": "This project is distributed under a custom <b>'source-available, non-commercial'</b> license:<br><strong style=\"color: #62ba46\">[ ALLOWED ]</strong> Free personal study, academic research, debugging with friends, and sharing modified forks.<br><strong style=\"color: #ff6159\">[ FORBIDDEN ]</strong> Commercial redistribution, white-labeling, or removing original copyrights.",
    "faq/q2": "Will the shadow time machine mess up my workspace Git repository?",
    "faq/a2": "Absolutely not. owoTimeMachine maintains its Git database under an isolated <span class=\"code-inline\">.owoTimeMachine/</span> hidden folder. The engine appends this folder to <span class=\"code-inline\">.gitignore</span> to keep them separate.",

    // Footer
    "foot/website": "Miao Zhai Yuan",
    "foot/repo": "GitHub Repo",
    "foot/license": "License",
    "foot/copy": "© 2026 owo_terminal. Co-presented by 0ui0 & Mikaka (AI Partner) ฅ^•ﻌ•^ฅ"
  }
};

// 当前选中的语言 ('zh' 或 'en')
let currentLang = 'zh';

document.addEventListener('DOMContentLoaded', () => {
  // 从 localStorage 恢复语言偏好
  try {
    const savedLang = localStorage.getItem('owo_web_language');
    if (savedLang && (savedLang === 'zh' || savedLang === 'en')) {
      currentLang = savedLang;
    }
  } catch (e) {
    console.warn("Failed to load language from localStorage:", e);
  }
  applyLanguage(currentLang);

  // 1. 移动端导航菜单展开折叠
  const hamburger = document.getElementById('hamburger-menu');
  const navLinks = document.getElementById('nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
  }

  // 2. 监听并启动 Iframe 自适应缩放
  window.addEventListener('resize', resizeSimulator);
  window.addEventListener('load', resizeSimulator);
  
  // 延迟多次执行，保证在 DOM 渲染与字体加载完毕后计算出最精确的自适应比例
  setTimeout(resizeSimulator, 100);
  setTimeout(resizeSimulator, 500);
});

// 切换语言方法
window.toggleLanguage = function() {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  applyLanguage(currentLang);
}

// 翻译页面所有挂载了 data-trs 属性的 DOM 节点
function applyLanguage(lang) {
  document.querySelectorAll('[data-trs]').forEach(el => {
    const key = el.getAttribute('data-trs');
    const text = webDict[lang][key];
    if (text) {
      // 检查是否包含 HTML 标签，或者原本包含子元素
      if (text.includes('<') || el.children.length > 0 || el.getAttribute('data-html') === 'true') {
        el.innerHTML = text;
      } else {
        el.textContent = text;
      }
    }
  });

  // 更新语言切换按钮文本
  const langBtn = document.querySelector('.nav-lang-btn');
  if (langBtn) {
    langBtn.textContent = lang === 'zh' ? '🇺🇸 English' : '🇨🇳 简体中文';
  }

  // 同步通知 Iframe 里的 Mock API 修改 options.global_language
  const iframe = document.getElementById('sim-iframe');
  if (iframe && iframe.contentWindow && iframe.contentWindow.localStorage) {
    try {
      // 通过 localStorage 的跨 window 偏好来传递
      const savedOpts = iframe.contentWindow.localStorage.getItem('owo_mock_options');
      let opts = savedOpts ? JSON.parse(savedOpts) : {};
      opts.global_language = lang;
      iframe.contentWindow.localStorage.setItem('owo_mock_options', JSON.stringify(opts));
      
      // 让 iframe 触发 options 重新读取和重绘
      if (iframe.contentWindow.settingData && iframe.contentWindow.settingData.options) {
        iframe.contentWindow.settingData.options.pull().then(() => {
          if (iframe.contentWindow.m) {
            iframe.contentWindow.m.redraw();
          }
        });
      }
    } catch (e) {
      console.warn("Failed to sync language preference to iframe simulator:", e);
    }
  }

  // 持久化保存
  try {
    localStorage.setItem('owo_web_language', lang);
  } catch (e) {
    console.warn("Failed to save language to localStorage:", e);
  }
}

// FAQ 折叠展示控制
window.toggleFaq = function(header) {
  const item = header.parentElement;
  const active = item.classList.contains('active');
  document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('active'));
  if (!active) item.classList.add('active');
}

// 模拟器桥接 - 触发 Iframe 内的 Mock 交互动作 (1:1 动态修改 Mithril 数据)
window.triggerSimAction = function(action) {
  const iframe = document.getElementById('sim-iframe');
  if (!iframe || !iframe.contentWindow) return;
  
  const mockSocket = iframe.contentWindow.mockSocket;
  const comData = iframe.contentWindow.comData;
  const chatData = iframe.contentWindow.chatData;

  function changePlayFace(faceName) {
    if (comData && comData.data) {
      comData.data.edit(d => {
        d.playFaces.current = faceName;
      });
    }
  }

  if (action === 'restore') {
    const inputField = iframe.contentWindow.document.querySelector('.sim-real-input');
    if (inputField) inputField.value = "npx owo-timemachine restore a.js";
    changePlayFace('脸色一暗愤怒不爽');
    const popup = iframe.contentWindow.document.getElementById('time-popup');
    if (popup) popup.style.display = "block";
  } 
  else if (action === 'rpg') {
    if (mockSocket && chatData) {
      const userContent = '/play rpg_forest';
      const aiThinking = currentLang === 'zh' ? '正在拉取 RPG-App 游戏引擎...\n构建场景数据：迷雾森林...' : 'Pulling RPG-App game engine...\nConstructing scenario: Mist Forest...';
      const aiContent = currentLang === 'zh' 
        ? '【🌲 迷雾之森 🌲】\n你正站在一条布满青苔的古老森林分岔口，左边能听到水声，右侧长着散发荧光的魔能晶石。\n内建助手坐在你头上打了个哈欠：“切，啦沐达，你这笨蛋，赶紧随便选个方向，本大爷可不怕黑！”\n\n*(演示模式下暂无事件交互，可在实际 App 内部体验完整 RPG 事件流程喵！)*'
        : '【🌲 Mist Forest 🌲】\nWe stand before an ancient moss-covered bifurcation. Stream sounds echo from the left, while glowing mana crystals illuminate the right.\nThe partner yawns on your head: "Huh, Lamuda, you coward! Just pick a path already. I ain\'t afraid of the dark!"\n\n*(Unavailable in demo mode. Try the complete RPG adventure app inside the real app!)*';

      chatData.list.push({
        uuid: 'user_rpg_' + Date.now(),
        group: 'user',
        name: currentLang === 'zh' ? '用户' : 'User',
        content: userContent,
        timestamp: Date.now()
      });
      changePlayFace('傲娇坏笑');

      setTimeout(() => {
        chatData.list.push({
          uuid: 'ai_rpg_' + Date.now(),
          group: 'ai',
          name: 'deepseek-v4-flash',
          thinking: aiThinking,
          content: aiContent,
          timestamp: Date.now()
        });
        iframe.contentWindow.m.redraw();
      }, 1000);
      iframe.contentWindow.m.redraw();
    }
  } 
  else if (action === 'pout') {
    if (mockSocket && chatData) {
      const userContent = currentLang === 'zh' ? '捏捏猫耳助手的耳朵' : 'Pinch the cat ears';
      const aiThinking = currentLang === 'zh' ? '警告！检测到啦沐达的变态行为！\n加载防御词汇...' : 'WARNING! Perverted behavior detected from Lamuda!\nLoading defense vocabulary...';
      const aiContent = currentLang === 'zh'
        ? '啊啊啊！啦沐达你个大变态！手拿开啦！\n都说了别碰我的猫耳朵！再捏我真的要在终端里跑 `rm -rf /` 了哦！哼！'
        : 'Aaah! Lamuda, you huge pervert! Get your hands off me!\nI told you not to touch my cat ears! If you do it again, I will literally run `rm -rf /` in your terminal! Humpf!';

      chatData.list.push({
        uuid: 'user_tease_' + Date.now(),
        group: 'user',
        name: currentLang === 'zh' ? '用户' : 'User',
        content: userContent,
        timestamp: Date.now()
      });
      changePlayFace('脸色一暗愤怒不爽');

      setTimeout(() => {
        chatData.list.push({
          uuid: 'ai_tease_' + Date.now(),
          group: 'ai',
          name: 'deepseek-v4-flash',
          thinking: aiThinking,
          content: aiContent,
          timestamp: Date.now()
        });
        iframe.contentWindow.m.redraw();
      }, 1000);
      iframe.contentWindow.m.redraw();
    }
  }
}

// 模拟器 Iframe 缩放，基于 1200x780 虚拟像素等比自适应
function resizeSimulator() {
  const container = document.querySelector('.sim-iframe-container');
  const iframe = document.getElementById('sim-iframe');
  const wrapper = document.querySelector('.simulator-wrapper');
  if (!container || !iframe || !wrapper) return;

  const containerWidth = container.clientWidth;
  const virtualWidth = 1200;
  const virtualHeight = 780;

  const scale = containerWidth / virtualWidth;

  iframe.style.width = virtualWidth + 'px';
  iframe.style.height = virtualHeight + 'px';
  iframe.style.transform = `scale(${scale})`;

  container.style.height = (virtualHeight * scale) + 'px';
  wrapper.style.height = (virtualHeight * scale) + 'px';
}

// 切换系统图谱画廊的 Tab 页
window.switchGalleryTab = function(tabIndex) {
  // 1. 更新 Tab 按钮激活状态
  const tabBtns = document.querySelectorAll('.gallery-tab-btn');
  tabBtns.forEach((btn, idx) => {
    if (idx === tabIndex) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 2. 更新面板内容的显示与切换动画
  const panes = document.querySelectorAll('.gallery-pane');
  panes.forEach((pane, idx) => {
    if (idx === tabIndex) {
      pane.style.display = 'block';
      setTimeout(() => {
        pane.classList.add('active');
      }, 10);
    } else {
      pane.classList.remove('active');
      pane.style.display = 'none';
    }
  });
}

// 打开高清截图大图预览灯箱
window.openLightbox = function(src) {
  const modal = document.getElementById('lightbox-modal');
  const targetImg = document.getElementById('lightbox-target-img');
  if (modal && targetImg) {
    targetImg.src = src;
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  }
}

// 关闭大图预览灯箱
window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}
