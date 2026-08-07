import Joi from "joi"
import appManager from "../../../apps/appManager.js"

export default {
  name: "执行骨骼小人动作表情",
  id: "playAction",

  async fn(argObj) {
    try {
      const { value, error } = this.joi().validate(argObj)
      if (error) {
        return { ok: false, msg: "参数校验错误: " + error.details[0].message }
      }
      const { actionName, expressionName } = value

      // 查找运行中的 animeRig 实例
      const activeApps = appManager.getSummary().filter(a => a.type === "animeRig")
      if (activeApps.length === 0) {
        return { ok: false, msg: "未找到运行中的 2D骨骼小人 实例，请先打开应用。" }
      }
      const targetAppId = activeApps[0].id

      // appManager.dispatch 内部会自动注入 io，并转发到 backend.dispatch
      const res = await appManager.dispatch(targetAppId, "playAction", { actionName, expressionName })
      if (!res || !res.ok) {
        return { ok: false, msg: res?.msg || "动作下发失败" }
      }
      return { ok: true, msg: expressionName ? `已成功下发: ${actionName} + ${expressionName}` : `已成功下发: ${actionName}` }
    } catch (e) {
      return { ok: false, msg: e.toString() }
    }
  },

  joi() {
    return Joi.object({
      actionName: Joi.string().required().valid(
        // 肢体动作 (bodyActions)
        "idle", "wave", "walk", "run", "raiseHands", "nod",
        // 面部表情 (facialExpressions) - 兼容单参数调用
        "normal", "smile", "happy", "star", "angry", "shock", "sad", "wink"
      ).description("预设动作或表情名称：肢体动作 idle(站立)/wave(挥手)/walk(走路)/run(奔跑)/raiseHands(举手)/nod(点头)；面部表情 normal(平静)/smile(微笑)/happy(大笑)/star(卖萌)/angry(生气)/shock(震惊)/sad(委屈)/wink(眨眼)"),
      expressionName: Joi.string().optional().valid(
        "normal", "smile", "happy", "star", "angry", "shock", "sad", "wink"
      ).description("可选：面部表情（与actionName同时传时，动作+表情一次动画到位）：normal(平静)/smile(微笑)/happy(大笑)/star(卖萌)/angry(生气)/shock(震惊)/sad(委屈)/wink(眨眼)")
    })
  },

  getDoc() {
    return "让2D骨骼小人执行预设动作或表情：仅传actionName执行单个动作/表情；同时传actionName+expressionName时一次调用同时设置肢体动作与面部表情（如{actionName:'run', expressionName:'angry'}）"
  }
}
