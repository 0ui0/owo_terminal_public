import Session from "./ChatSession"
export default ()=>{
  return {
    view(){
      return m("",{
        style:{
          disply:"flex",
          flexDirection:"column",
          borderRadius:"3rem",
          background:"#755d5c55",
          margin:"2rem 1rem",  
          padding:"2rem",
        }
      },[
        m("",{
          style:{
            fontSize:"2rem",
            margin:"1rem 0",
            color:"#333",
            fontWeight:"bold"
          }
        },"会话列表"),
        m(Session),
      ]) 
    }
  }
}