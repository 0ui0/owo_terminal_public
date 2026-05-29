
import appManager from "../apps/appManager.js"

export default {
  name: "appDispatch",
  func: async (appId, action, args = {}) => {
    try {

      // 接口规范见 app开发说明.md

      console.log(`[CrossFunc] AppDispatch: ${appId} -> ${action}`)

      const result = await appManager.dispatch(appId, action, args)

      // --- 逻辑重构：新旧接口规范兼容性检查 ---

      // 1. 如果检测到 result 里有 ok 字段（无论是 true 还是 false）
      if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'ok')) {
        // 特殊处理：如果已经有了 ok，但还在用 error 字段而不是 msg，做双重映射并警告
        if (result.error && !result.msg) {
          console.warn(`[AppDispatch Warning] App "${appId}" action "${action}" 同时返回了 ok 和 error 字段，这不符合新规范！系统已自动将 error 映射到 msg。请尽快更新 backend.js。`)
          result.msg = result.error
        }
        return result
      }

      // 2. 如果没有 ok 字段，说明是旧版本接口，输出警告
      console.warn(`[AppDispatch Warning] App "${appId}" action "${action}" 返回的是旧版接口规范，请尽快按照 "app开发说明.md" 进行更新！`)

      // 3. 处理旧版错误字段：如果有 error 字段，包装成标准格式返回
      if (result && typeof result === 'object' && result.error) {
        return {
          ok: false,
          msg: result.error
        }
      }

      // 4. 既没有 ok，也没有 error，直接返回原始结果（兼容旧版直接返回数据的行为）
      return result
    } catch (e) {
      console.error("[CrossFunc] AppDispatch Error:", e)
      return {
        ok: false,
        msg: e.message
      }
    }
  }
}
