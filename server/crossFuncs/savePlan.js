import fs from "fs-extra"
import pathLib from "path"
import Joi from "joi"
import tempPath from "../tools/tempPath.js"

const planArgsSchema = Joi.object({
  chatUuid: Joi.string().required(),
  content: Joi.string().required(),
  title: Joi.string().allow("").optional(),
  fileName: Joi.string().allow("").optional(),
  listId: Joi.number().optional()
}).unknown(true)

export default {
  name: "savePlan",
  func: async (argObj = {}) => {
    try {
      const { error, value } = planArgsSchema.validate(argObj)
      if (error) {
        return { ok: false, msg: `参数校验失败: ${error.details[0]?.message}` }
      }

      const chatUuidStr = value.chatUuid.trim()
      const contentStr = value.content
      const rawTitleStr = (value.title || "").trim()
      const rawFileNameStr = (value.fileName || "").trim()

      const plansDirStr = tempPath.getUserPlansDir()

      let finalFileNameStr = ""

      if (rawFileNameStr) {
        const baseNameStr = pathLib.basename(rawFileNameStr)
        finalFileNameStr = baseNameStr.endsWith(".md") ? baseNameStr : `${baseNameStr}.md`
      } else {
        const safeTitleStr = rawTitleStr.replace(/[/\\:*?"<>|\r\n\t]/g, "").trim()
        if (safeTitleStr) {
          finalFileNameStr = `${chatUuidStr}_${safeTitleStr}.md`
        } else {
          finalFileNameStr = `${chatUuidStr}.md`
        }
      }

      let targetFilePathStr = pathLib.join(plansDirStr, finalFileNameStr)

      // 若遇同名文件自动递增序号，杜绝意外覆盖
      if (await fs.pathExists(targetFilePathStr)) {
        const parsedObj = pathLib.parse(finalFileNameStr)
        let seqNum = 1
        while (await fs.pathExists(targetFilePathStr)) {
          targetFilePathStr = pathLib.join(plansDirStr, `${parsedObj.name}_${seqNum}${parsedObj.ext}`)
          seqNum += 1
        }
      }

      await fs.writeFile(targetFilePathStr, contentStr, "utf-8")

      return {
        ok: true,
        msg: "计划书保存成功",
        data: {
          filePath: targetFilePathStr,
          fileName: pathLib.basename(targetFilePathStr)
        }
      }
    } catch (err) {
      console.error("[savePlan] 保存计划书异常:", err)
      return { ok: false, msg: `保存计划书失败: ${err.message}` }
    }
  }
}
