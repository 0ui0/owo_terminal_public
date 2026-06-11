import archiveDb from "../../../db/archiveDb.js"
import { Op } from "sequelize"
import Joi from "joi"
import yaml from "js-yaml"

export default {
  name: "查询历史消息",
  id: "findHistoryChats",
  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { listId, page, pageSize, keyword, startDate, endDate, id, reverse } = value

    if (!archiveDb.tb_chat_messages) {
      return "错误：存档数据库未准备好"
    }

    let pagedList = []
    let total = 0

    if (id) {
      const targetMsg = await archiveDb.tb_chat_messages.findOne({
        where: { chatListId: listId, uuid: id },
        raw: true
      })
      if (!targetMsg) {
        return `错误：即便在历史归档中也找不到 ID 为 ${id} 的消息`
      }
      pagedList = [targetMsg]
      total = 1
    } else {
      // 常规过滤
      const where = { chatListId: listId }

      // 0. 基础过滤：排除被标记为忽略的消息 (如系统提示、工具调用中间态)
      where[Op.and] = [
        {
          [Op.or]: [
            { ask: null },
            { "ask.ignore": null },
            {
              "ask.ignore": {
                [Op.notIn]: [true, 1]
              }
            }
          ]
        }
      ]

      // 1. 时间范围筛选
      if (startDate) {
        let t = Number(startDate)
        if (isNaN(t)) {
          t = new Date(startDate).getTime()
        }
        if (!isNaN(t)) {
          where.timestamp = { ...where.timestamp, [Op.gte]: t }
        }
      }
      if (endDate) {
        let t = Number(endDate)
        if (isNaN(t)) {
          t = new Date(endDate).getTime()
        }
        if (!isNaN(t)) {
          where.timestamp = { ...where.timestamp, [Op.lte]: t }
        }
      }

      // 2. 关键词筛选
      if (keyword && keyword.trim().length > 0) {
        where[Op.or] = [
          { content: { [Op.like]: `%${keyword}%` } },
          { ask: { [Op.like]: `%${keyword}%` } }
        ]
      }

      const orderDirection = reverse ? "DESC" : "ASC"
      const result = await archiveDb.tb_chat_messages.findAndCountAll({
        where,
        order: [["timestamp", orderDirection]],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        raw: true
      })
      pagedList = result.rows
      total = result.count
    }

    // 统一反序列化 JSON 字段
    pagedList = pagedList.map(chat => {
      let askObj = null
      if (chat.ask) {
        try {
          askObj = typeof chat.ask === "string" ? JSON.parse(chat.ask) : chat.ask
        } catch (e) {
          askObj = null
        }
      }
      let attachmentsObj = []
      if (chat.attachments) {
        try {
          attachmentsObj = typeof chat.attachments === "string" ? JSON.parse(chat.attachments) : chat.attachments
        } catch (e) {
          attachmentsObj = []
        }
      }
      return {
        ...chat,
        ask: askObj,
        attachments: attachmentsObj
      }
    })

    const totalPages = Math.ceil(total / pageSize)
    if (page < 1) page = 1
    if (page > totalPages && totalPages > 0) page = totalPages

    // --- 格式化输出 (转为文本) ---
    const header = `=== 历史查询结果 (第 ${page}/${totalPages} 页，共 ${total} 条) ===\n`

    const body = pagedList.map((chat, index) => {
      const timeStr = chat.ask && chat.ask.time ? chat.ask.time : new Date(chat.timestamp).toISOString()
      const role = chat.ask ? (chat.ask.group === "user" ? "User" : "AI") : "Unknown"
      const id = chat.uuid || chat.id

      let metaInfo = ""
      if (chat.ask) {
        // ==================================================================================
        // 【核心逻辑说明 - 请勿随意修改】(Based on 2026-02 Deep Dive)
        // 
        // 1. 数据结构双轨制 (Double Track Structure):
        //    - 内存中 (AiAsk.asks): ask.content 是 String (原始 JSON 文本)。
        //    - 数据库中 (comData/ChatList): ask.content 是 Object (ioApi_chat.js L294 解析后的对象)。
        //    - 外层展示 (chat.content): String (由 "mind" + "content" 拼接而成的纯文本)。
        //    
        //    >> 为什么使用 ask.content 而不是 chat.content？ <<
        //    chat.content 是给用户阅读的 UI 展示层（经过了拼接和修饰）。
        //    chat.ask.content 才是数据的【信源】。
        //    对于 AI 来说，它需要看到的是它当初实际生成的 JSON 结构（包括 mind/sysCalls），
        //    而不是 UI 拼接后的只读文本。
        //    虽然 ask.content 可能是 Object，但我们必须还原它，以确保 AI 知道它自己到底发了什么。
        //
        // 2. 字段取舍策略 (Field Strategy):
        //    A. sysReturns (结果):
        //       - 状态: 剔除 (DELETE)。
        //       - 原因: 系统会在 tool调用结束后生成一条专门的 "Done" 消息 (ignore=0)，其正文已包含结果 YAML。
        //       - 风险: 若保留，会导致历史记录出现巨大的结果数据重复。
        //
        //    B. toolCalls (Mode 2 请求):
        //       - 状态: 保留 (KEEP)。
        //       - 原因: 原生工具调用的请求参数只存在于 toolCalls 元数据中，AI 消息正文(text)里没有。
        //       - 风险: 若删除，Mode 2 的历史记录将丢失所有函数调用参数信息。
        //
        //    C. sysCalls (Mode 1/3 请求):
        //       - 状态: 包含于正文 (IN BODY)。
        //       - 原因: 由于下方 "finalContent" 逻辑强制使用了 ask.content (JSON 对象)，sysCalls 已包含在正文输出中。
        //       - 操作: 无需再提取到 Meta，避免重复展示。
        // ==================================================================================

        // 提取元数据，排除已展示或冗余字段
        const meta = { ...chat.ask }

        // Mode 1/3 的 sysCalls 都在 content 里，稍后会作为正文输出，这里无需特殊处理


        delete meta.content // 正文单独展示 (下方正文会使用 ask.content 的反序列化版本)

        // sysReturns 已经在“函数执行完成”的专门消息中展示（ignore=0），故此处元数据可剔除，避免重复
        delete meta.sysReturns
        // 但 toolCalls (Mode 2) 和 sysCalls (Mode 1/3) 是请求意图，必须保留

        // 如果有元数据则展示
        if (Object.keys(meta).length > 0) {
          try {
            metaInfo = `【元数据 供你查询，发送不许携带】\n${yaml.dump(meta)}`
          } catch (e) {
            metaInfo = `【元数据】: (解析失败)\n`
          }
        }
      }

      // 决定正文内容 (Priority: Ask > Chat)
      // 使用 ask.content 并将其字符串化，以还原最真实的原始数据
      let finalContent = ""
      if (chat.ask && chat.ask.content) {
        if (typeof chat.ask.content === 'object') {
          finalContent = JSON.stringify(chat.ask.content) // 还原 Object 为 JSON 串
        } else {
          finalContent = String(chat.ask.content)
        }
      } else {
        finalContent = chat.content || "" // Fallback
      }

      // 截断处理
      const MAX_LEN = 5000
      if (finalContent.length > MAX_LEN) {
        finalContent = finalContent.slice(0, MAX_LEN) + `\n...(超过${MAX_LEN}字，剩余${finalContent.length - MAX_LEN}字已截断)...`
      }

      return `[${timeStr}] <${role}> (ID: ${id})\n${finalContent}\n${metaInfo}`
    }).join("\n---\n")

    const footer = `\n=== 本页结束 (第 ${page}/${totalPages} 页) ===`

    return header + body + footer
  },
  joi() {
    return Joi.object({
      listId: Joi.number().required().description("目标聊天列表ID，参考消息的chatListId字段"),
      page: Joi.number().min(1).default(1).description("页码，从1开始"),
      pageSize: Joi.number().min(1).max(50).default(10).description("每页条数，建议10-20"),
      keyword: Joi.string().optional().description("【可选】内容搜索：支持字符串或正则"),
      startDate: Joi.string().optional().description("【可选】起始时间 (支持秒级精度，格式：YYYY-MM-DD HH:mm:ss 或 时间戳数字)"),
      endDate: Joi.string().optional().description("【可选】结束时间 (支持秒级精度，格式：YYYY-MM-DD HH:mm:ss 或 时间戳数字)"),
      id: Joi.string().optional().description("【最高优先级】精确查询指定消息ID (若提供此项将忽略其他筛选)"),
      reverse: Joi.boolean().default(false).description("是否按时间倒序排列 (默认 false 即从旧到新)")
    })
  },
  getDoc() {
    return `查询历史消息
核心功能：对聊天记录进行筛选、排序和分页查询
适用于回忆过往、查找特定话题、或查询用户引用的消息
必须指定ListId
使用策略：
1. 【翻阅模式】：指定 page/pageSize 逐页阅读历史。
2. 【搜索模式】：提供 keyword 进行内容检索（支持正则）。
3. 【溯源模式】：提供 startDate/endDate 限定时间范围。
4. 【引用查询】：仅提供 id 参数，可精准获取某条引用消息的原文。
`.trim()
  }
}