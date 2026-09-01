import comData from "../../comData/comData.js"
import getColor from "../common/getColor.js"

export default () => {
  let timer = null

  return {
    onremove() {
      if (timer) {
        clearTimeout(timer)
      }
    },
    view() {
      const faceAction = comData.data.get()?.faceAction
      if (!faceAction || faceAction === "none") {
        return null
      }

      const defaultPet = comData.data.get()?.defaultPet || "default"

      return m(
        "",
        {
          key: `bubble-${defaultPet}-${faceAction}`,
          oncreate() {
            if (timer) {
              clearTimeout(timer)
            }
            timer = setTimeout(async () => {
              try {
                await comData.data.edit((d) => {
                  d.faceAction = "none"
                })
                m.redraw()
              } catch (e) {
                console.error("[ChatFaceBubble] Reset error:", e)
              }
            }, 3500)
          },
          style: {
            position: "absolute",
            left: "2rem",
            top: "2rem",
            zIndex: 99,
            width: "8rem",
            height: "8rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.8rem",
            background: getColor("gray_4").back,
            borderRadius: "3rem",
            boxShadow: "0 0.8rem 2.4rem rgba(0, 0, 0, 0.25)",
            pointerEvents: "none",
            overflow: "hidden",
            transition: "all 0.3s ease"
          }
        },
        [
          m(
            "img",
            {
              src: `./statics/petPkgs/${defaultPet}/pet/${faceAction}.png`,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "contain"
              },
              onerror: async () => {
                try {
                  console.warn(`[ChatFaceBubble] Missing expression: ${faceAction}`)
                  await comData.data.edit((d) => {
                    d.faceAction = "none"
                  })
                } catch (e) {
                  console.error("[ChatFaceBubble] Onerror reset failed:", e)
                }
              }
            }
          )
        ]
      )
    }
  }
}
