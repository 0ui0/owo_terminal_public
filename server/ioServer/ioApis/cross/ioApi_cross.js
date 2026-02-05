import Dir from "../../../tools/dir.js"
export default ({socket, server, io, db, verifyCookie}) => {
    //权限判定
    socket.on("cross", async(que, callback) => {
      try {
        let {error} = Joi.object({
          name:Joi.string(),
          params:Joi.array(),
        }).validate(que)
        if(error){
          throw error
        }

        let crossFuncsDir = new Dir("./crossFuncs")

        let crossFuncsFile = await crossFuncsDir.ls()
        for (let i = 0; i < crossFuncsFile.length; i++) {
          let fileName = crossFuncsFile[i]
          if(fileName.endsWith(".js")){

            let {default:crossFunc} = await import(`../../../crossFuncs/${fileName}`)
            if(crossFunc.name == que.name){
              let result = await crossFunc.func(...que.params)
              socket.emit("cross", {
                name:que.name,
                return:result
              })
              callback(result)
            }
          }
          
        }

      } catch (error) {
        console.log(error)
        callback({
          ok:false,
          msg:"函数调用错误"
        })
      }
    })
  }