import Dir from "../../tools/dir.js"
import { trs } from "../../tools/i18n.js"
export default async () => {
  return {
    path: "/api/cross",
    method: "post",
    options: {
      validate: {
        payload: Joi.object({
          name: Joi.string(),
          params: Joi.array().items(Joi.any()),
        }),
      },
    },
    handler: async (req, h) => {
      let que = req.payload
      try {
        let crossFuncsDir = new Dir("./crossFuncs")

        let crossFuncsFile = await crossFuncsDir.ls()
        for (let i = 0; i < crossFuncsFile.length; i++) {
          let fileName = crossFuncsFile[i]
          if (fileName.endsWith(".js")) {

            let { default: crossFunc } = await import(`../../crossFuncs/${fileName}`)
            if (crossFunc && crossFunc.name == que.name) {
              let params = que.params || []
              let result = await crossFunc.func(...params)
              return result
            }
          }
        }
        return {
          ok: false,
          msg: trs("API/错误/找不到函数")
        }
      }
      catch (err) {
        // console.log(err)
        return {
          ok: false,
          msg: trs("API/错误/函数执行错误")
        }
      }

    }
  }
}