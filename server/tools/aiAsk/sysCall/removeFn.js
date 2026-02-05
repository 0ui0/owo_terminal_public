import Joi from "joi"
import Dir from "../../dir.js"
import pathLib from "path"
import fs from "fs/promises"
export default {
  name:"删除自定义函数",
  id:"removeFn",
  async fn(argObj){
    let {value,error} = this.joi().validate(argObj)
    if(error){
      return "错误："+error.details[0].message
    }
    let fnid = value.id
    let dir = new Dir("./tools/aiAsk/aiCall")
    let filePath = pathLib.resolve(dir.pwd()+`/${fnid}.js`)

    let hasFile = null
    try{hasFile = await fs.stat(filePath)}
    catch(err){hasFile = false}
    if(!hasFile){
      return "函数不存在"
    }
    
    await fs.unlink(filePath)
    return `已删除函数 ${fnid}`

  },
  joi(){
    return Joi.object({
      id:Joi.string().pattern(/^[a-zA-Z0-9_]+$/).required().description("自定义函数id")
    })
  },
  getDoc(){
    return `删除指定id的函数`
  }
}