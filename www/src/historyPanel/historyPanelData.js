import m from "mithril"

const debugHistory = {
  logs: [],
  async log(action, details = {}) {
    try {
      const timestamp = new Date().toISOString();
      
      let snapshot = { asks: null, chats: null };
      try {
        // Fetch both the asks context and the actual sent context (chats)
        const [asksRes, chatsRes] = await Promise.all([
          m.request({ method: "GET", url: `/api/aiAsk/asks/get?_t=${Date.now()}` }),
          m.request({ method: "GET", url: `/api/aiAsk/chats/get?_t=${Date.now()}` })
        ]);
        snapshot.asks = asksRes;
        snapshot.chats = chatsRes;
      } catch(e) {}
      
      this.logs.unshift({
        time: timestamp,
        action,
        details,
        snapshot
      });
      
      if (this.logs.length > 50) this.logs.pop();
      m.redraw();
    } catch(e) {
      console.error("Debug log failed", e);
    }
  },
  clear() {
    this.logs = [];
    m.redraw();
  }
};

export default debugHistory;
