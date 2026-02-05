import { tSession } from "../../../ioServer/ioApis/chat/ioApi_chat.js"
import ioServer from "../../../ioServer/ioServer.js"
import comData from "../../../comData/comData.js"
import { v4 as uuidV4 } from "uuid"
import Joi from "joi"
import stripAnsi from "strip-ansi"
import waitConfirm from "../../waitConfirm.js"



export default {
  name: "执行终端命令",
  id: "terminalSet",
  async fn(argObj, metaData) {

    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    let { tid, command, waitSec } = value
    const currentListId = metaData?.listId || 0
    const toolCallGroupId = metaData?.toolCallGroupId



    let userConfirm = await waitConfirm({
      type: "tip",
      content: command,
      title: "是否执行命令？",
      listId: currentListId
    })

    if (!userConfirm) {
      return `用户主动拒绝，请先中断`
    }


    let session = null

    if (tid === "-1") {
      session = await tSession.add(ioServer.io, {
        listId: currentListId, // 传递归属权
        toolCallGroupId: toolCallGroupId // 传递工具调用组ID
      })
    }
    else {
      session = tSession.find(tid)
      // 只能操作属于自己列表的终端
      if (session && session.listId !== currentListId) {
        return "权限不足：该终端不属于当前智能体会话列表。"
      }
      // 更新工具调用组ID（已有终端也需要）
      if (session) {
        session.toolCallGroupId = toolCallGroupId
      }
    }


    if (session) {
      //tSession.cmdSend(ioServer.io,session.tid,command+"\n",session)

      await comData.data.edit(data => {
        data.currentTid = session.tid
      })

      ioServer.io.emit("openTerminal", {
        currentTid: session.tid
      })

      const data = command + "\r"
      // 分块写入，避免 PTY 缓冲区阻塞
      const CHUNK_SIZE = 512
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        session.shell.write(data.slice(i, i + CHUNK_SIZE))
        if (i + CHUNK_SIZE < data.length) {
          await new Promise(r => setTimeout(r, 10))
        }
      }

      //静默检测：1.5秒无输出则提前返回，最大等待 waitSec 秒
      await new Promise((res) => {
        let t1 = null
        let t2 = null
        let disposer = null

        let done = () => {
          clearTimeout(t1)
          clearTimeout(t2)
          if (disposer) disposer.dispose()
          res()
        }

        t2 = setTimeout(done, waitSec * 1000)

        disposer = session.shell.onData(() => {
          clearTimeout(t1)
          t1 = setTimeout(done, 1500)
        })

        t1 = setTimeout(done, 1500)
      })

      let lastLines = stripAnsi(session.content).split(/\r?\n/).slice(-20).join("\n").slice(-1000)

      return `命令已发送，静默检测后(最大${waitSec}s)的最新20行最后1000字输出如下：\n${lastLines}`
    }
    else {
      return `未找到tid为${tid}的终端`
    }


  },
  joi() {
    return Joi.object({
      tid: Joi.string().required().description("终端tid,值为字符串-1则新建终端"),
      command: Joi.string().required().description("执行命令"),
      waitSec: Joi.number().default(10).description("最大等待秒数，默认10（静默1.5秒无输出会提前返回）")
    })
  },
  getDoc() {
    return `
      向指定tid终端写入并执行命令
      系统会检测输出静默（1.5秒无新输出）自动返回结果
      waitSec为最大等待时间兜底，防止长时间阻塞
      若结果发现终端未执行完毕，可以执行等待函数后重新读取终端内容
      使用TerminalGet工具配合limit可查询截断前的终端内容
    `
  }
}