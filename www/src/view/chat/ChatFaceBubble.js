import comData from "../../comData/comData.js"
import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"

export default () => {
  let timer = null
  let isHovered = false

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
          title: trs("通用/点击清除", { cn: "点击清除", en: "Click to dismiss" }),
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
          onmouseenter() {
            isHovered = true
          },
          onmouseleave() {
            isHovered = false
          },
          onclick: async (e) => {
            e.stopPropagation()
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            try {
              await comData.data.edit((d) => {
                d.faceAction = "none"
              })
              m.redraw()
            } catch (err) {
              console.error("[ChatFaceBubble] Click clear error:", err)
            }
          },
          style: {
            position: "absolute",
            top: "1rem",
            left: "50%",
            transform: isHovered ? "translateX(-50%) scale(1.05)" : "translateX(-50%) scale(1)",
            zIndex: 100,
            width: "12rem",
            height: "12rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.6rem",
            background: getColor("gray_4").back,
            borderRadius: "50%",
            border: `0.15rem solid ${getColor('main').back}`,
            boxSizing: "border-box",
            boxShadow: "0 0.8rem 2.4rem rgba(0, 0, 0, 0.25)",
            cursor: "pointer",
            pointerEvents: "auto",
            overflow: "hidden",
            transition: "transform 0.2s ease, opacity 0.2s ease"
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
                objectFit: "contain",
                filter: "drop-shadow(0 0.6rem 1.2rem rgba(0, 0, 0, 0.35))"
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
