import Joi from "joi"

export default {
  name: "工具缓存池展开工具",
  id: "expandTool",
  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { id, turns } = value
    const aiAsk = metaData.aiAskInstance
    if (!aiAsk) return "错误：找不到 aiAsk 实例"

    const item = aiAsk.fnCallCachePool[id]
    if (!item) return `错误：缓存池中找不到 id 为 ${id} 的条目`

    item.count = (turns || 1) + 1
    return `已展开工具缓存池id为${id}的结果，将保持 ${turns || 1} 轮对话。`
  },
  joi() {
    return Joi.object({
      id: Joi.string().required().description("缓存id"),
      turns: Joi.number().integer().min(1).max(6).default(1).description("保持展开的对话轮数，默认为 1，最大为 6")
    })
  },
  getDoc() {
    return "展开工具缓存池中被折叠的工具执行结果。默认保持 1 轮对话后继续折叠，可通过 turns 参数延长（最大 6 轮）。"
  }
}
