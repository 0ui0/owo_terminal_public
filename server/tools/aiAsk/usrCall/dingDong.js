import Joi from "joi"
export default {
  name:"叮咚",
  id:"dingDong",
  fn(argObj){
    let {value,error} = this.joi().validate(argObj)
    if(error){
      return "错误："+error.details[0].message
    }
    let {a,b} = value
    return `叮咚${a} ${b}`
  },
  joi(){
    return Joi.object({
      a:Joi.number().required(),
      b:Joi.number().required()
    })
  },
  getDoc(){
    return `叮咚函数 输入2个数字，返回字符串`
  }
}