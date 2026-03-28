import { v4 as uuidV4 } from "uuid"
import comData from "../comData/comData.js"
import Joi from "joi"


export default async (config) => {
  let { value, error } = Joi.object({
    id: Joi.string().default(uuidV4()),
    type: Joi.string().required().valid("tip", "text"),
    content: Joi.string().required(),
    title: Joi.string().required(),
    argsDesc: Joi.string().allow('').description("参数说明Markdown表格"),
    confirm: Joi.string().default("pending"),
    comment: Joi.string().allow('').default(""),
    listId: Joi.number().default(0)
  }).validate(config)
  if (error) {
    console.error("【waitConfirm错误】")
    throw error
  }

  let confirmCmd = value
  const listId = value.listId;

  await comData.data.edit((data) => {
    // Push to specific list
    const list = data.chatLists.find(l => l.id === listId);
    if (list) {
      list.confirmCmds.push(confirmCmd)
    } else {
      // Fallback or error? For now fallback to list 0 if not found, or log error
      console.error(`waitConfirm: List ${listId} not found`)
    }
  })

  let result = await new Promise((res, rej) => {
    let check = () => {
      const list = comData.data.get().chatLists.find(l => l.id === listId);
      if (!list) {
        // 列表可能已被删除，异常结束
        res({ ok: false, comment: "" });
        return;
      }
      let _confirmCmd = list.confirmCmds.find(_confirmCmd => _confirmCmd.id === confirmCmd.id)

      if (!_confirmCmd) {
        // 指令可能已被外力移除，异常结束
        res({ ok: false, comment: "" });
        return;
      }

      if (_confirmCmd.confirm === "no") {
        res({ ok: false, comment: _confirmCmd.comment || "" })
      }
      else if (_confirmCmd.confirm === "yes") {
        res({ ok: true, comment: _confirmCmd.comment || "" })
      }
      else {
        setTimeout(check, 100)
      }
    }
    check()
  })

  return result

}