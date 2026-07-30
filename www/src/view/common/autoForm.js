import Box from "./box.js";
import Tag from "./tag.js";
import Notice from "./notice.js";
import lodash from "lodash";
import RefinedText from "./RefinedText.js";

/*
要注意区分当前条目和子条目的 attrs.dataObj[attrs.dataName]
在循环里和循环外是不一样的
*/
var AutoForm, copyObj;

copyObj = null;

AutoForm = function() {
  var showArr;
  showArr = [];
  return {
    view: function({attrs}) {
      var node, nodeType;
      node = attrs.dataObj[attrs.dataName];
      nodeType = Object.prototype.toString.call(node);
      return m("", [
        m("",
        {
          style: {
            display: ["[object Array]",
        "[object Object]"].indexOf(nodeType) !== -1 ? "grid" : void 0,
            gridTemplateColumns: "auto 1fr",
            borderRadius: "1rem"
          }
        },
        [
          (function() {
            switch (nodeType) {
              case "[object Array]":
              case "[object Object]":
                return Object.entries(node).map(([key,
          value]) => {
                  return m.fragment([
                    m(Box,
                    {
                      color: "brown",
                      style: {
                        minWidth: "2.5rem",
                        textAlign: "center",
                        padding: "0.4rem 0.8rem",
                        borderRadius: "0.6rem",
                        margin: "0.2rem 0.5rem",
                        fontSize: "0.9rem"
                      }
                    },
                    key),
                    m("",
                    [
                      typeof value === "object" && value !== null ? [
                        m(Tag,
                        {
                          isBtn: true,
                          color: "sliver",
                          styleExt: {
                            margin: "0.2rem 0.5rem",
                            fontSize: "0.85rem",
                            opacity: "0.8"
                          },
                          onclick: () => {
                            return showArr[key] = !showArr[key];
                          }
                        },
                        [
                          m.trust(window.iconPark.getIcon((showArr[key] ? "ExpandDown" : "ExpandRight"),
                          {
                            size: 14
                          })),
                          m("span",
                          {
                            style: {
                              marginLeft: "4px"
                            }
                          },
                          showArr[key] ? "收起" : "展开")
                        ]),
                        showArr[key] ? m("div",
                        {
                          style: {
                            marginTop: "0.5rem",
                            marginBottom: "1rem"
                          }
                        },
                        [
                          m(AutoForm,
                          {
                            dataObj: attrs.dataObj[attrs.dataName],
                            dataName: key,
                            extEditMode: attrs.extEditMode
                          })
                        ]) : void 0
                      ] : m.fragment([
                        m(AutoForm,
                        {
                          dataObj: attrs.dataObj[attrs.dataName],
                          dataName: key,
                          extEditMode: attrs.extEditMode
                        })
                      ])
                    ])
                  ]);
                });
              case "[object Number]":
              case "[object String]":
              case "[object Null]":
                return m(RefinedText,
                {
                  dataObj: attrs.dataObj,
                  dataName: attrs.dataName,
                  label: null,
                  extEditMode: attrs.extEditMode
                });
              case "[object Boolean]":
                return m.fragment([
                  m(Box,
                  {
                    isSwitch: true,
                    onclick: (a,
                  b,
                  c,
                  _this) => {
                      if (_this.data.value) {
                        return attrs.dataObj[attrs.dataName] = true;
                      } else {
                        return attrs.dataObj[attrs.dataName] = false;
                      }
                    }
                  })
                ]);
              default:
                return null;
            }
          }).call(this)
        ]),
        //新增条目
        typeof attrs.dataObj[attrs.dataName] === "object" ? attrs.extEditMode ? m(Box,
        [
          m(Tag,
          {
            isBtn: true,
            color: "yellow",
            onclick: () => {
              var KeyBox,
              ValueBox,
              comp,
              preSelect;
              preSelect = "文本";
              KeyBox = new Box();
              ValueBox = new Box();
              comp = function() {
                return {
                  view: function({attrs}) {
                    return m("",
                    [
                      m(Box,
                      {
                        tagName: "select",
                        isBtn: false,
                        noValue: true,
                        ext: {
                          onchange: (e) => {
                            return preSelect = e.target.value;
                          }
                        }
                      },
                      [
                        ["文本",
                        "数值",
                        "对象",
                        "数组"].map((item) => {
                          return m("option",
                          {
                            value: item
                          },
                          item);
                        })
                      ]),
                      m("",
                      {
                        style: {
                          display: "grid",
                          gridTemplateColumns: "auto 1fr"
                        }
                      },
                      [
                        Object.prototype.toString.call(attrs.dataObj[attrs.dataName]) !== "[object Array]" ? [
                          m(Box,
                          "条目名"),
                          m(KeyBox,
                          {
                            tagName: "input[type=text]"
                          })
                        ] : void 0,
                        preSelect === "文本" || preSelect === "数值" ? [
                          m(Box,
                          "条目值"),
                          m(ValueBox,
                          {
                            tagName: "input[type=text]"
                          })
                        ] : void 0
                      ])
                    ]);
                  }
                };
              };
              return Notice.launch({
                content: comp,
                contentAttrs: attrs,
                tip: "请选择条目类型",
                confirm: () => {
                  if (ValueBox.data.value.length === 0) {
                    ValueBox.data.value = (function() {
                      switch (preSelect) {
                        case "文本":
                          return "新增文本";
                        case "数值":
                          return 100;
                      }
                    })();
                  }
                  if (KeyBox.data.value.length === 0) {
                    KeyBox.data.value = `新条目${Date.now()}`;
                  }
                  switch (preSelect) {
                    case "文本":
                      switch (Object.prototype.toString.call(attrs.dataObj[attrs.dataName])) {
                        case "[object Array]":
                          attrs.dataObj[attrs.dataName].push(ValueBox.data.value);
                          console.log(attrs.dataObj[attrs.dataName]);
                          break;
                        case "[object Object]":
                          attrs.dataObj[attrs.dataName][KeyBox.data.value] = ValueBox.data.value;
                      }
                      break;
                    case "数值":
                      switch (Object.prototype.toString.call(attrs.dataObj[attrs.dataName])) {
                        case "[object Array]":
                          attrs.dataObj[attrs.dataName].push(Number(ValueBox.data.value));
                          console.log(attrs.dataObj[attrs.dataName]);
                          break;
                        case "[object Object]":
                          attrs.dataObj[attrs.dataName][KeyBox.data.value] = Number(ValueBox.data.value);
                      }
                      break;
                    case "对象":
                      switch (Object.prototype.toString.call(attrs.dataObj[attrs.dataName])) {
                        case "[object Array]":
                          attrs.dataObj[attrs.dataName].push({});
                          break;
                        case "[object Object]":
                          attrs.dataObj[attrs.dataName][KeyBox.data.value] = {};
                      }
                      break;
                    case "数组":
                      switch (Object.prototype.toString.call(attrs.dataObj[attrs.dataName])) {
                        case "[object Array]":
                          attrs.dataObj[attrs.dataName].push([]);
                          break;
                        case "[object Object]":
                          attrs.dataObj[attrs.dataName][KeyBox.data.value] = [];
                      }
                  }
                  return void 0;
                }
              });
            }
          },
          [
            m.trust(window.iconPark.getIcon("Plus",
            {
              size: 14
            })),
            m("span",
            {
              style: {
                marginLeft: "4px"
              }
            },
            "新增条目")
          ]),
          m(Tag,
          {
            isBtn: true,
            color: "sliver",
            onclick: () => {
              return copyObj = lodash.cloneDeep(attrs.dataObj[attrs.dataName]);
            }
          },
          [
            m.trust(window.iconPark.getIcon("CopyOne",
            {
              size: 14
            })),
            m("span",
            {
              style: {
                marginLeft: "4px"
              }
            },
            "复制")
          ]),
          copyObj && Object.prototype.toString.call(attrs.dataObj[attrs.dataName]) === "[object Array]" ? m(Tag,
          {
            isBtn: true,
            color: "sliver",
            onclick: () => {
              switch (Object.prototype.toString.call(attrs.dataObj[attrs.dataName])) {
                case "[object Array]":
                  return attrs.dataObj[attrs.dataName].push(copyObj);
              }
            }
          },
          "粘贴") : void 0,
          m(Tag,
          {
            isBtn: true,
            onclick: () => {
              delete attrs.dataObj[attrs.dataName];
              if (Array.isArray(attrs.dataObj)) {
                return attrs.dataObj.splice(attrs.dataName,
                1);
              }
            }
          },
          [
            m.trust(window.iconPark.getIcon("Minus",
            {
              size: 14
            })),
            m("span",
            {
              style: {
                marginLeft: "4px"
              }
            },
            "删除本组")
          ])
        ]) : void 0 : void 0
      ]);
    }
  };
};

export default AutoForm;
