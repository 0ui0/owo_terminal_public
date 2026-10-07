import { Sequelize } from "sequelize"
import sqlite3 from "sqlite3"
import tempPath from "../../../tools/tempPath.js"
import fs from "fs-extra"
import pathLib from "path"
import { fileURLToPath } from "url"
import Joi from "joi"

const __dirname = pathLib.dirname(fileURLToPath(import.meta.url))
const tableDefPath = pathLib.resolve(__dirname, "../../../db/archiveTables/tb_chat_messages.js")

let readOnlyDb = null
let currentStoragePath = null

function getReadOnlyDb() {
  const storagePath = tempPath.get("save/archive.sqlite")
  if (!fs.existsSync(storagePath)) {
    throw new Error("存档数据库文件尚未生成或不存在")
  }
  if (!readOnlyDb || currentStoragePath !== storagePath) {
    if (readOnlyDb) {
      try {
        readOnlyDb.close()
      } catch (e) { }
    }
    currentStoragePath = storagePath
    readOnlyDb = new Sequelize({
      dialect: "sqlite",
      storage: storagePath,
      dialectOptions: {
        mode: sqlite3.OPEN_READONLY
      },
      logging: false
    })
  }
  return readOnlyDb
}

export default {
  name: "查询历史消息",
  id: "findHistoryChats",
  mode: {
    read: true,
    write: false
  },
  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    // 表定义实时读取：走参数功能按需触发，绝不写进会被缓存的 doc
    if (value.tableDef) {
      try {
        return fs.readFileSync(tableDefPath, "utf-8")
      } catch (err) {
        return `错误：无法读取表定义文件 - ${err.message}`
      }
    }

    const cleanSql = value.sql.trim()

    if (!cleanSql) {
      return "错误：请传入 sql 查询语句，或将 tableDef 设为 true 获取最新表定义。"
    }

    try {
      const db = getReadOnlyDb()
      const [rows] = await db.query(cleanSql)
      return { rows }
    } catch (err) {
      // 若出现句柄失效或关闭异常（如项目重置重构数据库），主动重置单例以便自愈重连
      if (err.message && (err.message.includes("SQLITE_MISUSE") || err.message.includes("closed"))) {
        if (readOnlyDb) {
          try {
            readOnlyDb.close()
          } catch (e) { }
          readOnlyDb = null
        }
      }
      return `错误：SQL 执行失败 - ${err.message}`
    }
  },
  joi() {
    return Joi.object({
      tableDef: Joi.boolean().default(false).description("传 true 时实时返回最新表定义（不执行 SQL）"),
      sql: Joi.string().allow("").default("").description("只读 SQL 语句（表 tb_chat_messages），支持 SELECT/WITH 等只读查询")
    })
  },
  getDoc() {
    return `使用 SQL 查询访问聊天历史数据表（表名 tb_chat_messages），用于精确检索聊天历史；传 tableDef: true 可实时获取最新表定义与索引。

一、数据表
表名 tb_chat_messages，位于本地 SQLite 存档库，本工具底层使用 Sequelize 以只读连接访问。

二、表字段
- id (INTEGER)：自增主键
- uuid (STRING)：消息唯一标识，形如 chat_xxx、ask_xxx
- content (TEXT)：消息展示正文
- reasoning (TEXT)：推理思维链内容
- name (STRING)：发送者姓名
- group (STRING)：消息分组，取值 user / agent / tip / error
- timestamp (INTEGER)：毫秒级时间戳
- chatListId (INTEGER)：所属会话列表编号，主会话为 0
- procId (STRING)：过程事务编号，用于聚合同一轮的多条工具调用消息
- ask (JSON)：AI 协议元数据对象

三、ask 字段
- id (string)：消息编号
- user (string)：用户或模型名称
- title (string)：消息标题或摘要
- role (string)：消息角色，取值 user / assistant / system / tool
- content (string | object)：解析后的正文对象，结构随工具模式变化，见第四章
- rawContent (string)：模型输出的原始文本，结构随工具模式变化，见第四章
- isSystem (number)：是否为系统注入消息，取值 0 / 1
- ignore (number)：是否对模型隐藏，取值 1 表示隐藏
- group (string)：分组标识
- timestamp (number)：毫秒级时间戳
- time (string)：ISO 8601 格式时间
- promptTokens / completionTokens / totalTokens / cachedTokens (number)：Token 消耗统计
- reasoning (string)：模型思维链文本
- toolCalls (array)：原生工具调用数组，出现条件见第四章
- toolCallGroupId (string)：单次工具调用的分组编号，形如 tcg_xxx
- toolCallStage (string)：工具调用阶段，取值 prepare / executing / done
- toolCallSuccess (boolean)：工具是否执行成功，仅工具组最后一条消息携带
- toolCallDuration (number)：工具执行耗时，单位毫秒，仅工具组最后一条消息携带
- tool_call_id (string)：工具调用编号，仅模式 2 / 5 的单条工具结果消息携带
- sysCalls (array)：待执行的工具清单，仅 prepare 阶段消息携带，生成方式见第四章
- sysReturns (array)：工具执行结果清单，仅部分模式的汇总消息携带，见第四章
- ext (object)：扩展参数

四、工具模式差异
同一会话因所选工具模式不同，ask 中相关字段存在下列差异：
1. 模式 1：模型直接输出 JSON 对象，toolCalls 为空。
2. 模式 2：以原生工具调用方式交互，系统将模型的 toolCalls 转换为 sysCalls；工具结果拆分为多条 tool 角色消息，最后一条标记 toolCallStage = done，不写入 sysReturns。
3. 模式 3：以 JSON Schema 约束模型输出，字段结构与模式 1 相同。
4. 模式 4：所有调用收敛到 sendTemplate 单一工具，入库时 toolCalls 被清除。
5. 模式 5：正文以 Markdown 输出，附加配置由 <extJsonConfig> 标签解析后写入 content；同时保留模式 2 的原生工具能力，工具结果的处理方式与模式 2 相同。
`.trim()
  }
}
