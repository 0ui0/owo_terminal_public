import getSize from "../common/getSize.js"

export default ()=>{
  return {
    view(){
      return m("",{
        style:{
          width:"100%",
          borderBottom:`${getSize(0.25)}rem solid #46413fff`,
          marginBottom:`${getSize(2)}rem`,
          padding:`${getSize(2)}rem`,
          boxSizing:"border-box",
          borderRadius:`${getSize(8)}rem ${getSize(8)}rem 0 0`,
          //background:"#47464f",
          color:"#111",
        }
      },[
        "我是会话"
      ])
    }
  }
}