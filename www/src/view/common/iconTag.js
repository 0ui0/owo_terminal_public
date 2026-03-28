import Tag from "./tag.js"
import getColor from "./getColor.js"

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
          marginLeft: attrs.align == "right" ? "0.5rem" : "0",
          marginRight: attrs.align == "right" ? "0" : "0.5rem",
          ...attrs.styleExt,
        },
        isBtn: attrs.isBtn ?? true,
        ext: {
          ...attrs.ext,
        },
      }, [
        m.trust(window.iconPark.getIcon(attrs.iconName, {
          fill: attrs.fgColor ?? getColor("yellow_1").front,
          ...attrs.iconConfig
        })),
        ...children
      ])
    }
  }
}