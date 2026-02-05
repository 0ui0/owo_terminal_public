
import comData from "../../comData/comData.js"
import settingData from "../setting/settingData.js"

let globalDict = {};

/**
 * i18n 初始化
 * 通过 fnCall 从后端加载统一的资源文件/字典
 */
export const init = async () => {
  try {
    const res = await settingData.fnCall("getI18n");
    if (res.ok) {
      globalDict = res.dict;
      console.log("i18n initialized with global dictionary");
    }
  } catch (e) {
    console.error("i18n init failed", e);
  }
};

/**
 * 翻译函数 t
 * @param {string} key - 标识符或中文原文
 * @param {object} list - 内联翻译 {cn, en, ...}
 */
export const trs = (key, list) => {
  const lang = settingData.options?.get("global_language") || 'cn';

  // 1. 优先使用内联翻译
  if (list && typeof list === 'object') {
    return list[lang] || list['cn'] || list['en'] || key;
  }

  // 2. 其次查全局字典 (从后端加载过来的)
  const match = globalDict[key];
  if (match) {
    return match[lang] || match['cn'] || match['en'] || key;
  }

  // 3. 兜底处理层级 Key
  if (typeof key === 'string' && key.includes('/')) {
    const parts = key.split('/');
    return parts[parts.length - 1];
  }

  return key;
};

export default { init, trs };
