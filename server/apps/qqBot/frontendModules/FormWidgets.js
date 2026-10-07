/* FormWidgets.js - qqBot 设置页通用表单部件（依赖通过 vnode.attrs 注入） */

/* 分组卡片：小标题 + 内容容器（对齐系统 FormItem 骨架） */
export const GroupCard = {
  view: (vnode) => {
    const { m, Box, getColor, title } = vnode.attrs;

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          margin: "0 0.5rem 1.5rem 0.5rem"
        }
      },
      [
        m(Box,
          {
            style: {
              margin: "0 0.5rem",
              padding: "0.5rem 1.4rem",
              borderRadius: "0.5rem 0.5rem 0 0",
              background: getColor("brown_2").back,
              color: getColor("brown_2").front,
              fontSize: "1.2rem",
              width: "fit-content"
            }
          },
          title
        ),
        m(Box,
          {
            style: {
              margin: "0 0.5rem",
              borderRadius: "0 1rem 1rem 1rem",
              padding: "0.5rem"
            }
          },
          vnode.children
        )
      ]
    );
  }
};

/* 开关行：左侧文字与说明，右侧系统开关 */
export const SwitchRow = {
  view: (vnode) => {
    const { m, Box, label, desc, value, editKey, onToggle } = vnode.attrs;

    return m(Box,
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          background: "none",
          margin: "0.2rem",
          padding: "0.6rem 0.5rem"
        }
      },
      [
        m("",
          {
            style: {
              minWidth: "0"
            }
          },
          [
            m("div",
              {
                style: {
                  fontSize: "1.5rem"
                }
              },
              label
            ),
            desc ? m("div",
              {
                style: {
                  fontSize: "1.2rem",
                  opacity: "0.5",
                  marginTop: "0.2rem"
                }
              },
              desc
            ) : null
          ]
        ),
        m(Box,
          {
            color: value ? "main" : "gray_2",
            style: {
              position: "relative",
              width: "4rem",
              height: "2rem",
              padding: "0",
              margin: "0",
              flex: "none",
              cursor: "pointer",
              transition: "background 0.3s ease"
            },
            onclick: () => onToggle(!value)
          },
          m("div",
            {
              style: {
                position: "absolute",
                top: "0.2rem",
                left: value ? "2.2rem" : "0.2rem",
                width: "1.6rem",
                height: "1.6rem",
                borderRadius: "50%",
                background: "currentColor",
                transition: "left 0.3s ease"
              }
            }
          )
        )
      ]
    );
  }
};

/* 文本输入行：左侧标签，右侧系统输入框 */
export const InputRow = {
  view: (vnode) => {
    const { m, Box, label, value, editKey, onInput } = vnode.attrs;

    return m(Box,
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          background: "none",
          margin: "0.2rem",
          padding: "0.6rem 0.5rem"
        }
      },
      [
        m("div",
          {
            style: {
              fontSize: "1.5rem",
              flex: "none"
            }
          },
          label
        ),
        m(Box,
          {
            color: "gray_1",
            tagName: "input[type=text]",
            noValue: true,
            style: {
              flex: "1",
              minWidth: "6rem",
              maxWidth: "26rem",
              margin: "0",
              padding: "0.6rem 1.2rem",
              textAlign: "right"
            },
            ext: {
              value: value === undefined || value === null ? "" : String(value),
              oninput: (e) => onInput(e.target.value)
            }
          }
        )
      ]
    );
  }
};

/* 操作行：左侧文字与说明，右侧小按钮 */
export const ActionRow = {
  view: (vnode) => {
    const { m, Box, Tag, label, desc, btnText, color, onAction } = vnode.attrs;

    return m(Box,
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          background: "none",
          margin: "0.2rem",
          padding: "0.6rem 0.5rem"
        }
      },
      [
        m("",
          {
            style: {
              minWidth: "0"
            }
          },
          [
            m("div",
              {
                style: {
                  fontSize: "1.5rem"
                }
              },
              label
            ),
            desc ? m("div",
              {
                style: {
                  fontSize: "1.2rem",
                  opacity: "0.5",
                  marginTop: "0.2rem"
                }
              },
              desc
            ) : null
          ]
        ),
        m(Tag,
          {
            isBtn: true,
            color: color || "gray_4",
            styleExt: {
              cursor: "pointer",
              flex: "none"
            },
            onclick: () => onAction()
          },
          btnText
        )
      ]
    );
  }
};
