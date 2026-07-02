import Joi from "joi"
import yaml from "js-yaml"
import comData from "../../../comData/comData.js"
import chats from "../../../ioServer/ioApis/chat/chats.js"
import idTool from "../../../tools/idTool.js"
import { trs } from "../../../tools/i18n.js"
import archiveDb from "../../../db/archiveDb.js"

export default {
  name: "阶段清理并压缩上下文",
  id: "compressContext",
  async fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { memory, focus, todo } = value
    const { aiAskInstance, listId } = metaData

    if (!aiAskInstance) {
      return "错误：未找到 AI 模块实例，无法整理历史"
    }

    // 物理抹除刚才主流程写入数据库的那条 prepare 阶段的工具消息，避免前端渲染出空工具盒
    if (aiAskInstance && aiAskInstance.asks && metaData && metaData.toolCallGroupId) {
      const prepareAsk = aiAskInstance.asks.find(
        a => a.toolCallGroupId === metaData.toolCallGroupId && a.toolCallStage === "prepare"
      )
      if (prepareAsk && archiveDb.tb_chat_messages) {
        try {
          await archiveDb.tb_chat_messages.destroy({
            where: { uuid: prepareAsk.id }
          })
          console.log("[compressContext] 已物理删除 prepare 工具消息:", prepareAsk.id)
        } catch (dbErr) {
          console.error("[compressContext] 从数据库删除 prepare 消息失败:", dbErr)
        }
      }
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

      // 2. 语义化拼接当前传入的最新结构化总结
      let summaryText = `### 🎯 阶段任务基本信息
- **时间 (When)**: ${memory.when}
- **地点 (Where)**: ${memory.where}
- **人物 (Who)**: ${memory.who}
- **任务起因 (Why)**: ${memory.why}
- **任务经过 (How)**: ${memory.how}
- **任务结果 (What)**: ${memory.what}

### 🔍 阶段性核心关注点 (Focus)`

      if (focus && focus.length > 0) {
        focus.forEach((item, index) => {
          summaryText += `\n\n#### 📍 关注对象 ${index + 1}: ${item.target} (对应步骤: ${item.step})`
          if (item.code) {
            summaryText += `\n- **关注代码 (L${item.code.lineS} - L${item.code.lineE})**:`
            if (item.code.content && item.code.content !== "无代码") {
              summaryText += `\n  \`\`\`\n  ${item.code.content}\n  \`\`\``
            } else {
              summaryText += " 无代码"
            }
          }
          if (item.comments && item.comments.length > 0) {
            summaryText += `\n- **逻辑推理链条**:`
            const sortedComments = [...item.comments].sort((a, b) => a.order - b.order)
            sortedComments.forEach(c => {
              summaryText += `\n  - **推论 [${c.order}]**:\n    【因为】 ${c.since} (依据: ${c.by})\n    【所以】 ${c.therefore} (备注: ${c.comment})`
            })
          }
        })
      } else {
        summaryText += "\n（无关注点记录）"
      }

      summaryText += `\n\n### 📋 接下来要做什么 (Todo)\n- ${todo}`

      // 3. 构建一条特殊的“阶段记忆归档”用户消息，作为初始历史背景放进消息历史并落库刷新
      const chatUuid = idTool.get("chat")
      const askId = idTool.get("ask")
      const contentText = `你在上一轮对话调用了压缩上下文工具，现在聊天记录已被清空。
下面是你之前传递的总结信息。阅读总结后，你必须调用历史记录工具（如 findHistoryChats）看一下被清空的前几条消息 + 总结。

🔴【行动红线 - 极重要】：
1. 历史整理与归档操作已成功结束，当前【严禁】再次调用 compressContext 整理工具，防止陷入死循环。
2. 你必须立即回到用户原本的任务中，如果你不确定之前的任务，请先调用 findHistoryChats 检索前一阶段被清空的消息。
3. 如果当前没有未完成的用户任务，请以普通文本向用户说明：“我已成功完成了阶段性总结并瘦身了历史消息。我们接下来继续做什么？”，不要发起任何工具调用。

========================================
【🕒 时光档案馆 - 阶段性总结与上下文归档】
========================================

【前置长期记忆记录】：
${archivedMemoriesText}

========================================
【最新阶段性总结 (大模型所写)】：
${summaryText}
========================================`

      // 调用 aiAskInstance 的 prePareAsk 方法以安全填充契约化字段，并将 role 设为 user 解决严格模型的交替限制
      const archiveAsk = aiAskInstance.prePareAsk(trs("角色/用户"), "user", contentText, {
        id: askId,
        timestamp: Date.now() - 1000,
        group: "user"
      })

      // 构建绝对标准的用户消息对象并物理写入 SQLite 数据库和广播刷新
      const chat = {
        uuid: chatUuid,
        content: contentText,
        name: trs("角色/用户"),
        group: "user",
        timestamp: archiveAsk.timestamp,
        chatListId: listId,
        attachments: [],
        ask: archiveAsk,
        tid: null
      }

      await chats.add(chat, listId)
      chats.refresh(listId)

      // 4. 整理 AI 模型内部维护 of 对话上下文 asks，将其截断为仅有基础提示 and 刚落库的 user 消息
      if (aiAskInstance.asks && aiAskInstance.asks.length > 0) {
        const firstAsk = aiAskInstance.asks[0] // 基础 system prompt
        aiAskInstance.asks = [firstAsk, archiveAsk]
      }

      // 5. 【注意】：这里我们【不再】执行 aiAskInstance.clearMemorys()，保留长期记忆在内存中继续累积！
      // 重置本阶段的 Token 计数器，全局 Token 账单不做清理
      aiAskInstance.stageTotalTokens = 0

      // 6. 强制中断当前大模型的这一次运行循环（拦截主流程后置的自动重新发送）
      aiAskInstance.stopRun()

      // 7. 异步在下一轮中重置状态，清洗 tool 消息，并重新发起独立的新对话
      setTimeout(async () => {
        // A. 抹除命令放在最开始第一行执行，确保无论如何第一时间重置 asks 内存
        if (aiAskInstance.asks && aiAskInstance.asks.length >= 2) {
          aiAskInstance.asks = [aiAskInstance.asks[0], aiAskInstance.asks[1]]
        }

        // B. 物理抹除刚才主流程写入数据库的对应 tool 消息，防止前端渲染出无用的工具盒
        if (metaData && metaData.toolCallGroupId && archiveDb.tb_chat_messages) {
          try {
            const allMsgs = await archiveDb.tb_chat_messages.findAll({
              where: { chatListId: listId }
            })
            const uuidsToDelete = []
            for (const m of allMsgs) {
              let askObj = null
              if (m.ask) {
                askObj = typeof m.ask === "string" ? JSON.parse(m.ask) : m.ask
              }
              if (askObj && askObj.toolCallGroupId === metaData.toolCallGroupId) {
                uuidsToDelete.push(m.uuid)
              }
            }
            if (uuidsToDelete.length > 0) {
              await archiveDb.tb_chat_messages.destroy({
                where: { uuid: uuidsToDelete }
              })
              console.log("[compressContext] 异步成功物理清除数据库中该组的 tool 消息数量:", uuidsToDelete.length, uuidsToDelete)
              // 关键：通知前端刷新，抹除残留卡片
              chats.refresh(listId)
            }
          } catch (dbErr) {
            console.error("[compressContext] 从数据库删除 tool 消息失败:", dbErr)
          }
        }

        // C. 在安全沙箱中重置状态并拉起新对话，万一后面炸了也不会影响前面的抹除
        try {
          // 重置停止标记为 false，以允许新的对话运行
          aiAskInstance.noStopRun()
          console.log("[compressContext] 重新唤起上下文清理后的独立新对话...")
          await aiAskInstance.sendAskByMsgProtocol(metaData.config)
        } catch (err) {
          console.error("[compressContext] 异步唤起新对话失败:", err)
        }
      }, 500)

      return `【系统通知】：当前阶段的冗余会话历史已整理并清空，Token 阶段计数器已重置为 0。`
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
      ).required().description("必填 阶段性关注点"),
      todo: Joi.string().required().description("必填 接下来要做什么（明确下一步要执行的任务或计划）")
    }).required()
  },
  getDoc() {
    return `请在收到系统的压缩上下文警告后或用户的要求下认真评估后是否决定调用本工具
    【🔴 严重警告 - 关系到你的生死存亡】
    本工具会物理清空大模型当前会话的全部历史记录 and 工具调用细节！
    为避免在清理后彻底丧失记忆与任务逻辑（变成傻子），请在调用前极其小心谨慎地将当前会话发生的【所有关键信息与当前任务进展】高度总结整理！
    【整理规范与死命令】：
    1. 必须对“当前阶段的对话历史 (context)”做信息密度极高的提炼，详细记录在 memory (最新任务总结) 字段中。
    2. 注意如果总结不到位，你在下一轮就会彻底失忆哦【！！！】
    3. 总结要求：保留所有关键事实、数字、物理文件名、决策结论、代码片段，系统状态、并使用“第一人称（我）”来记录。
    4. 必须利用“逻辑推理 (comments)”把你的核心论证关系链以原子化“因为/所以/依据”的结构严密记录在 focus 关注点中。
    5. 必须在 todo 字段中清晰填写你接下来要做什么，以便在下一阶段开始时立即接续执行。
    6. 如果你有正在进行的紧急调试或任务未闭环，非必要请先推迟调用，直到取得阶段性闭环或成果后再进行清理。`
  }
}
