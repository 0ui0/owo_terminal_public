import { DispatchTracker } from "../apps/browser/dispatchTracker.js"

export default {
  name: "browserDispatchResponse",
  func: async (trackerId, result) => {
    console.log(`[browserDispatchResponse] 📡 Incoming resolution for trackerId: ${trackerId}`)
    const ok = DispatchTracker.resolve(trackerId, result)
    return { ok }
  }
}
