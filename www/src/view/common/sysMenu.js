import m from "mithril"
import Box from "./box.js"
import getColor from "./getColor.js"

export default () => {
  return {
    view(vnode) {
      const items = vnode.attrs.menuItems || []
      return m(Box,
        {
          style: {
            display: "flex",
            flexDirection: "column",
            padding: "0.5rem"
          }
        },
        items.map((item, idx) => {
          if (!item) return null
          if (item === "sep" || item.isSep) {
            return m("div",
              {
                key: "sep_" + idx,
                style: {
                  height: "1px",
                  background: "rgba(128, 128, 128, 0.2)",
                  margin: "0.4rem 0"
                }
              }
            )
          }

          return m("",
            {
              key: item.id || item.name || ("item_" + idx),
              style: {
                padding: "0.8rem 1.0rem",
                margin: "0.1rem 0",
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderRadius: "1.0rem",
                background: "transparent",
                fontSize: "1.3rem",
                cursor: "pointer",
                userSelect: "none",
                transition: "background 0.15s ease"
              },
              onpointerenter: function () {
                this.style.background = getColor("gray_3").back
              },
              onpointerleave: function () {
                this.style.background = "transparent"
              },
              onclick: (e) => {
                if (typeof item.onclick === "function") {
                  item.onclick(e, item, vnode)
                }
              }
            },
            [
              m("span", item.name || item.label
              ),
              item.shortcut ? m("span",
                {
                  style: {
                    opacity: 0.5,
                    fontSize: "1.2rem",
                    marginLeft: "1.0rem",
                    float: "right",
                    fontFamily: "monospace"
                  }
                },
                item.shortcut
              ) : null
            ]
          )
        })
      )
    }
  }
}
