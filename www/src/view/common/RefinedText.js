import getColor from "./getColor.js";
import getSize from "./getSize.js";

var RefinedText;

RefinedText = function () {
  var isExpanded, textareaDom;
  isExpanded = false;
  textareaDom = null;
  return {
    view: function ({ attrs }) {
      var brownColor, dataName, dataObj, extEditMode, iconBtnStyle, mainColor, redColor, ref, value;
      ({ dataObj, dataName, extEditMode } = attrs);
      value = (ref = dataObj[dataName]) != null ? ref : "";

      // 颜色定义
      mainColor = getColor("main");

      // Brown Color Fallback
      brownColor = getColor("brown");
      if (!brownColor || brownColor.back === getColor("gray_4").back) {
        brownColor = getColor("brown_1") || { back: "#594F4C", front: "#ffffff" };
      }

      // Red Color Fallback
      redColor = getColor("red");
      if (!redColor || redColor.back === getColor("gray_4").back) {
        redColor = getColor("pink_1") || { back: "#F06258", front: "#ffffff" };
      }

      // 辅助样式函数
      iconBtnStyle = function (color, isHovered = false) {
        return {
          width: `${getSize(6)}rem`,
          height: `${getSize(6)}rem`,
          borderRadius: "50%",
          background: color.back,
          color: color.front,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          transition: "all 0.2s",
          opacity: 1, // 默认不使用透明度，防止产生堆叠上下文
          transform: isHovered ? "scale(1.1)" : "none",
          boxShadow: isHovered ? `0 ${getSize(1)}rem ${getSize(3)}rem rgba(0,0,0,0.15)` : "none",
          fontSize: `${getSize(3)}rem`
        };
      };
      return m("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          margin: `${getSize(1)}rem`,
          gap: `${getSize(1)}rem`
        }
      }, [
        // 标题层 (Title on top) - 可选
        attrs.label ? m("div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: `${getSize(2)}rem`,
              padding: `0 ${getSize(1)}rem`,
              marginBottom: `${getSize(0.5)}rem`
            }
          },
          [
            m("div",
              {
                style: {
                  width: `${getSize(1)}rem`,
                  height: `${getSize(3)}rem`,
                  background: mainColor.back,
                  borderRadius: `${getSize(1)}rem`,
                  boxShadow: `0 0 ${getSize(2)}rem ${mainColor.back}66`
                }
              }),
            m("span",
              {
                style: {
                  fontWeight: "bold",
                  fontSize: `${getSize(3)}rem`,
                  color: brownColor.front,
                  letterSpacing: `${getSize(0.25)}rem`
                }
              },
              attrs.label)
          ]) : void 0,

        // 交互层 (Vertical Stack)
        m("div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              background: getColor("确认框输入背景"),
              borderRadius: `${getSize(3)}rem`,
              border: `${getSize(0.5)}rem solid ` + getColor("确认框输入边框"),
              boxShadow: `0 ${getSize(2)}rem ${getSize(8)}rem rgba(0,0,0,0.03)`,
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              overflow: "hidden"
            }
          },
          [
            // Textarea 部分
            m("textarea",
              {
                style: {
                  width: "100%",
                  height: isExpanded ? "auto" : `${getSize(10)}rem`, // 进一步压缩高度
                  minHeight: isExpanded ? `${getSize(25)}rem` : `${getSize(10)}rem`,
                  boxSizing: "border-box",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  padding: `${getSize(1)}rem ${getSize(2)}rem`, // 减小内边距
                  color: getColor("确认框输入文字"),
                  resize: "none",
                  fontFamily: "inherit",
                  overflowY: "auto",
                  transition: "height 0.3s ease, background 0.3s ease"
                },
                placeholder: "请输入内容...",
                oncreate: function (vnode) {
                  return textareaDom = vnode.dom;
                },
                oninput: function (e) {
                  dataObj[dataName] = e.target.value;
                  if (isExpanded) {
                    e.target.style.height = 'auto';
                    return e.target.style.height = e.target.scrollHeight + 'px';
                  }
                },
                onfocus: function (e) {
                  e.target.parentNode.style.background = getColor("确认框输入背景");
                  e.target.parentNode.style.boxShadow = `0 ${getSize(2)}rem ${getSize(8)}rem rgba(${mainColor.back}33)`;
                  return e.target.parentNode.style.borderColor = `${mainColor.back}aa`;
                },
                onblur: function (e) {
                  var parsed,
                    val;
                  // 失焦时尝试转回数值，保持原始类型（但允许小数中间状态如 "12."）
                  val = dataObj[dataName];
                  if (typeof val === "string" && val !== "") {
                    parsed = Number(val);
                    if (!isNaN(parsed) && String(parsed) === val) {
                      dataObj[dataName] = parsed;
                    }
                  }
                  e.target.parentNode.style.background = getColor("确认框输入背景");
                  e.target.parentNode.style.boxShadow = `0 ${getSize(2)}rem ${getSize(8)}rem rgba(0,0,0,0.03)`;
                  return e.target.parentNode.style.borderColor = getColor("确认框输入边框");
                },
                value: value
              }),

            // 底部工具栏
            m("div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${getSize(1)}rem ${getSize(2)}rem`,
                  background: "rgba(255, 255, 255, 0.3)",
                  borderTop: `${getSize(0.25)}rem solid rgba(255, 255, 255, 0.5)`
                }
              },
              [
                // 左侧功能组 (Undo, Redo, Delete)
                m("div",
                  {
                    style: {
                      display: "flex",
                      gap: `${getSize(1)}rem`
                    }
                  },
                  [
                    dataObj.undo ? m("div",
                      {
                        style: iconBtnStyle(mainColor),
                        onmouseover: function (e) {
                          return Object.assign(e.currentTarget.style,
                            iconBtnStyle(mainColor,
                              true));
                        },
                        onmouseout: function (e) {
                          return Object.assign(e.currentTarget.style,
                            iconBtnStyle(mainColor,
                              false));
                        },
                        onclick: function () {
                          return dataObj.undo(dataName);
                        }
                      },
                      m.trust(window.iconPark.getIcon("Back",
                        {
                          size: 14
                        }))) : void 0,
                    dataObj.redo ? m("div",
                      {
                        style: iconBtnStyle(mainColor),
                        onmouseover: function (e) {
                          return Object.assign(e.currentTarget.style,
                            iconBtnStyle(mainColor,
                              true));
                        },
                        onmouseout: function (e) {
                          return Object.assign(e.currentTarget.style,
                            iconBtnStyle(mainColor,
                              false));
                        },
                        onclick: function () {
                          return dataObj.redo(dataName);
                        }
                      },
                      m.trust(window.iconPark.getIcon("Redo",
                        {
                          size: 14
                        }))) : void 0,
                    extEditMode ? m("div",
                      {
                        style: iconBtnStyle(redColor),
                        onmouseover: function (e) {
                          return Object.assign(e.currentTarget.style,
                            iconBtnStyle(redColor,
                              true));
                        },
                        onmouseout: function (e) {
                          return Object.assign(e.currentTarget.style,
                            iconBtnStyle(redColor,
                              false));
                        },
                        onclick: function () {
                          if (confirm("确定要删除这条数据吗喵？")) {
                            delete dataObj[dataName];
                            if (Array.isArray(dataObj)) {
                              return dataObj.splice(dataName,
                                1);
                            }
                          }
                        }
                      },
                      m.trust(window.iconPark.getIcon("Delete",
                        {
                          size: 14
                        }))) : void 0
                  ]),
                // 右侧展开组
                m("div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: `${getSize(1)}rem`,
                      cursor: "pointer",
                      padding: `${getSize(0.5)}rem ${getSize(1)}rem`,
                      borderRadius: `${getSize(1)}rem`,
                      transition: "all 0.3s",
                      color: mainColor.back,
                      opacity: "0.6"
                    },
                    onmouseover: function (e) {
                      return e.currentTarget.style.opacity = "1";
                    },
                    onmouseout: function (e) {
                      return e.currentTarget.style.opacity = "0.6";
                    },
                    onclick: function () {
                      isExpanded = !isExpanded;
                      if (isExpanded) {
                        return setTimeout(function () {
                          textareaDom.style.height = 'auto';
                          return textareaDom.style.height = textareaDom.scrollHeight + 'px';
                        },
                          50);
                      } else {
                        return textareaDom.style.height = `${getSize(15)}rem`;
                      }
                    }
                  },
                  m.trust(window.iconPark.getIcon((isExpanded ? "ExpandUp" : "ExpandDown"),
                    {
                      size: 14
                    })))
              ])
          ])
      ]);
    }
  };
};

export default RefinedText;
