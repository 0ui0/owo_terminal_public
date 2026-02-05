import Joi from "joi"
export default {
  name: "接收模板",
  id: "sendTemplate",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

  },
  joi(useStdTools) {
    return Joi.object({
      id: Joi.string().description("会话id"),
      user: Joi.string().description("用户名"),
      role: Joi.string().description("角色，保留字段，暂时没用"),
      content: Joi.string().description("消息主体"),
      call: Joi.string().description("历史会话id，用户针对某个id的历史会话进行点评"),
      quotes: Joi.array().items(Joi.string()).description("每个元素为历史会话id字符串。用户引用了一些历史对话"),
      isSystem: Joi.number().valid(0, 1).description("0或1 是否是系统消息"),
      timestamp: Joi.string().description("时间戳"),
      time: Joi.string().description("格式化后的时间字符串"),
      memory: Joi.string().description("上次你回复中的笔记"),
      ...(!useStdTools && {
        sysReturns: Joi.array().items(Joi.object({
          type: Joi.string().valid("function_call_output").description("类型"),
          call_id: Joi.string().description("调用id"),
          name: Joi.string().description("函数名"),
          id: Joi.string().description("函数id"),
          output: Joi.string().description("函数输出")
        })),
      }),
      retry: Joi.number().description("重试次数，若系统解析JSON失败将重试"),
      joi: Joi.string().description("若系统解析JSON失败，将返回用joi解析JSON的报错结果"),
      ext: Joi.object().description("扩展字段")
    })
  },
  getDoc() {
    return `接收模板`
  }
}