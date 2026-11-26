import Session from "./ChatSession.js"
import getSize from "../common/getSize.js"

export default ()=>{
  return {
    view(){
      return m("",{
        style:{
          disply:"flex",
          flexDirection:"column",
          borderRadius:`${getSize(8)}rem`,
          background:"#755d5c55",
          margin:`${getSize(4)}rem ${getSize(2)}rem`,
          padding:`${getSize(4)}rem`,
        }
      },[
        m("",{
          style:{
            fontSize:`${getSize(4)}rem`,
            margin:`${getSize(2)}rem 0`,
            color:"#333",
            fontWeight:"bold"
          }
        },"会话列表"),
        m(Session),
      ])
    }
  }
}