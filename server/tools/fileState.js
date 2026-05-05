/**
 * 文件状态缓存器
 * 核心功能：
 * 1. 记录文件读取时的 mtime 和内容，用于 fileOpener 判定 file_unchanged (Token Dedup)
 * 2. 记录文件读取的时间戳，用于 filePatcher 判定文件是否在读取后被外部修改 (Staleness Check)
 */

const fileReadingState = new Map();

export default {
  /**
   * 获取文件读取状态
   * @param {string} absolutePath
   */
  get(absolutePath) {
    return fileReadingState.get(absolutePath);
  },

  /**
   * 更新文件状态
   * @param {string} absolutePath
   * @param {object} state { content, timestamp, offset, limit }
   */
  set(absolutePath, state) {
    fileReadingState.set(absolutePath, state);
  },

  /**
   * 清除缓存
   */
  clear() {
    fileReadingState.clear();
  }
};
