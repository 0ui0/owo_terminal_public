export default function () {
  let activeTab = 'user'; // 'user' | 'system'

  return {
    view: (vnode) => {
      const { m, Box, Tag, getColor, getSize, iconTag, history, hash, isValidPath, iconPark, onOpenProjectBackup, onSelect, onDelete, onSnap, style, trs } = vnode.attrs;

      // 分类逻辑：带有 msgId 的通常是系统/消息触发的，没带的是手动创建的
      const userSnapshots = (history || []).filter(s => !s.msgId);
      const systemSnapshots = (history || []).filter(s => s.msgId);

      const displayHistory = activeTab === 'user' ? userSnapshots : systemSnapshots;

      return m("",
        {
          style: Object.assign({
            width: `${getSize(70)}rem`,
            minWidth: `${getSize(70)}rem`,
            borderRight: `${getSize(0.25)}rem solid ${getColor('gray_2').back}`,
            display: "flex",
            flexDirection: "column",
            background: getColor('gray_1').back,
            color: getColor('gray_1').front
          }, style || {})
        },
        [
          // 头部区域：标题与创建按钮
          m("",
            {
              style: {
                padding: `${getSize(3)}rem`,
                borderBottom: `${getSize(0.25)}rem solid ${getColor('gray_2').back}`
              }
            },
            [
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: `${getSize(3)}rem`,
                    marginBottom: `${getSize(3)}rem`
                  }
                },
                [
                  m(iconTag,
                    {
                      iconName: "AddOne",
                      isBtn: isValidPath,
                      bgColor: isValidPath ? getColor('main').back : getColor('gray_2').back,
                      fgColor: isValidPath ? getColor('main').front : getColor('gray_2').front,
                      styleExt: {
                        margin: 0,
                        padding: `${getSize(2)}rem`
                      },
                      ext: {
                        onclick: () => {
                          return isValidPath ? onSnap() : null;
                        }
                      }
                    },
                    trs("时光机/侧边栏/创建快照", { cn: "创建快照", en: "Snapshot" })),

                  // 快捷打开项目备份
                  m(iconTag,
                    {
                      iconName: "Inbox",
                      isBtn: true,
                      bgColor: getColor('gray_2').back,
                      fgColor: getColor('gray_2').front,
                      styleExt: {
                        margin: 0,
                        padding: `${getSize(2)}rem`
                      },
                      ext: {
                        onclick: onOpenProjectBackup
                      }
                    },
                    trs("时光机/侧边栏/项目备份", { cn: "项目备份", en: "Backups" }))
                ]),

            ]),

          // Tab 切换器（合并为居中胶囊模式）
          m("", {
            style: {
              display: "flex",
              justifyContent: "center", // 居中显示
              padding: `${getSize(3)}rem`,
              background: getColor('gray_1').back
            }
          }, [
            m("", {
              style: {
                display: "flex",
                background: getColor('gray_2').back,
                padding: `${getSize(0.5)}rem`,
                borderRadius: `${getSize(8)}rem`,
                width: "fit-content",
                gap: `${getSize(0.5)}rem`

              }
            }, [
              ['user', trs("时光机/侧边栏/用户快照", { cn: "用户", en: "User" }), userSnapshots.length],
              ['system', trs("时光机/侧边栏/系统自动", { cn: "自动", en: "System" }), systemSnapshots.length]
            ].map(([key, label, count]) => m(Tag, {
              isBtn: true,
              color: activeTab === key ? "main" : "gray_2",
              styleExt: {
                margin: 0,
                justifyContent: "center",
                background: activeTab === key ? getColor('main').back : "transparent",
                color: activeTab === key ? getColor('main').front : getColor('gray_2').front
              },
              ext: {
                onclick: () => {
                  activeTab = key;
                  m.redraw();
                }
              }
            }, [
              m("span", label),
              m("span", {
                style: {
                  opacity: activeTab === key ? 0.8 : 0.4
                }
              }, count)
            ])))
          ]),

          // 列表区域
          m("",
            {
              style: {
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: `${getSize(3)}rem`,
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(1)}rem`
              }
            },
            [
              !isValidPath ?
                m("",
                  {
                    style: {
                      padding: `${getSize(7)}rem ${getSize(2.5)}rem`,
                      textAlign: "center",
                      opacity: 0.3
                    }
                  },
                  "工作目录未配置") :
                (displayHistory.length === 0 ?
                  m("",
                    {
                      style: {
                        padding: `${getSize(7)}rem ${getSize(2.5)}rem`,
                        textAlign: "center",
                        opacity: 0.3
                      }
                    },
                    "暂无快照记录") :
                  displayHistory.map((item) => {
                    return m("",
                      {
                        key: item.hash,
                        style: {
                          padding: `${getSize(2)}rem`,
                          borderRadius: `${getSize(8)}rem`,
                          minWidth: 0,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          background: hash === item.hash ? getColor('main').back : "transparent",
                          border: `${getSize(0.25)}rem solid ${hash === item.hash ? getColor('main').back : 'transparent'}`,
                          borderLeft: hash === item.hash ? `${getSize(1)}rem solid ${getColor('main').back}` : `${getSize(0.25)}rem solid transparent`,
                          color: hash === item.hash ? getColor("main").front : getColor('gray_4').front
                        },
                        onclick: () => {
                          return onSelect(item.hash);
                        }
                      },
                      [
                        m("",
                          {
                            style: {
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: `${getSize(2)}rem`,
                              marginBottom: `${getSize(1)}rem`
                            }
                          },
                          [
                            m("span",
                              {
                                style: {
                                  fontWeight: "bold",
                                  opacity: 0.4
                                }
                              },
                              new Date(item.time).toLocaleString()),
                            m("span",
                              {
                                style: {
                                  cursor: "pointer",
                                  opacity: 0.2
                                },
                                onclick: (e) => {
                                  e.stopPropagation();
                                  return onDelete(item);
                                }
                              },
                              m.trust(iconPark.getIcon('Delete', { fill: getColor('gray_4').front })))
                          ]),
                        m("",
                          {
                            style: {
                              opacity: 0.8,
                              wordBreak: "break-all"
                            }
                          },
                          item.msg || "无备注")
                      ]);
                  }))
            ])
        ]);
    }
  };
}
