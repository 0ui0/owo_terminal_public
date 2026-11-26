import Box from "./box.js";
import Tag from "./tag.js";
import getColor from "./getColor.js";
import getSize from "./getSize.js";

var FormItem;

FormItem = function() {
  return {
    view: function({attrs, children}) {
      var description, label, styleContent, styleDescription, styleLabel;
      ({label, description, styleLabel, styleContent, styleDescription} = attrs);
      return m.fragment([
        // 标题部分 (上方 Box)
        label ? m(Box,
        {
          style: {
            backgroundColor: getColor("brown_2").back,
            color: getColor("brown_2").front,
            margin: `${getSize(3)}rem ${getSize(1)}rem 0 ${getSize(1)}rem`,
            padding: `${getSize(2)}rem ${getSize(4)}rem`,
            borderRadius: `${getSize(2)}rem ${getSize(2)}rem 0 0`,
            width: "fit-content",
            fontSize: `${getSize(3)}rem`,
            fontWeight: "bold",
            boxShadow: "none",
            ...(styleLabel || {})
          }
        },
        label) : void 0,
        
        // 内容与描述部分 (下方 Box)
        m(Box,
        {
          style: {
            margin: `0 ${getSize(1)}rem ${getSize(3)}rem ${getSize(1)}rem`,
            padding: "none",
            borderRadius: `0 ${getSize(3)}rem ${getSize(3)}rem ${getSize(3)}rem`,
            ...(styleContent || {})
          }
        },
        [
          children,
          description ? m(Tag,
          {
            styleExt: {
              color: getColor("gray_4").front,
              marginBottom: `${getSize(3)}rem`,
              borderRadius: `${getSize(2)}rem`,
              ...(styleDescription || {})
            }
          },
          description) : void 0
        ])
      ]);
    }
  };
};

export default FormItem;
