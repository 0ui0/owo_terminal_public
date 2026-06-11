// website/socket.io.js

(function() {
  console.log("[Mock Socket.IO] Initializing custom websocket simulator...");

  class MockSocket {
    constructor() {
      this.listeners = {};
      
      // 傲娇少年米卡卡的随机语录库
      this.chibiReplies = [
        "切，啦沐达，别老是叫我，小爷我忙着做代码审计呢！优化好了，拿去用吧，别在旁边傻站着了！",
        "哼，我才……才没有主动想帮你写这个首页呢！我只是觉得你之前写的太丑，怕丢了小爷我的面子！",
        "去死啦！你这个大笨蛋，今天的代码要是写不完，别指望我再帮你跑测试！",
        "喂，别老是盯着我！看在你态度诚恳的份上，这次我就大发慈悲帮你把 Bug 全扫干净吧（骄傲）！"
      ];
    }

    on(event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
      return this;
    }

    off(event, callback) {
      if (!this.listeners[event]) return this;
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      return this;
    }

    removeListener(event, callback) {
      return this.off(event, callback);
    }

    emit(event, data, ackCallback) {
      console.log(`[Mock Socket Emit] Event: ${event}`, data);
      
      if (event === 'comData') {
        // 当修改共用数据时，直接 ack 成功
        if (ackCallback) {
          setTimeout(() => ackCallback({ ok: true, msg: "Synced to mock local storage" }), 10);
        }

        // 如果检测到是发送消息的行为，我们可以模拟 AI 傲娇流式回复！
        // 消息发送的动作通常会修改 comData.data，我们可以判断是否包含了新的用户消息。
        // 但为了更简单和稳定，只要前端提交了 comData 修改且包含 data 的推送，我们也可以监控它。
        // 实际上我们可以通过 window.addEventListener 或者暴露全局钩子来监听发送。
      }
      return this;
    }

    // 触发事件以向前端组件推送数据 (如模拟后端推送消息)
    trigger(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(callback => {
          callback(data);
        });
      }
    }
  }

  const socketInstance = new MockSocket();
  window.mockSocket = socketInstance; // 挂载到全局方便测试与 index.html 中的快捷按钮控制

  window.io = function(url, options) {
    console.log("[Mock Socket.IO] Connected to virtual server at:", url);
    return socketInstance;
  };

})();
