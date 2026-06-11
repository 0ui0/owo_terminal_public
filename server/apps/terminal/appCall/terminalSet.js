import Joi from "joi"
import appManager from "../../appManager.js"
import comData from "../../../comData/comData.js"
import waitConfirm from "../../../tools/waitConfirm.js"
import terminalBackend from "../backend.js"
import pathLib from "path"

export default {
  name: "执行终端命令",
  id: "terminalSet",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) return "错误：" + error.details[0].message

    let { appId, command, waitSec, argsDesc } = value

    if (command.length > 1000) {
      return "错误：命令超长(>1000字)，Zsh交互式解析会卡死。请改用fileWriter写成文件后执行。"
    }

    const currentListId = metaData?.listId || 0
    const toolCallGroupId = metaData?.toolCallGroupId
    const deferredFns = metaData?.deferredFns

    // 计算目标运行目录 targetCwd
    const { customCwd } = comData.data.get()
    const defaultCwd = pathLib.resolve(process.cwd(), "..", "aiWork")
    let targetCwd = customCwd || defaultCwd

    if (appId && appId !== "-1") {
      const targetApp = appManager.get(appId)
      if (targetApp) {
        const session = terminalBackend.getSession(targetApp.id)
        targetCwd = session?.cwd || targetApp.data.cwd || defaultCwd
      }
    } else {
      // 探测是否有属于当前会话的空闲终端
      const idleTerm = [...appManager.apps.values()].find((a) => {
        if (a.type !== "terminal" || a.data.listId !== currentListId) return false
        const session = terminalBackend.getSession(a.id)
        if (!session) return false
        const noToolLock = !session.toolCallGroupId
        const isPhysicallyIdle = (Date.now() - (session.lastOutputTime || 0)) > 2000
        return noToolLock && isPhysicallyIdle
      })
      if (idleTerm) {
        targetCwd = idleTerm.data.cwd || defaultCwd
      }
    }

    const userConfirm = await waitConfirm({
      type: "text",
      content: command,
      argsDesc,
      title: `是否执行命令？(运行路径: ${targetCwd})`,
      listId: currentListId
    })

    if (!userConfirm.ok) {
      return `用户主动拒绝执行命令。备注：${userConfirm.comment || "无"}`
    }

    let termApp = null

    if (!appId || appId === "-1") {
      // 探测是否有属于当前会话的空闲终端进行复用
      const idleTerm = [...appManager.apps.values()].find((a) => {
        if (a.type !== "terminal" || a.data.listId !== currentListId) return false
        const session = terminalBackend.getSession(a.id)
        if (!session) return false
        const noToolLock = !session.toolCallGroupId
        const isPhysicallyIdle = (Date.now() - (session.lastOutputTime || 0)) > 2000
        return noToolLock && isPhysicallyIdle
      })

      if (idleTerm) {
        termApp = idleTerm
        // 更新工具上下文并锁定独占
        await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId, deferredFns })
      } else {
        // 新建终端
        const launchRes = await appManager.launch("terminal", {
          data: {
            cwd: customCwd,
            listId: currentListId,
            toolCallGroupId,
            deferredFns
          }
        })
        if (!launchRes?.ok) return `启动终端失败: ${launchRes?.msg || "未知错误"}`
        termApp = launchRes.app
        await new Promise(res => setTimeout(res, 1000))
      }
    } else {
      termApp = appManager.get(appId)
      if (!termApp) return `未找到 appId 为 ${appId} 的终端`
      // 只能操作属于自己列表的终端
      if (termApp.data.listId !== currentListId) {
        return "权限不足：该终端不属于当前智能体会话列表。"
      }
      // 更新工具上下文
      await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId, deferredFns })
    }

    // 广播 app:active 聚焦/打开终端窗口
    if (appManager.io) {
      appManager.io.emit("app:active", { appId: termApp.id })
    }

    // 写入命令
    const data = command + "\r"
    await appManager.dispatch(termApp.id, "write", { data })

    // 等待输出稳定：静默3秒无输出提前返回，兜底 waitSec 秒
    await new Promise((res) => {
      let t1 = null
      let t2 = null
      let disposer = null

      const done = () => {
        clearTimeout(t1)
        clearTimeout(t2)
        if (disposer) disposer.dispose()
        res()
      }

      const session = terminalBackend.getSession(termApp.id)
      if (!session?.shell) return res()

      t2 = setTimeout(done, waitSec * 1000)
      disposer = session.shell.onData(() => {
        clearTimeout(t1)
        t1 = setTimeout(done, 3000)
      })
      t1 = setTimeout(done, 3000)
    })

    // 读取最新输出
    const contentRes = await appManager.dispatch(termApp.id, "getContent", { limit: 20 })
    const lastLines = contentRes?.data?.content || ""

    // 清理工具上下文
    await appManager.dispatch(termApp.id, "setToolContext", { toolCallGroupId: null, deferredFns: null })

    const commentSuffix = userConfirm.comment ? `。用户备注：${userConfirm.comment}` : ""
    return `命令已发送，静默检测后(最大${waitSec}s)的最新20行最后1000字输出如下：<terminal>\n${lastLines}</terminal>${commentSuffix}`
  },

  joi() {
    return Joi.object({
      appId: Joi.string().allow("-1", "").description("终端 appId，值为 -1 或留空则新建终端"),
      command: Joi.string().required().description("执行命令"),
      waitSec: Joi.number().default(10).description("最大等待秒数，默认10（静默3秒无输出会提前返回）"),
      argsDesc: Joi.string().required().description("必填，终端命令用途和参数说明（Markdown表格格式）")
    })
  },

  getDoc() {
    return `
      向指定终端 App 写入并执行命令
      系统会检测输出静默（3秒无新输出）自动返回结果
      waitSec为最大等待时间兜底，防止长时间阻塞
      argsDesc范例
      命令：df -h
      | 命令或参数 | 全称 | 说明 | 作用 |
      | :--- | :--- | :--- | :--- |
      | df | disk free | 磁盘 | 查看磁盘使用情况 |
      | -h | --human-readable | 人类可读格式 | 以易读的格式显示磁盘使用情况 |
      若结果发现终端未执行完毕，可以执行等待函数后重新读取终端内容
      使用 terminalGet 工具配合 limit 可查询截断前的终端内容
    `
  }
}
