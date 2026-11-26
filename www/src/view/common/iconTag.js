import Tag from "./tag.js"
import getColor from "./getColor.js"
import getSize from "./getSize.js"

export default () => {

  return {
    view({ children, attrs }) {
      attrs.iconConfig ??= {}
      return m(Tag, {
        styleExt: {
          background: attrs.bgColor ?? getColor("yellow_1").back,//#6c607a
          color: attrs.fgColor ?? getColor("yellow_1").front,
          display: "inline-flex",
          alignItems: "center",
          gap: `${getSize(1)}rem`,
          marginLeft: attrs.align == "right" ? `${getSize(1)}rem` : "0",
          marginRight: attrs.align == "right" ? "0" : `${getSize(1)}rem`,
          ...attrs.styleExt,
        },
        isBtn: attrs.isBtn ?? true,
        ext: {
          ...attrs.ext,
        },
      }, [
        m.trust(window.iconPark.getIcon(attrs.iconName, {
          fill: attrs.fgColor ?? getColor("yellow_1").front,
          size: `${getSize(4)}rem`,
          ...attrs.iconConfig
        })),
        ...children
      ])
    }
  }
}