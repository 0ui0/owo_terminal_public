import Joi from "joi"
import actorAction from "../actorAction.js"
export default {
  name: "发送模板",
  id: "sendTemplate",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

  },
  joi(useStdTools) {
    return Joi.object({
      //id: Joi.any().forbidden().description("禁止传入id避免和系统生成id混淆"),
      call: Joi.string().allow("").description("历史会话id，你可以针对某个id的历史会话进行点评，允许无"),
      quotes: Joi.array().items(Joi.string()).description("每个元素为历史会话id字符串。针对聊天情况，你也可引用一些历史会话，允许无"),
      mind: Joi.string().required().description("你的思考过程，不许空"),
      mood: Joi.number().min(0).max(10).required().description("1到10,你的心情值，值越大心情越好"),
      at: Joi.string().allow("").description("用户的用户名，可留空字串。表示是否需要@用户"),
      content: Joi.string().required().description("markdown字符串，思考后决定回复的内容，needReply为0将不会发出，不许空"),
      note: Joi.string().required().description("笔记，用作消息截断后保存的你的记忆，需详细记录关键信息，不许空"),
      faceAction: Joi.string().valid(...actorAction.getFaceActions()).required().description("表态，请从中选一个"),
      playFace: Joi.string().valid(...actorAction.getPlayFaces()).required().description("动作，据你心情从中选一个"),
      ...(!useStdTools && {
        sysCalls: Joi.array().items(Joi.object({
          id: Joi.string().required().description("函数的id"),
          call_id: Joi.string().required().description("调用id，同id的函数允许多次调用，用call_id区分，不能重复"),
          type: Joi.string().valid("function_call").required().description("调用类型，固定填function_call"),
          name: Joi.string().required().description("函数名"),
          arguments: Joi.object().unknown(true).required().description("重要：具名参数列表json，请据工具函数的说明和格式规范填写，不许空。例如若要调用等待函数，根据等待函数的说明，要等待3秒填写{\"ms\":3000}")
        }).description("每个数组元素为对象")).description("调用系统函数数组，若有项目，下次请求将在sysReturns中返回函数输出，若为空填写空数组")
      })
    }).required()
  },
  getDoc() {
    return `发送模板`
  }
}