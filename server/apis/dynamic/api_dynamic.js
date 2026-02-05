import Dir from "../../tools/dir.js"
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
          msg: "服务器内部错误"
        }
      }

    }
  }
}