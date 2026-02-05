import Dir from "../../tools/dir.js"
import { trs } from "../../tools/i18n.js"

export default async () => {
  return {
    path: "/api/dynamic",
    method: "get",
    handler: async (req, h) => {
      try {
        return h.file("./comData/dynamicData.js")
      }
      catch (err) {
        console.log(err)
        return {
          ok: false,
          msg: trs("API/错误/服务器内部错误")
        }
      }

    }
  }
}