import Joi from "joi"
export default {
  name:"等待",
  id:"waitMs",
  async fn(argObj){
    let {value,error} = this.joi().validate(argObj)
    if(error){
      return "错误："+error.details[0].message
    }
    let {ms} = value
    return await new Promise((res)=>{
      setTimeout(()=>{
        res(`已等待${ms}`)
      },ms)
    })
  },
  joi(){
    return Joi.object({
      ms:Joi.number().min(1).max(5*60*1000).required()
    })
  },
  getDoc(){
    return `等待指定毫秒数`
  }
}