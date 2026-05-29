
// 全局请求追踪器，用于跨 Socket/HTTP 通信
// 强制挂载到 global 以确保在 AppManager 热重载 (ESM timestamp) 期间实例完全唯一
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 9)

if (!global.owo_browserDispatchTracker) {
  global.owo_browserDispatchTracker = {
    requests: new Map(),

    create(timeout = 30000) {
      const id = generateId()
      let resolve
      const promise = new Promise((res) => { resolve = res })
      const timer = setTimeout(() => {
        if (this.requests.has(id)) {
          this.requests.delete(id)
          console.log(`[DispatchTracker] ❌ Timeout after ${timeout}ms for ID: ${id}`)
          resolve({ ok: false, msg: `Backend Timeout (${timeout / 1000}s)` })
        }
      }, timeout)

      this.requests.set(id, { resolve, timer })
      console.log(`[DispatchTracker] 🆕 Created request ID: ${id} (Total: ${this.requests.size})`)
      return { id, promise }
    },

    resolve(id, result) {
      const req = this.requests.get(id)
      if (req) {
        clearTimeout(req.timer)
        this.requests.delete(id)
        console.log(`[DispatchTracker] ✅ Resolved ID: ${id} (Remaining: ${this.requests.size})`)
        req.resolve(result)
        return true
      }
      console.warn(`[DispatchTracker] ⚠️ Attempted to resolve non-existent ID: ${id}`)
      return false
    }
  }
}

export const DispatchTracker = global.owo_browserDispatchTracker
