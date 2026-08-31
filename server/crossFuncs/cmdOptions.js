import defaultOptions from "../db/init/defaultOptions.js"
import options from "../config/options.js"
import db from "../db/db.js"
import { Op } from "sequelize"
import subAgents from "../tools/aiAsk/subAgents.js"
import comData from "../comData/comData.js"
import { trs } from "../tools/i18n.js"
import crypto from "crypto"
export default {
  name: "cmdOptions",
  func: async (newOptions) => {
    try {
      let { error } = Joi.array().ordered(
        Joi.array().items(Joi.object({
          optionId: Joi.number().required(),
          key: Joi.string().required(),
          value: Joi.any().required(),
        }).unknown(true))
      ).validate([newOptions ?? []])
      if (error) {
        throw error
      }
      let rows = await db.tb_options.findAll()
      if (!rows) {
        return {
          ok: false,
          msg: trs("crossFuncs/错误/配置表数据异常")
        }
      }
      if (!newOptions || (newOptions && newOptions.length == 0)) {
        return {
          ok: true,
          msg: trs("crossFuncs/消息/获取成功"),
          data: rows
        }
      }

      for (let i = 0; i < newOptions.length; i++) {
        const newOption = newOptions[i]

        // ai_aiList 特殊处理：id 由后端签发——无 id（新增/导入）分配新 uuid，
        // 带 id 必须是原列表已有的（防篡改），且不能重复
        if (newOption.key === "ai_aiList" && Array.isArray(newOption.value)) {
          const oldList = rows.find(r => r.key === "ai_aiList").value
          const oldIds = new Set(oldList.map(m => m.id))
          const seen = new Set()
          newOption.value.forEach(item => {
            if (!item.id) {
              item.id = crypto.randomUUID()
            } else if (!oldIds.has(item.id)) {
              throw new Error(`未知模型 id: ${item.id}`)
            }
            if (seen.has(item.id)) {
              throw new Error(`重复模型 id: ${item.id}`)
            }
            seen.add(item.id)
          })
        }

        // 校验并采用 validate 后的值（Joi 的 .default() 等转换才会真正生效）
        let { error: error2, value: validatedValue } = defaultOptions[newOption.key].joi().validate(newOption.value)
        if (error2) {
          return {
            ok: false,
            msg: error2.details[0].message,
          }
        }
        newOption.value = validatedValue
      }

      await db.db.transaction(async (t) => {
        let findOptions = await db.tb_options.findAll({
          where: {
            optionId: {
              [Op.or]: newOptions.map(v => v.optionId)
            }
          },
          transaction: t
        })
        for (let i = 0; i < findOptions.length; i++) {
          let findOption = findOptions[i]
          let newOption = newOptions.find(v => v.optionId == findOption.optionId)
          findOption.value = newOption.value
          await findOption.save({ transaction: t })
        }
      })

      await options.pull();

      return {
        ok: true,
        msg: trs("crossFuncs/消息/更新成功"),
      }



    }
    catch (error) {
      console.log(error)
      return {
        ok: false,
        msg: trs("API/错误/服务器内部错误")
      }
    }

  }
}