import comData from "../../comData/comData.js"
import settingData from "../setting/settingData.js"

export default () => {

  return {
    view({ attrs }) {
      const playFaces = comData.data.get()?.playFaces
      console.log(playFaces)

      return m("", {
        style: {
          width: "100%",
          height: "100%",
          position: "absolute",
          left: 0,
          top: 0,
        }
      }, [
        /* comData.data.get()?.playFaces?.list.map((face,index)=>{
          return m("",{
            style:{
              position:"absolute",
              top:0,
              left:0,
              width:"100%", //2048 1024
              height:"100%", //1536 768
              backgroundImage:comData.data.get()?.playFaces?.index == index ?
                `url(./statics/pet2/${face}.gif)`:"",
              backgroundImage:`url(./statics/pet2/${face}.gif)`,
              //backgroundImage:`url(./statics/pet2/宅喵3d透明.png)`,
              backgroundRepeat:"no-repeat",
              backgroundPosition:"left bottom",
              backgroundSize:"auto 100%",
              //transition:"all ease 1s",
              opacity:comData.data.get()?.playFaces?.index == index ? 1 : 0
            }
          })
        }) */
        settingData.options?.get("global_actorSwitch") === 1
          ? playFaces?.current
            ? m("video", {
              onupdate({ dom }) {
                dom.play().catch(e => console.warn("[play current]", e))
              },
              oncreate({ dom }) {
                dom.play().catch(e => console.warn("[play current]", e))
                dom.onended = async () => {
                  await comData.data.edit((data) => {
                    data.playFaces.current = ""
                  })
                }
                dom.onerror = async () => {
                  console.warn("[current video error, resetting]")
                  await comData.data.edit((data) => {
                    data.playFaces.current = ""
                  })
                }
              },
              style: {
                width: "100%",
                height: "100%",
                position: "absolute",
                top: 0,
                left: 0,
                objectFit: "contain",
                objectPosition: "left center",
              },
              controls: false,
              muted: true,
              playsinline: true,
              "webkit-playsinline": true,
              src: `./statics/petPkgs/${comData.data.get()?.defaultPet || "default"}/pet2/${playFaces.current}.webm`,
            })
            : comData.data.get()?.playFaces?.list.map((face, index) => {
              return m("video", {
                key: `lst-${comData.data.get()?.defaultPet}-${face}-${index}`,
                onupdate({ dom }) {
                  if (index === comData.data.get().playFaces.index) {
                    dom.play().catch(e => console.warn("[play list]", e))
                  }
                },
                oncreate({ dom }) {

                  if (index === comData.data.get().playFaces.index) {
                    dom.play().catch(e => console.warn("[play list oncreate]", e))
                  }
                  dom.onended = async () => {
                    await comData.data.edit((data) => {
                      let index = data.playFaces.index
                      data.playFaces.index = (index + 1) % data.playFaces.list.length
                    })
                  }
                  dom.onerror = async () => {
                    console.warn(`[video error] skipping: ${face}`)
                    await comData.data.edit((data) => {
                      data.playFaces.index = (data.playFaces.index + 1) % data.playFaces.list.length
                    })
                  }
                },
                style: {
                  width: "100%",
                  height: "100%",
                  opacity: playFaces?.index == index ? 1 : 0,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  objectFit: "contain",
                  objectPosition: "left center",
                  //transition:"opacity 0.1s ease"
                },
                controls: false,
                muted: true,
                playsinline: true,
                "webkit-playsinline": true,
                src: `./statics/petPkgs/${comData.data.get()?.defaultPet || "default"}/pet2/${face}.webm`,

              })

            })
          : null,


      ])


    }
  }
}