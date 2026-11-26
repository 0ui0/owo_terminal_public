/* FormWidgets.js - qqBot 设置页通用表单部件（iOS Inset Grouped 布局 + 新版样式设计指南） */

const fallbackSize = (k) => (2 * 2 * k) / 10;

/* 扁平化子元素（含 Mithril Fragment）并过滤空节点 */
const flattenValidChildren = (children) => {
  const result = [];
  const walk = (item) => {
    if (Array.isArray(item)) {
      for (const sub of item) walk(sub);
    } else if (item && typeof item === "object" && item.tag === "[" && Array.isArray(item.children)) {
      for (const sub of item.children) walk(sub);
    } else if (item !== null && item !== undefined && item !== false && item !== true) {
      result.push(item);
    }
  };
  walk(children);
  return result;
};

/* 分组卡片：iOS Inset Grouped 无框小标题 + borderBottom 缩进分割线容器 + 可选无框脚注 */
export const GroupCard = {
  view: (vnode) => {
    const { m, Box, getSize, title, footer } = vnode.attrs;
    const size = typeof getSize === "function" ? getSize : fallbackSize;
    const items = flattenValidChildren(vnode.children);
    const hasKey = items.some((child) => child && typeof child === "object" && child.key != null);

    const rowItems = items.map((child, idx) => {
      const attrs = {
        style: idx < items.length - 1
          ? {
              borderBottom: `${size(0.25)}rem solid rgba(0, 0, 0, 0.15)`
            }
          : {}
      };
      if (hasKey) {
        attrs.key = child && typeof child === "object" && child.key != null
          ? child.key
          : `__group_row_${idx}`;
      }
      return m("", attrs, child);
    });

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: `${size(1)}rem`,
          margin: "0"
        }
      },
      [
        title ? m("",
          {
            style: {
              padding: `0 ${size(3)}rem`,
              fontSize: `${size(3)}rem`,
              lineHeight: `${size(4)}rem`,
              opacity: 0.6
            }
          },
          title
        ) : null,
        m(Box,
          {
            style: {
              margin: "0",
              padding: `${size(1)}rem ${size(3)}rem`,
              borderRadius: `${size(8)}rem`,
              display: "flex",
              flexDirection: "column",
              gap: "0",
              overflow: "hidden"
            }
          },
          rowItems
        ),
        footer ? m("",
          {
            style: {
              padding: `0 ${size(3)}rem`,
              fontSize: `${size(3)}rem`,
              lineHeight: `${size(4)}rem`,
              opacity: 0.55
            }
          },
          footer
        ) : null
      ]
    );
  }
};

/* 开关行：左侧文字与说明，右侧系统开关 */
export const SwitchRow = {
  view: (vnode) => {
    const { m, Box, getSize, label, desc, value, onToggle } = vnode.attrs;
    const size = typeof getSize === "function" ? getSize : fallbackSize;

    return m(Box,
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: `${size(3)}rem`,
          background: "none",
          margin: "0",
          padding: `${size(2)}rem 0`,
          borderRadius: "0"
        }
      },
      [
        m("",
          {
            style: {
              minWidth: "0",
              flex: "1"
            }
          },
          [
            m("",
              {
                style: {
                  lineHeight: `${size(5)}rem`
                }
              },
              label
            ),
            desc ? m("",
              {
                style: {
                  fontSize: `${size(3)}rem`,
                  lineHeight: `${size(4)}rem`,
                  opacity: 0.55,
                  marginTop: `${size(1 / 2)}rem`
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
              width: `${size(10)}rem`,
              height: `${size(5)}rem`,
              padding: "0",
              margin: "0",
              borderRadius: `${size(8)}rem`,
              flex: "none",
              cursor: "pointer",
              transition: "background 0.3s ease"
            },
            onclick: () => onToggle(!value)
          },
          m("",
            {
              style: {
                position: "absolute",
                top: `${size(1 / 2)}rem`,
                left: value ? `${size(5.5)}rem` : `${size(1 / 2)}rem`,
                width: `${size(4)}rem`,
                height: `${size(4)}rem`,
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

/* 文本输入行：闭包函数组件，私有状态 showKey 存储于闭包内 */
export const InputRow = () => {
  let showKey = false;

  return {
    view: (vnode) => {
      const { m, Box, getSize, label, value, onInput, isPassword } = vnode.attrs;
      const size = typeof getSize === "function" ? getSize : fallbackSize;
      const isPass = !!isPassword;

      return m(Box,
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: `${size(3)}rem`,
            background: "none",
            margin: "0",
            padding: `${size(2)}rem 0`,
            borderRadius: "0"
          }
        },
        [
          m("",
            {
              style: {
                flex: "none",
                lineHeight: `${size(5)}rem`
              }
            },
            label
          ),
          m("",
            {
              style: {
                position: "relative",
                flex: "1",
                minWidth: `${size(15)}rem`,
                maxWidth: `${size(65)}rem`,
                display: "flex",
                alignItems: "center"
              }
            },
            [
              m(Box,
                {
                  color: "gray_1",
                  tagName: isPass && !showKey ? "input[type=password]" : "input[type=text]",
                  noValue: true,
                  style: {
                    width: "100%",
                    margin: "0",
                    borderRadius: `${size(8)}rem`,
                    padding: isPass
                      ? `${size(1.5)}rem ${size(7)}rem ${size(1.5)}rem ${size(3)}rem`
                      : `${size(1.5)}rem ${size(3)}rem`,
                    textAlign: "left"
                  },
                  ext: {
                    value: value === undefined || value === null ? "" : String(value),
                    oninput: (e) => onInput(e.target.value)
                  }
                }
              ),
              isPass && window.iconPark?.getIcon ? m("",
                {
                  style: {
                    position: "absolute",
                    right: `${size(2)}rem`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    opacity: 0.6,
                    userSelect: "none"
                  },
                  onclick: (e) => {
                    e.stopPropagation();
                    showKey = !showKey;
                  }
                },
                m.trust(window.iconPark.getIcon(showKey ? "PreviewOpen" : "PreviewClose", { size: `${size(4)}rem` }))
              ) : null
            ]
          )
        ]
      );
    }
  };
};

/* 操作行：左侧文字与说明，右侧小按钮 */
export const ActionRow = {
  view: (vnode) => {
    const { m, Box, Tag, getSize, label, desc, btnText, color, onAction } = vnode.attrs;
    const size = typeof getSize === "function" ? getSize : fallbackSize;

    return m(Box,
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: `${size(3)}rem`,
          background: "none",
          margin: "0",
          padding: `${size(2)}rem 0`,
          borderRadius: "0"
        }
      },
      [
        m("",
          {
            style: {
              minWidth: "0",
              flex: "1"
            }
          },
          [
            m("",
              {
                style: {
                  lineHeight: `${size(5)}rem`
                }
              },
              label
            ),
            desc ? m("",
              {
                style: {
                  fontSize: `${size(3)}rem`,
                  lineHeight: `${size(4)}rem`,
                  opacity: 0.55,
                  marginTop: `${size(1 / 2)}rem`
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
              margin: "0",
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
