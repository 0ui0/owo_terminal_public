import comData from "../comData/comData.js"
import { socketOnChat } from "../ioServer/ioApis/chat/ioApi_chat.js"

export default {
  name: "sendChatMessage",
  func: async (payload) => {
    try {
      const {
        inputText,
        targetChatListId,
        attachments,
        currentModelId,
        sendMode,
        toolsMode,
        enableThinking,
        thinkStrength,
        thinkControl,
        tokenCompressSwitch,
        workDirs,
        isSystemCall
      } = payload;

      // 1. 将包含的配置写入到目标 chatList 且摒弃旧版兼容根节点的脏操作
      if (payload.targetChatListId === undefined) {
        throw new Error("缺少 targetChatListId");
      }
      await comData.data.edit(async (data) => {
        let chatList = comData.getChatList(payload.targetChatListId);
        
        if(payload.currentModelId !== undefined) chatList.currentModelId = payload.currentModelId;
        if(payload.sendMode !== undefined) chatList.sendMode = payload.sendMode;
        if(payload.toolsMode !== undefined) chatList.toolsMode = payload.toolsMode;
        if(payload.enableThinking !== undefined) chatList.enableThinking = payload.enableThinking;
        if(payload.thinkStrength !== undefined) chatList.thinkStrength = payload.thinkStrength;
        if(payload.thinkControl !== undefined) chatList.thinkControl = payload.thinkControl;
        if(payload.tokenCompressSwitch !== undefined) chatList.tokenCompressSwitch = payload.tokenCompressSwitch;
        if(payload.workDirs !== undefined) chatList.workDirs = payload.workDirs;
      });

      // 将前端传来的所有 payload 直接透传给 socketOnChat，实现完全由入参控制的消息流
      const que = {
        inputText: payload.inputText,
        targetChatListId: payload.targetChatListId,
        attachments: payload.attachments,
        call: payload.call,
        quotes: payload.quotes,
        currentModelId: payload.currentModelId,
        sendMode: payload.sendMode,
        isSystemCall: !!payload.isSystemCall
      };

      await socketOnChat(que, null);

      return { ok: true, msg: "发送成功" }
    } catch (err) {
      console.error("[sendChatMessage] 发送失败:", err)
      return { ok: false, msg: err.message }
    }
  }
}
