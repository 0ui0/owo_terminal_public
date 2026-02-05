import Tag from "./tag.js"
export default () => {

  return {
    view({ children,attrs }) {
      attrs.iconConfig ??= {}
      return m(Tag, {
        styleExt: {
          background:attrs.bgColor ?? "#7c5d01",//#6c607a
          color: attrs.fgColor ?? "#111",
          display: "inline-flex",
          alignItems: "center",
          marginLeft: attrs.align == "right" ? "0.5rem":"0",
          marginRight: attrs.align == "right" ? "0":"0.5rem",
          ...attrs.styleExt,
        },
        isBtn: attrs.isBtn ?? true,
        ext:{
          ...attrs.ext,
        },
      }, [
        m.trust(window.iconPark.getIcon(attrs.iconName, {
          fill: attrs.fgColor ?? "#111",
          ...attrs.iconConfig
        })),
        ...children
      ])
    }
  }
}