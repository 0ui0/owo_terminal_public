/* frontend.js - Version 14: Native Notice Integration */
import qqBotData from "./qqBotData.js";

export default ({ appId, m, Notice, ioSocket, commonData, iconPark, getColor, trs, settingData, Box, Tag }) => {

  let config = {};
  let modelList = [];

  const instanceInterface = {
    onDispatch: (msg, callback) => {
      try {
        if (msg.action === "updateConfig") {
          config = msg.args.config;
          m.redraw();
        }
        if (callback) callback({ ok: true, msg: "OK" });
      } catch (err) {
        console.log(err);
      }
    }
  };

  const init = () => {
    qqBotData.addTool("commonData", commonData);
    qqBotData.registerInstances(appId, instanceInterface);
    if (commonData.registerApp) {
      commonData.registerApp(appId, qqBotData);
    }
  };
  init();

  const fetchConfig = async () => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "getConfig", {}]);
      if (res && res.ok) {
        config = res.data;
        modelList = settingData.options.get("ai_aiList")?.filter(m => m.switch) || []
        m.redraw();
      }
      else {
        console.log("[qqbot]", res.msg || "获取配置失败")
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  };

  const saveToBackend = async (newConfig) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "updateConfig", newConfig]);
      if (res && res.ok) {
        await fetchConfig();
        Notice.launch({ msg: res.msg });
      } else {
        Notice.launch({
          tip: "保存失败",
          msg: res?.msg || "未知错误"
        });
      }
    } catch (err) {
      Notice.launch({ msg: "通讯失败: " + err.message });
    }
  };

  return {
    oninit(vnode) {
      if (vnode.attrs.data) {
        config = vnode.attrs.data.config || config;
      }
      fetchConfig();
    },
    onremove() {
      qqBotData.unregisterInstances(appId, commonData);
    },
    view(vnode) {
      const theme = getColor("gray_4");
      const barTheme = getColor("gray_12");
      const mainColor = getColor("main");

      const cardStyle = (active, activeColor) => ({
        padding: "1.2rem",
        borderRadius: "3rem",
        background: active ? activeColor.back : getColor("gray_4").back,
        color: active ? activeColor.front : theme.front,
        border: `1px solid ${theme.front}08`,
        cursor: "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        gap: "0.4rem",
        boxShadow: "0 4px 15px rgba(0,0,0,0.03)"
      });

      return m("div",
        {
          style: {
            padding: "0",
            background: getColor("gray_1").back,
            color: theme.front,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }
        },
        [
          m("div",
            {
              style: {
                background: barTheme.back,
                padding: "0.5rem 1rem",
                display: "flex",
                gap: "0.6rem",
                alignItems: "center"
              }
            },
            [
              m("div", {
                style: { padding: "0.3rem 1.2rem", borderRadius: "3rem", background: mainColor.back, color: mainColor.front, cursor: "pointer" },
                onclick: async () => {
                  try {
                    const dialogRes = await settingData.fnCall("appOpenDialog", [{ filters: [{ name: "Config", extensions: ["json"] }] }]);
                    if (!dialogRes || !dialogRes.ok || dialogRes.canceled) return;
                    const readRes = await settingData.fnCall("appDispatch", [appId, "readFile", { filePath: dialogRes.filePath }]);
                    if (readRes && readRes.ok && readRes.data) {
                      saveToBackend(JSON.parse(readRes.data));
                    }
                  } catch (err) {
                    Notice.launch({ msg: "打开失败: " + (err.message || "未知错误") });
                  }
                }
              }, trs("打开", { cn: "打开", en: "Open" })),

              m("div", {
                style: { padding: "0.3rem 1.2rem", borderRadius: "3rem", background: getColor("gray_2").back, color: getColor("gray_2").front, cursor: "pointer" },
                onclick: async () => {
                  try {
                    const saveDialogRes = await settingData.fnCall("appSaveDialog", [{
                      filePath: 'qqBot_config.json',
                      filters: [{ name: 'JSON', extensions: ['json'] }]
                    }]);

                    if (saveDialogRes && saveDialogRes.ok && saveDialogRes.filePath) {
                      const saveRes = await settingData.fnCall("appDispatch", [appId, "saveToFile", {
                        filePath: saveDialogRes.filePath,
                        content: JSON.stringify(config, null, 2)
                      }]);
                      if (saveRes && saveRes.ok) {
                        Notice.launch({ msg: trs("系统/消息/保存成功", { cn: "保存成功", en: "Saved" }) });
                      } else {
                        Notice.launch({ tip: "保存失败", msg: saveRes?.msg || "写入文件失败" });
                      }
                    }
                  } catch (err) {
                    Notice.launch({ msg: "操作失败: " + err.message });
                  }
                }
              }, trs("另存为", { cn: "另存为", en: "Save As" })),

              m("div", {
                style: { padding: "0.3rem 1.2rem", borderRadius: "3rem", background: getColor("gray_2").back, color: getColor("gray_2").front, cursor: "pointer" },
                onclick: async () => {
                  const { default: SettingsView } = await import(`./frontendModules/SettingsView.js?t=${Date.now()}`);
                  const outState = { draft: {} };

                  Notice.launch({
                    tip: trs("QQBot/设置", { cn: "机器人全局设置", en: "Settings" }),
                    content: SettingsView({ m, trs, getColor, config, outState, modelList }),
                    confirm: async () => {
                      if (outState.draft) {
                        saveToBackend(outState.draft);
                      }
                      return false;
                    }
                  });
                }
              }, trs("设置", { cn: "设置", en: "Settings" }))
            ]
          ),

          m("div",
            {
              style: {
                padding: "1.5rem",
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem"
              }
            },
            [
              m("div", { style: { textAlign: "center", marginBottom: "0.5rem" } }, [
                m("h1", { style: { color: mainColor.back, fontWeight: "100", fontSize: "1.8rem" } }, trs("QQBot/标题", { cn: "QQ 机器人控制中心", en: "QQBot Controller" })),
                m("div", { style: { opacity: "0.3", marginTop: "0.4rem" } }, trs("QQBot/描述", { cn: "已成功连接至本地 OneBot 与官方机器人接口", en: "Connected with OneBot & Official Bot" }))
              ]),

              m("div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1.2rem"
                  }
                },
                [
                  m("div", {
                    style: cardStyle(config?.["3rd_qqRobotLocal_switch"], getColor("green_1"))
                  }, [
                    m("div", { style: { fontSize: "1.1rem" } }, trs("QQBot/本地", { cn: "本地 OneBot", en: "Local OneBot" })),
                    m("div", { style: { opacity: "0.4", fontSize: "0.8rem" } }, config?.["3rd_qqRobotLocal_wsUrl"] || "Offline")
                  ]),
                  m("div", {
                    style: cardStyle(config?.["3rd_qqRobot_switch"], getColor("blue_1"))
                  }, [
                    m("div", { style: { fontSize: "1.1rem" } }, trs("QQBot/官方", { cn: "官方机器人", en: "Official Bot" })),
                    m("div", { style: { opacity: "0.4", fontSize: "0.8rem" } }, config?.["3rd_qqRobot_appid"] || "Not Configured")
                  ])
                ]
              ),

              m("div", { style: { marginTop: "0.5rem" } }, [
                m("div", { style: { marginBottom: "0.8rem", opacity: "0.2", fontSize: "0.8rem", marginLeft: "1.2rem" } }, trs("QQBot/活跃群组", { cn: "活跃群组管理", en: "ACTIVE GROUPS" })),
                m("div", { style: { display: "flex", flexDirection: "column", gap: "0.6rem" } },
                  [
                    ...(config?.["3rd_qqRobot_groups"] || []).filter(g => g.switch).map(group => m("div", {
                      key: "official-" + group.groupid,
                      style: {
                        padding: "0.8rem 1.5rem",
                        borderRadius: "5rem",
                        background: getColor("gray_2").back,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: `0.1rem solid ${theme.front}05`
                      }
                    }, [
                      m("div", [
                        m("span", { style: { color: theme.front } }, group.name),
                        m("span", { style: { opacity: "0.2", marginLeft: "0.8rem", fontSize: "0.8rem" } }, group.groupid),
                        m("span", { style: { opacity: "0.3", marginLeft: "0.6rem", fontSize: "0.7rem", color: getColor("blue_1").back } }, "官方")
                      ]),
                      m("div", {
                        style: { padding: "0.3rem 1.2rem", borderRadius: "3rem", background: mainColor.back, color: mainColor.front, cursor: "pointer", fontSize: "0.85rem" },
                        onclick: () => settingData.fnCall("appDispatch", [appId, "openAgentWindow", { listId: group.listId, name: group.name }])
                      }, trs("查看", { cn: "查看", en: "View" }))
                    ])),
                    ...(config?.["3rd_qqRobotLocal_groups"] || []).filter(g => g.switch).map(group => m("div", {
                      key: "local-" + group.groupid,
                      style: {
                        padding: "0.8rem 1.5rem",
                        borderRadius: "5rem",
                        background: getColor("gray_2").back,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: `0.1rem solid ${theme.front}05`
                      }
                    }, [
                      m("div", [
                        m("span", { style: { color: theme.front } }, group.name),
                        m("span", { style: { opacity: "0.2", marginLeft: "0.8rem", fontSize: "0.8rem" } }, group.groupid),
                        m("span", { style: { opacity: "0.3", marginLeft: "0.6rem", fontSize: "0.7rem", color: getColor("green_1").back } }, "本地")
                      ]),
                      m("div", {
                        style: { padding: "0.3rem 1.2rem", borderRadius: "3rem", background: mainColor.back, color: mainColor.front, cursor: "pointer", fontSize: "0.85rem" },
                        onclick: () => settingData.fnCall("appDispatch", [appId, "openAgentWindow", { listId: group.listId, name: group.name }])
                      }, trs("查看", { cn: "查看", en: "View" }))
                    ]))
                  ]
                )
              ])
            ]
          )
        ]
      );
    }
  };
};
