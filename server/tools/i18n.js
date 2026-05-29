import options from "../config/options.js"

/**
 * i18n 国际化模块使用规范：
 * 
 * 1. 公共通用词汇（如"保存"、"取消"、"确认"等在多处复用的）：
 *    放入 globalDict，使用 trs("通用/保存") 调用
 * 
 * 2. 非公共的业务消息（仅在特定位置使用的提示信息）：
 *    直接在代码处使用内联翻译：trs("中文key，带分类", { cn: "中文消息", en: "English message" })
 *    这样可以在代码编辑处直接看到实际的提示文案
 * 
 * 示例：
 *   公共词汇：trs("通用/保存")
 *   业务消息：trs("错误/服务器内部错误", { cn: "服务器内部错误", en: "Internal Server Error" })
 */

// 全局通用词典，使用层级路径作为 Key: "分类/子分类/键名"
export const globalDict = {
  // 通用操作
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

  // 菜单栏 (Electron 原生及虚拟菜单)
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

  // 设置界面 - 分组 (对应 defaultOptions.js 中的 group1, group2, group3)
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

  // 设置界面 - 字段名
  "设置界面/字段/命令行程序": { cn: "命令行程序", en: "Shell Path" },
  "设置界面/字段/终端字体": { cn: "终端字体", en: "Terminal Font" },
  "设置界面/字段/角色开关": { cn: "角色开关", en: "Actor Switch" },
  "设置界面/字段/模型开关": { cn: "模型开关", en: "AI Switch" },
  "设置界面/字段/模型列表": { cn: "模型列表", en: "Model List" },
  "设置界面/字段/系统语言": { cn: "系统语言", en: "System Language" },

  // 模型列表内部字段
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

  // 聊天界面
  "聊天界面/标题/宅喵终端": { cn: "宅喵终端", en: "OwO Terminal" },
  "聊天界面/词汇/回复": { cn: "回复", en: "Reply" },
  "聊天界面/词汇/引用": { cn: "引用", en: "Quote" },
  "聊天界面/词汇/撤销": { cn: "撤销", en: "Undo" },
  "聊天界面/词汇/暂停": { cn: "暂停", en: "Pause" },
  "聊天界面/词汇/反馈": { cn: "反馈", en: "Feedback" },
  "聊天界面/词汇/应用": { cn: "应用", en: "Apps" },
  "聊天界面/词汇/工作目录": { cn: "工作目录", en: "Cwd" },
  "聊天界面/词汇/程序": { cn: "程序", en: "Program" },

  // 导航栏项目 (Dock 菜单)
  "导航栏/项目/喵终端": { cn: "喵终端", en: "OwO Terminal" },
  "导航栏/项目/设置": { cn: "设置", en: "Settings" },
  "导航栏/项目/AI选择": { cn: "AI选择", en: "AI Selection" },
  "导航栏/项目/浏览器": { cn: "浏览器", en: "Browser" },
  "导航栏/项目/编辑器": { cn: "编辑器", en: "Editor" },
  "导航栏/项目/文件管理器": { cn: "资源管理器", en: "Explorer" },
  "导航栏/项目/五子棋": { cn: "五子棋", en: "Gomoku" },
  "导航栏/项目/任务管理器": { cn: "任务管理器", en: "Task Manager" },

  // Ollama 相关
  "设置界面/Ollama/导入按钮": { cn: "从 Ollama 导入", en: "Import from Ollama" },
  "设置界面/Ollama/输入提示": { cn: "请输入 Ollama API 服务地址：", en: "Please enter Ollama API service URL:" },
  "设置界面/Ollama/端口提示": { cn: "默认端口为 11434", en: "Default port is 11434" },
  "设置界面/Ollama/查看帮助": { cn: "📖 如何使用 Ollama？", en: "📖 How to use Ollama?" },

  // 系统状态与通知
  "系统/状态/正在尝试连接": { cn: "正在尝试连接...", en: "Connecting..." },
  "系统/消息/载入成功": { cn: "载入成功", en: "Loaded Successfully" },
  "系统/消息/操作成功": { cn: "操作成功", en: "Success" },
  "系统/消息/导入失败": { cn: "导入失败", en: "Import Failed" },
  "系统/消息/更新就绪": { cn: "更新已就绪", en: "Update Ready" },
  "系统/消息/下载完成": { cn: "新版本已下载完成。是否现在重启应用以完成更新？", en: "New version downloaded. Restart now to update?" },
  "系统/提示/确认退出": { cn: "退出确认", en: "Quit Confirmation" },
  "系统/提示/未保存更改": { cn: "当前项目有未保存的更改，要在退出前保存吗？", en: "The current project has unsaved changes. Do you want to save before quitting?" },
  "系统/动作/保存并退出": { cn: "保存并退出", en: "Save and Quit" },
  "系统/动作/直接退出": { cn: "直接退出 (不保存)", en: "Quit (Don't Save)" },
  "系统/动作/现在重启": { cn: "现在重启", en: "Restart Now" },
  "系统/动作/稍后提醒": { cn: "稍后提醒", en: "Remind Me Later" },
  "系统/错误/提示": { cn: "发生错误: ", en: "Error: " },
  "系统/错误/启动失败": { cn: "启动失败", en: "Start Failed" },
  "系统/错误/端口占用": { cn: "端口被占用，无法启动服务。请检查是否已打开另一个实例。", en: "Port is in use. Unable to start server. Check if another instance is running." },

  // API 错误消息
  "API/错误/服务器内部错误": { cn: "服务器内部错误", en: "Internal Server Error" },
  "API/错误/找不到函数": { cn: "找不到函数", en: "Function not found" },
  "API/错误/函数执行错误": { cn: "函数执行错误", en: "Function execution error" },
  "API/消息/已发送停止信号": { cn: "已发送停止信号", en: "Stop signal sent" },

  // 系统更新
  "系统/更新/检查中": { cn: "正在检查更新...", en: "Checking for updates..." },
  "系统/更新/发现新版本": { cn: "发现新版本", en: "New version found" },
  "系统/更新/发现新版本提示": { cn: "发现新版本，正在自动下载...", en: "New version found, downloading automatically..." },
  "系统/更新/下载中": { cn: "正在下载...", en: "Downloading..." },
  "系统/更新/已是最新": { cn: "当前已是最新版本", en: "Already up to date" },
  "系统/更新/开发环境": { cn: "开发环境跳过检查", en: "Skipped in Dev Mode" },
  "系统/更新/开发环境标题": { cn: "开发环境", en: "Dev Environment" },
  "系统/更新/开发环境提示": { cn: "当前处于开发环境，已跳过更新检查。请打包后测试更新功能。", en: "Skipped update check in dev mode. Please package the app to test." },

  // crossFuncs 对话框
  "对话框/标题/保存文件": { cn: "保存文件", en: "Save File" },
  "对话框/标题/打开文件": { cn: "打开文件", en: "Open File" },
  "对话框/标题/保存项目": { cn: "保存项目", en: "Save Project" },
  "对话框/标题/打开项目": { cn: "打开项目", en: "Open Project" },
  "对话框/按钮/保存": { cn: "保存", en: "Save" },
  "对话框/按钮/打开": { cn: "打开", en: "Open" },
  "对话框/过滤器/全部文件": { cn: "全部文件", en: "All Files" },

  // crossFuncs 消息
  "crossFuncs/错误/缺少appId": { cn: "缺少 appId", en: "Missing appId" },
  "crossFuncs/消息/获取成功": { cn: "获取成功", en: "Retrieved successfully" },
  "crossFuncs/消息/更新成功": { cn: "更新成功", en: "Updated successfully" },
  "crossFuncs/消息/保存成功": { cn: "保存成功", en: "Saved successfully" },
  "crossFuncs/错误/配置表数据异常": { cn: "配置表数据异常", en: "Configuration data error" },
  "crossFuncs/错误/系统错误": { cn: "系统错误: ", en: "System error: " },
  "crossFuncs/错误/未知错误": { cn: "未知错误", en: "Unknown error" },

  // Ollama 模型导入
  "crossFuncs/Ollama/未找到模型": { cn: "未找到任何 Ollama 模型", en: "No Ollama models found" },
  "crossFuncs/模型/请传入模型名": { cn: "请传入模型名", en: "Please provide a model name" },
  "crossFuncs/模型/未找到选定模型": { cn: "在aiBasic里未找到选定模型，无法更新模型配置", en: "Selected model not found in aiBasic, cannot update config" },

  // 用户可见的工具执行消息
  "工具消息/请在编辑器中核对代码": { cn: "请在编辑器中核对代码并批准/拒绝修改", en: "Please review the code in the editor and approve/reject changes" }
};

/**
 * 翻译逻辑 (同步)
 */
export const trs = (key, list) => {
  const lang = options.json?.global_language?.value || 'cn';

  if (list && typeof list === 'object') {
    return list[lang] || list['cn'] || list['en'] || key;
  }

  const match = globalDict[key];
  if (match) {
    return match[lang] || match['cn'] || match['en'] || key;
  }

  if (typeof key === 'string' && key.includes('/')) {
    const parts = key.split('/');
    return parts[parts.length - 1];
  }

  return key;
};

export default { globalDict, trs };
