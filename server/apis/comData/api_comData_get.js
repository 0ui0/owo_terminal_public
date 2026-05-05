import { trs } from "../../tools/i18n.js"
import comData from "../../comData/comData.js"

export default async () => {
  return {
    path: "/api/comData/get",
    method: "get",
    handler: async (req, h) => {
      //console.log(comData.data.get())
      try {
        return {
          ok: true,
          data: comData.data.get()
        }
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