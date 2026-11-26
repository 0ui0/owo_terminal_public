import m from "/@npm/mithril.js"
import Box from "./box.js"
import getColor from "./getColor.js"
import getSize from "./getSize.js"

export default () => {
  return {
    view(vnode) {
      const items = vnode.attrs.menuItems || []
      return m(Box,
        {
          style: {
            display: "flex",
            flexDirection: "column",
            padding: `${getSize(1)}rem`
          }
        },
        items.map((item, idx) => {
          if (!item) return null
          if (item === "sep" || item.isSep) {
            return m("div",
              {
                key: "sep_" + idx,
                style: {
                  height: `${getSize(0.25)}rem`,
                  background: "rgba(128, 128, 128, 0.2)",
                  margin: `${getSize(1)}rem 0`
                }
              }
            )
          }

          return m("",
            {
              key: item.id || item.name || ("item_" + idx),
              style: {
                padding: `${getSize(2)}rem ${getSize(3)}rem`,
                margin: `${getSize(0.25)}rem 0`,
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderRadius: `${getSize(3)}rem`,
                background: "transparent",
                fontSize: `${getSize(3)}rem`,
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
                    fontSize: `${getSize(3)}rem`,
                    marginLeft: `${getSize(3)}rem`,
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
