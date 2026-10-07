/* HomeView.js - 总览页：连接状态卡 + 活跃群组列表 */

export default {
  view: (vnode) => {
    const { m, Box, Tag, getColor, trs, config = {}, status = {}, onOpenAgent } = vnode.attrs;

    const localPill = status.localConnected
      ? { color: "green_1", cn: "已连接", en: "Connected" }
      : (status.localSwitch ? { color: "pink_1", cn: "连接中", en: "Connecting" } : { color: "gray_2", cn: "未启用", en: "Off" });

    const officialPill = status.officialConfigured
      ? { color: "green_1", cn: "已配置", en: "Ready" }
      : (status.officialSwitch ? { color: "yellow_1", cn: "缺凭证", en: "No Credential" } : { color: "gray_2", cn: "未启用", en: "Off" });

    const groupList = [
      ...(config["3rd_qqRobotLocal_groups"] || []).map(g => ({ key: `local-${g.groupid}`, id: g.groupid, name: g.name, listId: g.listId, type: "local" })),
      ...(config["3rd_qqRobot_groups"] || []).map(g => ({ key: `official-${g.groupid}`, id: g.groupid, name: g.name, listId: g.listId, type: "official" })),
      ...(config["3rd_qqRobot_channels"] || []).map(g => ({ key: `channel-${g.channelid}`, id: g.channelid, name: g.name, listId: g.listId, type: "channel" }))
    ].filter(g => g.listId);

    return m("",
      {
        style: {
          padding: "0.5rem"
        }
      },
      [
        m("",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
              gap: "0.5rem"
            }
          },
          [
            m(Box,
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.8rem",
                  padding: "1.2rem",
                  borderRadius: "1.5rem"
                }
              },
              [
                m("",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.6rem"
                    }
                  },
                  [
                    m("span",
                      {
                        style: {
                          fontSize: "1.6rem"
                        }
                      },
                      trs("QQBot/总览/本地", { cn: "本地 OneBot", en: "Local OneBot" })
                    ),
                    m(Tag,
                      {
                        color: localPill.color,
                        styleExt: {
                          margin: "0",
                          flex: "none"
                        }
                      },
                      trs(`QQBot/状态/${localPill.cn}`, { cn: localPill.cn, en: localPill.en })
                    )
                  ]
                ),
                m("div",
                  {
                    style: {
                      fontSize: "1.2rem",
                      opacity: "0.6",
                      wordBreak: "break-all"
                    }
                  },
                  status.localUrl || trs("QQBot/未配置", { cn: "未配置", en: "Not configured" })
                )
              ]
            ),

            m(Box,
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.8rem",
                  padding: "1.2rem",
                  borderRadius: "1.5rem"
                }
              },
              [
                m("",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.6rem"
                    }
                  },
                  [
                    m("span",
                      {
                        style: {
                          fontSize: "1.6rem"
                        }
                      },
                      trs("QQBot/总览/官方", { cn: "官方机器人", en: "Official Bot" })
                    ),
                    m(Tag,
                      {
                        color: officialPill.color,
                        styleExt: {
                          margin: "0",
                          flex: "none"
                        }
                      },
                      trs(`QQBot/状态/${officialPill.cn}`, { cn: officialPill.cn, en: officialPill.en })
                    )
                  ]
                ),
                m("div",
                  {
                    style: {
                      fontSize: "1.2rem",
                      opacity: "0.6",
                      wordBreak: "break-all"
                    }
                  },
                  status.officialAppId || trs("QQBot/未配置", { cn: "未配置", en: "Not configured" })
                )
              ]
            )
          ]
        ),

        m("div",
          {
            style: {
              fontSize: "1.2rem",
              opacity: "0.55",
              margin: "1.5rem 0.5rem 0.5rem 1.2rem"
            }
          },
          trs("QQBot/总览/活跃群组", {
            cn: `活跃群组 · ${groupList.length}`,
            en: `Active Groups · ${groupList.length}`
          })
        ),

        m("",
          {
            style: {
              display: "flex",
              flexDirection: "column"
            }
          },
          groupList.length === 0
            ? m(Box,
              {
                style: {
                  textAlign: "center",
                  padding: "3rem 1rem",
                  fontSize: "1.3rem",
                  opacity: "0.7",
                  background: "none",
                  borderRadius: "1.5rem",
                  border: `0.1rem dashed ${getColor("gray_4").front}`
                }
              },
              trs("QQBot/总览/空状态", {
                cn: "还没有接入任何群组 · 去「设置」里添加第一个",
                en: "No group yet · add one in Settings"
              })
            )
            : groupList.map(g => m(Box,
              {
                key: g.key,
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.8rem 1.2rem",
                  margin: "0.5rem 0"
                }
              },
              [
                m("",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "0.8rem",
                      flexWrap: "wrap",
                      minWidth: "0"
                    }
                  },
                  [
                    m("span",
                      {
                        style: {
                          fontSize: "1.5rem"
                        }
                      },
                      g.name
                    ),
                    m("span",
                      {
                        style: {
                          fontSize: "1.2rem",
                          opacity: "0.55"
                        }
                      },
                      g.id
                    ),
                    m(Tag,
                      {
                        color: g.type === "local" ? "green_1" : "blue_1",
                        styleExt: {
                          margin: "0"
                        }
                      },
                      g.type === "local"
                        ? trs("QQBot/渠道/本地", { cn: "本地", en: "Local" })
                        : (g.type === "channel"
                          ? trs("QQBot/渠道/频道", { cn: "频道", en: "Channel" })
                          : trs("QQBot/渠道/官方", { cn: "官方", en: "Official" }))
                    )
                  ]
                ),
                m(Box,
                  {
                    isBtn: true,
                    color: "main",
                    style: {
                      margin: "0",
                      flex: "none",
                      padding: "0.4rem 1.4rem",
                      fontSize: "1.3rem"
                    },
                    onclick: () => onOpenAgent(g)
                  },
                  trs("QQBot/查看", { cn: "查看", en: "View" })
                )
              ]
            ))
        )
      ]
    );
  }
};
