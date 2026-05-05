const { contextBridge, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) => {
    try {
      // 核心中的核心：通过 webUtils 绕过被破坏的属性读取
      return webUtils.getPathForFile(file);
    } catch (e) {
      console.error('[Preload] webUtils Failed:', e);
      return null;
    }
  }
});
