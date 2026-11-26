import Box from "./box.js"
import getColor from "./getColor.js"
import getSize from "./getSize.js"

export default {
  data: {
    list: []
  },

  launch(msg, time = 1000) {
    this.data.list.push({
      id: Date.now(),
      msg: msg,
      timer: setTimeout(() => {
        this.data.list.shift()
        m.redraw()
      }, time)
    })
  },

  view() {
    if (this.data.list.length > 0) {
      return m(".animated",
        {
          onbeforeremove: ({ dom }) => {
            dom.classList.add("fadeOut")
            return new Promise((res) => {
              setTimeout(() => {
                res()
              }, 1000)
            })
          },
          style: {
            position: "fixed",
            top: `${getSize(13)}rem`,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 999999999999
          }
        },
        [
          this.data.list.map((item) =>
            m(".animated",
              {
                key: item.id,
                onbeforeremove: ({ dom }) => {
                  dom.classList.add("fadeOutUp")
                  return new Promise((res) => {
                    setTimeout(() => {
                      res()
                    }, 1000)
                  })
                }
              },
              [
                m(Box,
                  {
                    style: {
                      backdropFilter: `blur(${getSize(3)}rem)`,
                      "-webkit-backdrop-filter": `blur(${getSize(3)}rem)`,
                      padding: 0,
                      border: `${getSize(1)}rem dashed ${getColor("main").back}`,
                      background: getColor("gray_4").back
                    },
                    tagName: ".animated .fadeInDown"
                  },
                  [
                    m(Box,
                      {
                        style: {
                          color: getColor("gray_4").front,
                          background: "none"
                        }
                      },
                      item.msg
                    )
                  ]
                )
              ]
            )
          )
        ]
      )
    }
  }
}
