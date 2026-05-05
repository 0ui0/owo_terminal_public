import Joi from "joi"
import actorAction from "../actorAction.js"
import appManager from "../../../apps/appManager.js"

export default {
  name: "发送模板",
  id: "sendTemplate",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

  },
  joi(toolsMode) {
    const allTools = appManager.getTools()
    const toolIds = allTools.map(t => t.id)
    const toolNames = allTools.map(t => t.name)

    return Joi.object({
      //id: Joi.any().forbidden().description("禁止传入id避免和系统生成id混淆"),
      call: Joi.string().description("选填 历史会话id，你可以针对某个id的历史会话进行点评"),
      quotes: Joi.array().items(Joi.string()).description("选填 每个元素为历史会话id字符串。针对聊天情况，你也可引用一些历史会话"),
      mind: Joi.string().max(800).required().description("必填 你的思考大纲，用箭头（→）连接想法，尽量简短。"),
      mood: Joi.number().min(0).max(10).required().description("必填 你的心情值"),
      at: Joi.string().description("选填 @用户的用户名"),
      content: Joi.string().max(2000).required().description(`
        必填 思考后决定回复给用户的正文，使用markdown（支持html+svg模式）。
        【规则1】若本次对话包含工具函数调用（sysCalls），则这里只需简述意图（例如：我将查看xxx以确认xxx）。
        【规则2】若本次对话不再调用工具，或任务已取得阶段性结论，请在本字段提供详尽的markdown总结报告、代码分析或最终答案。
      `.trim()),

      ...(
        toolsMode !== 2 && {
          note: Joi.object({
            memory: Joi.object({
              when: Joi.string().max(30).required().description("必填 时间"),
              where: Joi.string().max(30).required().description("必填 地点"),
              who: Joi.string().max(30).required().description("必填 人物"),
              why: Joi.string().max(150).required().description("必填 起因"),
              how: Joi.string().max(150).required().description("必填 经过"),
              what: Joi.string().max(150).required().description("必填 结果"),
            }),
            focus: Joi.array().items(
              Joi.object({
                target: Joi.string().max(100).required().description("必填 关注对象的类型（如：文件名a.js、终端id等、appid、目录路径等）"),
                step: Joi.string().min(1).max(100).required().description("必填 对应任务清单步骤如[主任务]1/20[子任务]1/20"),
                code: Joi.object({
                  lineS: Joi.number().integer().min(0).max(1000000).required().description("必填 开始行号"),
                  lineE: Joi.number().integer().min(0).max(1000000).required().description("必填 结束行号"),
                  content: Joi.string().max(200).required().description("必填 代码片段，没有代码填写：无代码")
                }).required().description("必填 关注代码"),
                comments: Joi.array().items(
                  Joi.object({
                    order: Joi.number().integer().min(1).max(100).required().description("必填 推论序列号"),
                    since: Joi.string().max(150).required().description("必填 【因为】引用记录须用[编号]表面，例：【因为】[1]中证明了xxx【又因为】[2]中证明了xxx"),
                    therefore: Joi.string().max(150).required().description("必填 【所以】"),
                    by: Joi.string().max(50).required().description("必填 【依据】公理或定理"),
                    comment: Joi.string().max(150).required().description("必填 备注"),
                  })
                ).required().description("必填 数学证明式的逻辑推理，每条推理条件结论须对应唯一依据。严禁跳步、单条推理多个依据复合使用。每一步必须引用前置编号或外部事实。用户看不到本字段")
              })
            ).required().description("必填 关注点")
          }).required().description("必填 系统会裁剪你的记忆，本字段作为记忆被裁剪前的关键笔记【重要】。不会发送给用户。"),


          tasks: Joi.array().items(Joi.object({
            mode: Joi.string().valid("add", "update").required().description("操作模式：add(新增), update(更新)"),
            taskid: Joi.number().integer().description("更新时必填，新增时不填"),
            name: Joi.string().max(50).required().description("必填 任务名称"),
            status: Joi.string().valid("规划中", "执行中", "已完成").required().description("必填:规划中/执行中/已完成 任务状态"),
            process: Joi.number().min(0).max(100).required().description("必填 百分比进度0-100"),
            subtasks: Joi.array().items(Joi.object({
              name: Joi.string().max(50).required().description("必填 子任务名称"),
              status: Joi.string().valid("规划中", "执行中", "已完成").required().description("必填:规划中/执行中/已完成 子任务状态"),
              process: Joi.number().min(0).max(100).required().description("必填 子任务进度")
            })).required().description("必填 子任务清单，每个大任务至少都有1个子任务")
          })).required().description("必填 贝叶斯定理式任务清单，详细规划任务路径。【重要】临时任务使用插入而不是清空重写"),

        }
      ),


      /* note: Joi.string().max(200).required().description(`
        必填 你的记忆笔记，markdown格式，用第一人称记叙文叙述
        系统会定期截断上下文，笔记是你唯一的记忆依据，务必!!!认真填写!!! 笔记不会发送给用户，只给你自己看
        注意[时间][地点][人物][起因][经过][结果]、[关注点]、和[推理链条]
        其中推理链用**数学形式化证明**的方式
        每条推理”因为所以“须对应唯一”依据“的公理、定理（原子化）
        多依据复合须拆分多条推理
        若有必要，可用表格和流程图增加记录
        【注意】笔记将在列表的末尾追加，故勿复述旧笔记的内容
      `.trim()), */


      //tasks: Joi.string().valid("我已知晓").required().description("必填 【重要】每次对话！！必须！！调用任务相关工具规划、推进、清理任务"),
      graph: Joi.string().valid("我已知晓").required().description("必填 【重要】每次对话！！必须！！调用网点相关工具添加、修改、删除、清理节点和连线"),
      faceAction: Joi.string().valid(...actorAction.getFaceActions(), "none").required().description("必填 表态，请从中选一个"),
      playFace: Joi.string().valid(...actorAction.getPlayFaces(), "无表情").required().description("必填 动作，据你心情从中选一个"),
      //工具调用
      ...(([1, 3, 4].includes(toolsMode)) && {
        sysCalls: Joi.array().items(
          Joi.object({
            id: Joi.string().valid(...toolIds).required().description("必填 函数的id，为英文名，注意不要和函数名混淆"),
            call_id: Joi.string().required().description("必填 调用id，同id的函数允许多次调用，用call_id区分，不能重复"),
            type: Joi.string().valid("function_call").required().description("必填 调用类型，固定填function_call"),
            name: Joi.string().valid(...toolNames).required().description("必填 函数名，中文，注意不要和id混淆"),
            arguments: Joi.object().unknown(true).required().description("必填 重要：具名参数列表json，请据工具函数的说明和格式规范填写，不许空。例如若要调用等待函数，根据等待函数的说明，要等待3秒填写{\"ms\":3000}")
          }).description("注意每个数组元素为对象")
        ).description("选填 调用系统函数数组。")
      })
    }).required()
  },
  getDoc() {
    return `发送模板`
  }
}