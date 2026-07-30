import Box from "./box.js";
import Tag from "./tag.js";

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
            backgroundColor: "#625B56",
            color: "#fff",
            margin: "1rem 0.5rem 0 0.5rem",
            padding: "0.6rem 1.5rem",
            borderRadius: "0.5rem 0.5rem 0 0",
            width: "fit-content",
            fontSize: "1.1rem",
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
            margin: "0 0.5rem 1rem 0.5rem",
            padding: "none",
            borderRadius: "0 1rem 1rem 1rem",
            ...(styleContent || {})
          }
        },
        [
          children,
          description ? m(Tag,
          {
            styleExt: {
              color: "#999",
              marginBottom: "1rem",
              borderRadius: "0.5rem",
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
