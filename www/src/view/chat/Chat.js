
import ChatList from "./ChatList.js"
import InputBar from "./ChatInputBar.js"
import SessionList from "./ChatSessionList.js"
import data from "./chatData.js"
import comData from "../../comData/comData.js"
import ChatVideo from "./ChatVideo.js"
export default () => {

  return {
    async oninit() {
      try {
        await comData.pullData()
      }
      catch (err) {
        throw err
      }
    },
    view() {
      const playFaces = comData.data.get()?.playFaces
      const playDoms = []

      return m("", {
        style: {
          width: "100%",
          height: "100%",
          padding: "4rem",
          paddingBottom: "11rem",
          boxSizing: "border-box",
          display: "flex",
          position: "relative",

          //alignItems:"center",

        }
      }, [
        //bg
        m(ChatVideo),
        //left
        !window.Mob ? m("", {
          style: {
            flex: 1.5,
            //width:"20rem",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            borderRadius: "3rem",
            //border:"0.1rem solid #755d5c",
            marginRight: "2rem",
            //background:"#4a443f"
          }
        }, [
          m("", {
            style: {
              display: "flex",
              flexDirection: "column",
              //justifyContent:"center",
              alignItems: "center",
              borderRadius: "3rem",
              //border:"0.1rem solid #755d5c",
              //background:"#47464f",
              overflow: "hidden",
              height: "100%",
              width: "25rem"
            }
          }, [
            m("img", {
              style: {
                height: "100%",
              },
              //src:`./statics/pet/${comData.data.get()?.faceAction || "smile"}.png`,
            }),

          ]),
          //m(SessionList)
        ]) : null,
        //right
        m("", {
          style: {
            flex: 5,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            position: "relative",
            height: "100%",
            width: "100%",
          }
        }, [
          (() => {
            const targetId = comData.data.get()?.targetChatListId || 0;
            const targetList = comData.data.get()?.chatLists?.find(l => l.id === targetId);
            const mainList = comData.data.get()?.chatLists?.find(l => l.id === 0);
            return m(ChatList, {
              chatList: targetList || mainList,
            })
          })(),
          m(InputBar),
          m("", {
            style: {
              position: "absolute",
              width: "100%",
              height: "100%",
              backgroundImage: "url(statics/face2.svg)",
              backgroundPosition: "right bottom",
              backgroundRepeat: "no-repeat",
              backgroundSize: "50%",
              pointerEvents: "none"
            }
          })
        ]),




      ])
    }
  }
}