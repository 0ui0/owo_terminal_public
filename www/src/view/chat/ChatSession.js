export default ()=>{
  return {
    view(){
      return m("",{
        style:{
          width:"100%",
          borderBottom:"0.1rem solid #46413fff",
          marginBottom:"1rem",
          padding:"1rem",
          boxSizing:"border-box",
          borderRadius:"1rem 1rem 0 0",
          //background:"#47464f",
          color:"#111",
        }
      },[
        "我是会话"
      ])
    }
  }
}