import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"

export default () => {
  let timer = null
  let isHovered = false

  return {
    oncreate(vnode) {
      timer = setTimeout(() => {
        vnode.attrs.delete?.()
        m.redraw()
      }, 3500)
    },
    onremove() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
    view(vnode) {
      const { url } = vnode.attrs || {}
      if (!url) {
        return null
      }

      return m(
        "",
        {
          title: trs("通用/点击清除", { cn: "点击清除", en: "Click to dismiss" }),
          onmouseenter() {
            isHovered = true
          },
          onmouseleave() {
            isHovered = false
          },
          onclick: (e) => {
            e.stopPropagation()
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            vnode.attrs.delete?.()
          },
          style: {
            width: "20rem",
            height: "20rem",
            margin: "0.5rem auto",
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
            overflow: "hidden",
            transform: isHovered ? "scale(1.05)" : "scale(1)",
            transition: "transform 0.2s ease"
          }
        },
        [
          m(
            "img",
            {
              src: url,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 0.6rem 1.2rem rgba(0, 0, 0, 0.35))"
              },
              onerror: () => {
                console.warn(`[ChatFaceBubble] Failed to load expression image: ${url}`)
                vnode.attrs.delete?.()
              }
            }
          )
        ]
      )
    }
  }
}
