/* botCmd_getGroupid.js - 获取群聊标识指令 */
export default {
  cmd: "获取群聊标识",
  run: async function(sendParams) {
    try {
      const { source, meta, msgCenter } = sendParams;

      if (source === "qqOnline/group") {
        await msgCenter.allSend("系统消息", "系统", "标识如下：" + meta.d.group_id, { source, meta });
      } else if (source === "qqOnline/channel") {
        await msgCenter.allSend("系统消息", "系统", "标识如下：" + meta.d.channel_id, { source, meta });
      } else if (source === "qqLocal/group") {
        await msgCenter.allSend("系统消息", "系统", "标识如下：" + meta.group_id, { source, meta });
      } else {
        await msgCenter.allSend("系统消息", "系统", "请在群聊使用本功能", { source, meta });
      }
    } catch (err) {
      console.error("[qqBot/getGroupid]", err);
    }
  }
};
