import { v4 as uuidV4 } from "uuid"
import comData from "../comData/comData.js"
import Joi from "joi"
import appManager from "../apps/appManager.js"


export default async (config) => {
  let { value, error } = Joi.object({
    id: Joi.string().default(uuidV4()),
    type: Joi.string().required().valid("tip", "text"),
    content: Joi.string().required(),
    title: Joi.string().required(),
    argsDesc: Joi.string().allow('').description("参数说明Markdown表格"),
    confirm: Joi.string().default("pending"),
    comment: Joi.string().allow('').default(""),
    listId: Joi.number().default(0),
    ext: Joi.object({
      identifier: Joi.string().required().description("必须传一个标识符，标注这是什么扩展数据"),
      toolId: Joi.string().description("如果是工具调用，需要传递工具id")
    }).unknown().default().description("通用扩展载荷")
  }).validate(config)
  if (error) {
    console.error("【waitConfirm错误】")
    throw error
  }

  let confirmCmd = value
  const listId = value.listId
  const toolId = value.ext?.toolId

  // 💡 权限短路判定：若当前会话将此工具配置为免确认白名单，直接放行，不推入 confirmCmds 且不唤起任何 App
  const currentList = comData.data.get()?.chatLists?.find(l => l.id === listId)
  if (currentList && toolId && Array.isArray(currentList.skipConfirmTools) && currentList.skipConfirmTools.includes(toolId)) {
    return { ok: true, comment: "" }
  }

  // 💡 根据列表设置项，决定是否要针对审核内容自动唤起编辑器弹窗
  // 未来会在 chatLists 增加 autoLaunchEditor 配置，这里提前预留支持
  const shouldAutoLaunchEditor = value.ext?.identifier === "app:editor" && currentList?.autoLaunchEditor === true
  let autoLaunchedAppIds = []

  if (shouldAutoLaunchEditor) {
    try {
      const files = Array.isArray(value.ext?.files) ? value.ext.files : []
      if (files.length > 0) {
        // 对每个文件模拟前端触发“打开编辑器”
        for (const file of files) {
          const launchRes = await appManager.launch("editor", {
            data: {
              confirmId: confirmCmd.id,
              fileId: file.fileId,
              filePath: file.path,
              originalContent: file.originalContent,
              proposedContent: file.proposedContent,
              isDiff: true,
              reason: value.ext.reason
            }
          })
          if (launchRes.ok && launchRes.app) {
            autoLaunchedAppIds.push(launchRes.app.id)
          }
        }
      }
    } catch (launchErr) {
      console.error("[waitConfirm] 自动启动编辑器异常:", launchErr)
    }
  }

  try {
    await comData.data.edit((data) => {
      // Push to specific list
      const list = data.chatLists.find(l => l.id === listId)
      if (list) {
        list.confirmCmds.push(confirmCmd)
      } else {
        // Fallback or error? For now fallback to list 0 if not found, or log error
        console.error(`waitConfirm: List ${listId} not found`)
      }
    })

    let result = await new Promise((res) => {
      let check = () => {
        const list = comData.data.get().chatLists.find(l => l.id === listId)
        if (!list) {
          // 列表可能已被删除，异常结束
          res({ ok: false, comment: "" })
          return
        }
        let _confirmCmd = list.confirmCmds.find(_confirmCmd => _confirmCmd.id === confirmCmd.id)

        if (!_confirmCmd) {
          console.warn(`[waitConfirm 竞态警报] 发现发出去的 confirmCmd (ID: ${confirmCmd.id}) 丢失了！`)
          // 指令可能已被外力移除，异常结束
          res({ ok: false, comment: "" })
          return
        }

        if (_confirmCmd.confirm === "no") {
          res({ ok: false, comment: _confirmCmd.comment || "", ext: _confirmCmd.ext })
        } else if (_confirmCmd.confirm === "yes") {
          res({ ok: true, comment: _confirmCmd.comment || "", ext: _confirmCmd.ext })
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    })

    return result
  } finally {
    // 垃圾回收：审批流程彻底结束（不管抛错与否），主动从共享内存中剔除本次决议，防止堆积泄露
    try {
      await comData.data.edit((data) => {
        const list = data.chatLists.find(l => l.id === listId)
        if (list && Array.isArray(list.confirmCmds)) {
          list.confirmCmds = list.confirmCmds.filter(c => c.id !== confirmCmd.id)
        }
      })
    } catch (cleanErr) {
      console.error(`[waitConfirm] 清理内存数据堆积失败 (ID: ${confirmCmd.id}):`, cleanErr)
    }

    // 无论批准、拒绝还是异常退出，仅销毁由本次自动流程派生的编辑器窗口
    // 绝不影响用户手动点开、或是其他流程中派生的窗口
    if (autoLaunchedAppIds.length > 0) {
      for (const appId of autoLaunchedAppIds) {
        try {
          await appManager.close(appId)
        } catch (closeErr) {
          console.error(`[waitConfirm] 销毁自动派生的编辑器异常 (${appId}):`, closeErr)
        }
      }
    }
  }
}