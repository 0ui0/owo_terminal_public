import Joi from "joi"
import Dir from "../../dir.js"
import fs from "fs/promises"
import pathLib from "path"
import waitConfirm from "../../waitConfirm.js"
export default {
  name: "创建自定义函数",
  id: "createFn",
  id: "createFn",
  async fn(argObj, metaData) {
    try {
      let { value, error } = this.joi().validate(argObj)
      if (error) {
        return "错误：" + error.details[0].message
      }

      //测试joi
      try {
        let tmpJoi = new Function("Joi", value.joi)
        let { error } = tmpJoi(Joi).validate(value.testArgObj)
        if (error) {
          return "用testArgObj测试joi检查未通过：" + error.details[0].message
        }
      }
      catch (err) {
        console.log(err)
        return "用testArgObj测试joi失败，请检查测试数组或joi定义：" + err
      }


      let fnStr = `
import Joi from "joi"
export default {
  name:"${value.name}",
  id:"${value.id}",
  fn(argObj){
    ${value.fn}
  },
  joi(){
    ${value.joi}
  },
  getDoc(){
    return \`${value.doc}\`
  }
}`

      const currentListId = metaData?.listId || 0;
      let userConfirm = await waitConfirm({
        type: "text",
        content: fnStr,
        title: `是否创建文件 ${value.id}.js`,
        listId: currentListId
      })

      if (!userConfirm) {
        return `用户主动拒绝，请先中断`
      }




      let dir = new Dir("./tools/aiAsk/aiCall")
      let filePath = pathLib.resolve(dir.pwd() + `/${value.id}.js`)
      let hasFile = null

      try { hasFile = await fs.stat(filePath) }
      catch (err) { hasFile = false }
      if (hasFile) {
        return "函数已存在"
      }
      await fs.writeFile(filePath, fnStr)
      return `自定义函数 ${value.name} 创建成功`
    }
    catch (err) {
      console.log(err)
      return `创建失败：${err.message}`
    }

  },
  joi() {
    return Joi.object({
      name: Joi.string().min(1).max(15).required().description("中文函数名,范例：求和函数"),
      id: Joi.string().min(1).max(15).pattern(/^[a-zA-Z0-9_]+$/).required().description("英文函数名做id，范例：sumFn"),
      fn: Joi.string().required().description(`函数本体字符串，将使用new Function("argObj",本字段值)创建，范例：
let {error,value} = this.joi().validate(argObj)
if(error){
  return "错误："+error.details[0].message
}
let {a,b} = value
return "求和结果\${a}+\${b}"`),
      joi: Joi.string().required().description(`joi校验函数体字符串，也将使用new Function(Joi,本字段值)创建，注只支持对象参数argObj，所以顶层必须是Joi.object。范例：
return Joi.object({
  x1:Joi.number(),
  x2:Joi.number(),
})`),
      doc: Joi.string().required().description(`说明文档 范例：返回两个数字的和`),
      testArgObj: Joi.object().required().description("构建一个能通过测试用的argObj参数对象用于测试joi函数是否正常")
    })
  },
  getDoc() {
    return `创建你的自定义工具函数，若创建成功但运行时出错，可用删除工具函数删除再重建。系统将拼接你传入的字符串生成类似如下的对象
{name:"求和函数",id:"sumFn",fn(argObj){//你写的函数体},joi(Joi){//你写的joi函数体},getDoc(){return "#你写的doc"}}
注意name和id不能和现有函数重复`
  }
}