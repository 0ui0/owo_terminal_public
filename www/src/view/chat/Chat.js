
import ChatList from "./ChatList.js"
import InputBar from "./ChatInputBar.js"
import SessionList from "./ChatSessionList.js"
import data from "./chatData.js"
import comData from "../../comData/comData.js"
import ChatVideo from "./ChatVideo.js"
import getSize from "../common/getSize.js"
import getColor from "../common/getColor.js"
import settingData from "../setting/settingData.js"

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
      const chatList = comData.getChatList(data.getSessionState(0).lockedListId) || comData.getChatList(0);

      return m("", {
        style: {
          width: "100%",
          height: "100%",
          padding: `${getSize(3)}rem`,
          boxSizing: "border-box",
          display: "flex",
          position: "relative",
          background: `linear-gradient(to top, ${getColor("gray_1").back} 0%, ${getColor("gray_1").back}00 35%), ${getColor("消息列表背景")}`,
          //alignItems:"center",

        }
      }, [
        //bg

        m(ChatVideo),
        //left
        !window.Mob ? m("", {
          style: {
            flex: `0 0 ${getSize(64)}rem`,
            //width:"20rem",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            borderRadius: `${getSize(8)}rem`,
            //border:"0.1rem solid #755d5c",
            marginRight: `${getSize(3)}rem`,
            //border:"0.1rem solid #755d5c",
          }
        }, [
          settingData.options?.get("global_actorSwitch") !== 1 ? m("", {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: "50%",
              border: `${getSize(0.25)}rem solid #755d5c`,
              background: getColor("gray_3").back,
              overflow: "hidden",
              height: `${getSize(63)}rem`,
              width: `${getSize(63)}rem`
            }
          }, [
            m("img", {
              style: { height: "100%" },
              src: `./statics/petPkgs/${comData.data.get()?.defaultPet || "default"}/pet/${comData.data.get()?.faceAction || "smile"}.png`,
              onupdate: (vnode) => {
                const current = comData.data.get()?.faceAction
                if (current && current !== "smile") {
                  if (vnode.state.timer) clearTimeout(vnode.state.timer)
                  vnode.state.timer = setTimeout(() => {
                    comData.data.edit(d => d.faceAction = "smile")
                    m.redraw()
                  }, 4000)
                }
              }
            }),

          ]) : null,
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
            minWidth:0,
          }
        }, [
          chatList
            ? m(ChatList,{
              key: chatList.id,
              chatList,
              listId: 0
            })
            : m.fragment({ key: "empty_chatList" }),
          m(InputBar, { 
            listId: 0,
            key: "inputBar"
          }),
          m("", {
            key:"face",
            style: {
              position: "absolute",
              width: "100%",
              height: "100%",
              opacity: "70%",
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