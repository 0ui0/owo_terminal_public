export default function () {
  let activeTab = 'user'; // 'user' | 'system'

  return {
    view: (vnode) => {
      const { m, Box, getColor, history, hash, isValidPath, customCwd, iconPark, onOpenProjectBackup, onSelect, onDelete, onSnap, style, trs } = vnode.attrs;

      // 分类逻辑：带有 msgId 的通常是系统/消息触发的，没带的是手动创建的
      const userSnapshots = (history || []).filter(s => !s.msgId);
      const systemSnapshots = (history || []).filter(s => s.msgId);

      const displayHistory = activeTab === 'user' ? userSnapshots : systemSnapshots;

      return m("",
        {
          style: Object.assign({
            width: "28rem",
            minWidth: "28rem",
            borderRight: `0.1rem solid ${getColor('gray_2').back}`,
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
                padding: "1.2rem",
                borderBottom: `0.1rem solid ${getColor('gray_2').back}`
              }
            },
            [
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.8rem",
                    marginBottom: "1rem",
                    opacity: 0.8
                  }
                },
                [
                  m("span",
                    {
                      style: {
                        fontSize: "1.1rem"
                      }
                    },
                    m.trust(iconPark.getIcon('Time', { fill: getColor('gray_1').front }))),
                  m("span",
                    {
                      style: {
                        fontWeight: "bold"
                      }
                    },
                    trs("时光机/侧边栏/历史版本", { cn: "历史版本", en: "History" }))
                ]),

              m("",
                {
                  style: {
                    display: "flex",
                    gap: "0.8rem",
                    marginBottom: "1rem"
                  }
                },
                [
                  m("div",
                    {
                      style: {
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.6rem",
                        borderRadius: "0.8rem",
                        background: isValidPath ? getColor('main').back : getColor('gray_2').back,
                        color: isValidPath ? getColor('main').front : getColor('gray_2').front,
                        cursor: isValidPath ? "pointer" : "default",
                        opacity: isValidPath ? 1 : 0.5,
                        transition: "all 0.2s"
                      },
                      onclick: () => {
                        return isValidPath ? onSnap() : null;
                      }
                    },
                    [
                      m.trust(iconPark.getIcon('AddOne', { fill: isValidPath ? getColor('main').front : getColor('gray_2').front })),
                      m("span", trs("时光机/侧边栏/创建快照", { cn: "创建快照", en: "Snapshot" }))
                    ]),

                  // 快捷打开项目备份
                  customCwd ? m("div",
                    {
                      style: {
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.6rem",
                        borderRadius: "0.8rem",
                        background: getColor('gray_2').back,
                        color: getColor('gray_2').front,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      },
                      onclick: onOpenProjectBackup
                    },
                    [
                      m.trust(iconPark.getIcon('Inbox', { fill: getColor('gray_2').front })),
                      m("span", trs("时光机/侧边栏/项目备份", { cn: "项目备份", en: "Backups" }))
                    ]) : null
                ]),

            ]),

          // Tab 切换器（合并为居中胶囊模式）
          m("", {
            style: {
              display: "flex",
              justifyContent: "center", // 居中显示
              padding: "0.8rem 1.2rem",
              background: getColor('gray_1').back
            }
          }, [
            m("", {
              style: {
                display: "flex",
                background: getColor('gray_2').back,
                padding: "0.2rem",
                borderRadius: "1rem",
                width: "fit-content",
                minWidth: "16rem",

              }
            }, [
              ['user', trs("时光机/侧边栏/用户快照", { cn: "用户", en: "User" }), userSnapshots.length],
              ['system', trs("时光机/侧边栏/系统自动", { cn: "自动", en: "System" }), systemSnapshots.length]
            ].map(([key, label, count]) => m("div", {
              style: {
                flex: 1,
                padding: "0.4rem 1rem",
                borderRadius: "0.8rem",
                cursor: "pointer",
                transition: "all 0.2s",
                background: activeTab === key ? getColor('main').back : "transparent",
                color: activeTab === key ? getColor('main').front : getColor('gray_1').front,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                fontSize: "0.75rem",
                fontWeight: activeTab === key ? "bold" : "normal"
              },
              onclick: () => { activeTab = key; m.redraw(); }
            }, [
              m("span", label),
              m("span", {
                style: {
                  opacity: activeTab === key ? 0.8 : 0.4,
                  fontSize: "0.75rem"
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
                padding: "0.5rem"
              }
            },
            [
              !isValidPath ?
                m("",
                  {
                    style: {
                      padding: "3rem 1rem",
                      textAlign: "center",
                      opacity: 0.3
                    }
                  },
                  "工作目录未配置") :
                (displayHistory.length === 0 ?
                  m("",
                    {
                      style: {
                        padding: "3rem 1rem",
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
                          padding: "0.8rem",
                          margin: "0.4rem",
                          borderRadius: "0.8rem",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          background: hash === item.hash ? getColor('main').back + '33' : "transparent",
                          border: `0.1rem solid ${hash === item.hash ? getColor('main').back : 'transparent'}`,
                          borderLeft: hash === item.hash ? `0.4rem solid ${getColor('main').back}` : `0.1rem solid transparent`,
                          color: getColor('gray_4').front
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
                              marginBottom: "0.3rem"
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
