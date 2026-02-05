import Box from "../common/box.js"
import AutoForm from "../common/autoForm.js"
import data from "./settingData.js"
import Notice from "../common/notice.js"
import { BackgroundColor, FontSize } from "@icon-park/svg"

export default ()=>{
  let currentGroup = ["全局","人工智能","大模型"]
  return {
    
    async oninit({attrs}){
      attrs.noticeConfig.confirm = async()=>{
        try{
          console.log("data.options.data",data.options.data)

          let tmp = await data.fnCall("cmdOptions",[data.options.data])

          Notice.launch({
            msg:tmp.msg
          })

          await data.options.pull()
          return true
        }
        catch(err){
          console.log(err)
        }
      }
      try{
        await data.initSocket()
        await data.options.pull()
        m.redraw()
      }
      catch(error){
        console.log(error)
      }
    },
    view(){
      //这里data.options.data可能因为重新拉取数据而导致引用不再是同一个
      let groups = {}
      if(data.options.data.length>0){
        for(let i=0;i<data.options.data.length;i++){
          let option = data.options.data[i]
          groups[option.group1] ??= {}
          groups[option.group1][option.group2] ??= {}
          groups[option.group1][option.group2][option.group3] ??= []
          if(!groups[option.group1][option.group2][option.group3].find((item)=>item.optionId == option.optionId)){
            groups[option.group1][option.group2][option.group3].push(option)
          }
        }
      }

      return m("",{
        style:{
          display:"flex",
        }
      },[
        //left
        m(Box,{
          style:{
            display:"flex",
            flexDirection:"column",
            background:"#43424d",
            borderRadius:"3rem 1rem 1rem 3rem",
            marginRight:0,
          }
        },[
          Object.entries(groups).map(([name1,nextGroup])=>{
            return m("",[
              m(Box,{
                isBtn:true,
                style:{
                  background:"transparent",
                  fontSize:"2rem",
                  borderLeft:"0.4rem solid #7b5d00",
                  borderRadius:"0.2rem 0 0 0.2rem",
                  padding:"0.2rem 0 0.2rem 1rem"
                }
              },name1),
              m(Box,{
                color:"brown",
                style:{
                  padding:"0",
                  display:"flex",
                  flexDirection:"column",
                }
              },[
                Object.entries(nextGroup).map(([name2,nextGroup])=>{
                  return m(Box,{
                    style:{
                      padding:"0",
                      display:"flex",
                      flexDirection:"column", 
                    }
                  },[
                    m(Box,{
                      isBtn:true,
                    },name2),
                    Object.entries(nextGroup).map(([name3,option])=>{
                      return m(Box,{
                        color:"brown",
                        style:{
                          display:"flex",
                          flexDirection:"column",
                          padding:"0",
                        }
                      },[
                        
                        m(Box,{
                          isBtn:true,
                          onclick:()=>{
                            currentGroup = [name1,name2,name3]
                          }
                        },name3)
                      ])
                    }),

                  ])
                })

              ])
            ])
          })
        ]),
        //right
        m(Box,{
          style:{
            background:"#31302f",
            borderRadius:"1rem 3rem 3rem 1rem"
          }
        },[
          groups[currentGroup[0]]?.[currentGroup[1]]?.[currentGroup[2]]?.map((option)=>{
            return m("",[
              m(Box,{
                style:{
                  fontWeight:"bold",
                  background:"none",
                  marginLeft:0,
                  padding:"0.2rem 0.5rem",
                  borderRadius:"0.2rem 0 0 0.2rem",
                  //borderLeft:"0.4rem solid #a75e5e",
                }
              },[
                option.name
              ]),
              m(AutoForm,{
                dataObj:option,
                dataName:"value",
                extEditMode:true,
              })
            ])
          })

        ])

      ])
    },
  }
}