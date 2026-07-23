import Box from "./box.js"

export default (dontClose) => {
  let fnClick = null

  return {
    data: {
      show: false,
      items: []
    },

    oninit({ attrs }) {
      if (attrs.show != null) {
        this.data.show = attrs.show
      }
    },

    view({ attrs, children }) {
      return m("", [
        this.data.show
          ? m(Box, {
              tagName: (attrs.tagName || "") + ".animated.fadeIn",
              color: "white",
              style: {
                display: "grid",
                width: "20rem",
                gridTemplateColumns: "1fr 1fr",
                flexDirection: "column",
                padding: 0,
                boxShadow: "0 0 1rem rgba(3,3,3,0.3)",
                ...attrs.style,
                padding: "0"
              },
              ext: {
                onclick: (e) => {
                  e.stopPropagation()
                },
                onmousedown: (e) => {
                  e.stopPropagation()
                },
                onmosueup: (e) => {
                  e.stopPropagation()
                },
                onmouseout: (e) => {
                  e.stopPropagation()
                },
                ontouchstart: (e) => {
                  e.stopPropagation()
                },
                onpointerdown: (e) => {
                  e.stopPropagation()
                },
                onpointerup: (e) => {
                  e.stopPropagation()
                },
                ...attrs.ext
              },
              oncreate: ({ dom }) => {
                if (attrs.atcreate) attrs.atcreate(dom)
                if (!dontClose) {
                  if (!fnClick) {
                    document.addEventListener("click", fnClick = (e) => {
                      this.data.show = false
                      fnClick = document.removeEventListener("click", fnClick)
                      m.redraw()
                    })
                  }
                }
              }
            }, [
              ...children
            ])
          : null
      ])
    }
  }
}
