import Joi from "joi"

export default {
  name: "工具缓存池展开工具",
  id: "expandTool",
  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { id } = value
    const aiAsk = metaData.aiAskInstance
    if (!aiAsk) return "错误：找不到 aiAsk 实例"

    const item = aiAsk.fnCallCachePool[id]
    if (!item) return `错误：缓存池中找不到 id 为 ${id} 的条目`

    item.count = 5
    return `已展开工具缓存池id为${id}的结果。`
  },
  joi() {
    return Joi.object({
      id: Joi.string().required().description("缓存id")
    })
  },
  getDoc() {
    return "展开工具缓存池中被折叠的工具执行结果，5轮对话后继续折叠"
  }
}
