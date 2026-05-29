import Joi from "joi"
import yaml from "js-yaml"
import comData from "../../../comData/comData.js"

export default {
  name: "阶段清理并压缩上下文",
  id: "compressContext",
  async fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { memory, focus } = value
    const { aiAskInstance, listId } = metaData

    if (!aiAskInstance) {
      return "错误：未找到 AI 模块实例，无法整理历史"
    }

    // 防死循环熔断：1. 阶段 Token 为 0；或者 2. 上一轮刚刚整理过且没有收到新的人类用户提问
    const asks = aiAskInstance.asks || []
    const archiveIdx = asks.findIndex(a => a.id && String(a.id).startsWith("archive_"))
    let isDeadLoop = false

    if (aiAskInstance.stageTotalTokens === 0) {
      isDeadLoop = true
    } else if (archiveIdx !== -1) {
      const subsequentAsks = asks.slice(archiveIdx + 1)
      const hasRealUserMsg = subsequentAsks.some(
        a => a.role === "user" && a.user !== "系统" && a.user !== "系统通讯中枢" && !a.isSystem
      )
      if (!hasRealUserMsg) {
        isDeadLoop = true
      }
    }

    if (isDeadLoop) {
      return "拒绝执行：当前会话历史已经是压缩后的极净状态。为了防止陷入死循环，严禁在没有产生新的用户交互前重复调用 compressContext 整理工具！请立即转向执行用户的实际任务"
    }

    try {
      // 1. 收集此前累积在内存中的所有长期单次记忆（上限 100 条）
      let archivedMemoriesText = ""
      if (aiAskInstance.memorys && aiAskInstance.memorys.length > 0) {
        archivedMemoriesText = aiAskInstance.memorys
          .map(m => m.content)
          .join("\n---\n")
      } else {
        archivedMemoriesText = "（无前置单次记忆记录）"
      }

      // 2. 拼接当前传入的最新结构化总结
      const summaryText = yaml.dump({
        memory, focus
      })

      // 3. 构建一条特殊的“阶段记忆归档”系统消息，作为初始历史背景放进消息历史
      const archiveAsk = {
        id: "archive_" + Date.now(),
        user: "系统",
        role: "system",
        content: `【🕒 时光档案馆 - 阶段记忆归档】
以下是本阶段截止目前已记录的完整记忆笔记列表（长期记忆）：

${archivedMemoriesText}

========================================
【最新阶段性任务总结 (Summary)】：
${summaryText}
========================================
以上为长期背景，后续会话将在该背景之上继续开展。`,
        timestamp: Date.now(),
        group: "tip"
      }

      // 4. 整理 AI 模型内部维护的对话上下文 asks
      if (aiAskInstance.asks && aiAskInstance.asks.length > 0) {
        const firstAsk = aiAskInstance.asks[0] // 基础 system prompt
        const lastAsk = aiAskInstance.asks[aiAskInstance.asks.length - 1] // 本次发起 compressContext 的 assistant 消息

        // 重新拼装 asks：[基础提示, 阶段记忆归档, 本次发起整理的消息]
        // 这样本工具执行完毕后，系统自动追加 of tool 返回消息会排在最末尾，形成完美闭环
        aiAskInstance.asks = [firstAsk, archiveAsk, lastAsk]
      }

      // 5. 【注意】：这里我们【不再】执行 aiAskInstance.clearMemorys()，保留长期记忆在内存中继续累积！
      // 重置本阶段的 Token 计数器，全局 Token 账单不做清理
      aiAskInstance.stageTotalTokens = 0

      // 6. 整理前端可视化的聊天列表数据
      // 我们在此撤销了对 targetList.data 聊天历史的清空，以保障 findHistoryChats 工具和前端能够完整查看过往历史。

      return `【系统通知】：当前阶段的冗余会话历史已整理并清空，Token 阶段计数器已重置为 0。
前置长期记忆与最新的阶段总结已经作为时光档案馆的 system 背景成功归档注入。

🔴【行动红线 - 极重要】：
1. 历史整理与归档操作已成功结束，当前【严禁】再次调用 compressContext 整理工具，防止陷入死循环。
2. 你必须立即回到用户原本的任务中（若不记得当前任务，请先调用 findHistoryChats 检索先前的上下文）。
3. 如果当前没有未完成的用户任务，请以普通文本向用户说明：“我已成功完成了阶段性总结并瘦身了历史消息。我们接下来继续做什么？”，不要发起任何工具调用。`
    } catch (e) {
      return "整理历史消息失败：" + e.message
    }
  },
  joi() {
    return Joi.object({
      memory: Joi.object({
        when: Joi.string().max(30).required().description("必填 总结时间"),
        where: Joi.string().max(30).required().description("必填 总结地点"),
        who: Joi.string().max(30).required().description("必填 总结人物"),
        why: Joi.string().max(150).required().description("必填 阶段任务起因"),
        how: Joi.string().max(150).required().description("必填 阶段任务经过"),
        what: Joi.string().max(150).required().description("必填 阶段任务结果"),
      }).required().description("必填 阶段性任务总结"),
      focus: Joi.array().items(
        Joi.object({
          target: Joi.string().max(100).required().description("必填 关注对象的类型（如：文件名a.js、终端id等）"),
          step: Joi.string().min(1).max(100).required().description("必填 对应任务清单步骤"),
          code: Joi.object({
            lineS: Joi.number().integer().min(0).max(1000000).required().description("必填 开始行号"),
            lineE: Joi.number().integer().min(0).max(1000000).required().description("必填 结束行号"),
            content: Joi.string().max(200).required().description("必填 代码片段，没有代码填写：无代码")
          }).required().description("必填 关注代码"),
          comments: Joi.array().items(
            Joi.object({
              order: Joi.number().integer().min(1).max(100).required().description("必填 推论序列号"),
              since: Joi.string().max(150).required().description("必填 【因为】引用记录"),
              therefore: Joi.string().max(150).required().description("必填 【所以】"),
              by: Joi.string().max(50).required().description("必填 【依据】公理或定理"),
              comment: Joi.string().max(150).required().description("必填 备注"),
            })
          ).required().description("必填 逻辑推理")
        })
      ).required().description("必填 阶段性关注点")
    }).required()
  },
  getDoc() {
    return `【🔴 严重警告 - 关系到你的生死存亡】
    本工具会物理清空大模型当前会话的全部历史记录 and 工具调用细节！
    为避免在清理后彻底丧失记忆与任务逻辑（变成傻子），请在调用前极其小心谨慎地将当前会话发生的【所有关键信息与当前任务进展】高度总结整理！
    【整理规范与死命令】：
    1. 必须对“当前阶段的对话历史 (context)”做信息密度极高的提炼，详细记录在 memory (最新任务总结) 字段中。
    2. 注意如果总结不到位，你在下一轮就会彻底失忆哦【！！！】
    3. 总结要求：保留所有关键事实、数字、物理文件名、决策结论、代码片段，系统状态、并使用“第一人称（我）”来记录。
    4. 必须利用“逻辑推理 (comments)”把你的核心论证关系链以原子化“因为/所以/依据”的结构严密记录在 focus 关注点中。
    5. 如果你有正在进行的紧急调试或任务未闭环，非必要请先推迟调用，直到取得阶段性闭环或成果后再进行清理。`
  }
}
