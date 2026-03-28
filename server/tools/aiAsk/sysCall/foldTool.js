import Joi from "joi"

export default {
  name: "工具缓存池折叠工具",
  id: "foldTool",
  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    const { id } = value
    const aiAsk = metaData.aiAskInstance
    if (!aiAsk) return "错误：找不到 aiAsk 实例"

    const item = aiAsk.fnCallCachePool[id]
    if (!item) return `错误：缓存池中找不到 id 为 ${id} 的条目`

    item.count = 0
    return `已折叠，id 为 ${id} 的条目在下一轮将只显示摘要。`
  },
  joi() {
    return Joi.object({
      id: Joi.string().required().description("缓存id")
    })
  },
  getDoc() {
    return "折叠池中展开的条目"
  }
}
