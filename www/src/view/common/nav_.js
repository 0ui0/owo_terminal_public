export default ()=>{
  return {
    view({attrs}){
      return m("",{
        style:{
          position:"fixed",
          bottom:0,
          borderTop:"0.1rem solid #755d5c",
          borderRadius:"3rem",
          margin:"1rem"
        }
      },[
        m("",{
          style:{
            width:"5rem",
            height:"5rem",
            margin:"1rem",
            background:"url(./statics/logo2.svg)"
          }
        })
      ])
    }
  }
}