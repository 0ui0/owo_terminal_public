import defaultOptions from "../db/init/defaultOptions.js"
import options from "../config/options.js"
import db from "../db/db.js"
import { Op } from "sequelize"
import aiBasic from "../tools/aiAsk/basic.js"
import comData from "../comData/comData.js"
import { trs } from "../tools/i18n.js"

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
        let { error: error2 } = defaultOptions[newOption.key].joi().validate(newOption.value)
        if (error2) {
          return {
            ok: false,
            msg: error2.details[0].message,
          }
        }
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

      await options.pull() //这两个顺序不能对调
      await aiBasic.initList()

      /* await comData.data.edit(data => {
        data.currentModel = ""
      }) */

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