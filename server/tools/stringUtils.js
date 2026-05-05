/**
 * 字符串处理工具
 * 适配自 Claude Code，用于提升 AI 对代码风格（如引号）的感知和保持。
 */

// 常量定义：弯引号
export const LEFT_SINGLE_CURLY_QUOTE = '‘';
export const RIGHT_SINGLE_CURLY_QUOTE = '’';
export const LEFT_DOUBLE_CURLY_QUOTE = '“';
export const RIGHT_DOUBLE_CURLY_QUOTE = '”';

/**
 * 标准化引号：将弯引号转为直引号，方便逻辑处理
 */
export function normalizeQuotes(str) {
  if (!str) return str;
  return str
    .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
    .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"');
}

/**
 * 引号风格保持
 * 当原始文件使用的是弯引号，而 AI 提供的是直引号时，自动将直引号转回弯引号。
 */
export function preserveQuoteStyle(oldString, actualOldString, newString) {
  if (oldString === actualOldString) return newString;

  const hasDoubleQuotes =
    actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE);
  const hasSingleQuotes =
    actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE);

  if (!hasDoubleQuotes && !hasSingleQuotes) return newString;

  let result = newString;
  if (hasDoubleQuotes) result = applyCurlyDoubleQuotes(result);
  if (hasSingleQuotes) result = applyCurlySingleQuotes(result);

  return result;
}

function isOpeningContext(chars, index) {
  if (index === 0) return true;
  const prev = chars[index - 1];
  return [' ', '\t', '\n', '\r', '(', '[', '{', '\u2014', '\u2013'].includes(prev);
}

function applyCurlyDoubleQuotes(str) {
  const chars = [...str];
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '"') {
      result.push(isOpeningContext(chars, i) ? LEFT_DOUBLE_CURLY_QUOTE : RIGHT_DOUBLE_CURLY_QUOTE);
    } else {
      result.push(chars[i]);
    }
  }
  return result.join('');
}

function applyCurlySingleQuotes(str) {
  const chars = [...str];
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "'") {
      const prev = i > 0 ? chars[i - 1] : undefined;
      const next = i < chars.length - 1 ? chars[i + 1] : undefined;
      const prevIsLetter = prev !== undefined && /\p{L}/u.test(prev);
      const nextIsLetter = next !== undefined && /\p{L}/u.test(next);
      if (prevIsLetter && nextIsLetter) {
        result.push(RIGHT_SINGLE_CURLY_QUOTE); // Apostrophe
      } else {
        result.push(isOpeningContext(chars, i) ? LEFT_SINGLE_CURLY_QUOTE : RIGHT_SINGLE_CURLY_QUOTE);
      }
    } else {
      result.push(chars[i]);
    }
  }
  return result.join('');
}

export default {
  normalizeQuotes,
  preserveQuoteStyle
}
