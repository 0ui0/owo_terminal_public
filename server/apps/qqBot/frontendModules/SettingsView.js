/* SettingsView.js - Version 18: Pixel Perfect Layout */
export default ({ m, trs, getColor, config, outState, modelList = [] }) => {

  let currentTab = "official";
  outState.draft = JSON.parse(JSON.stringify(config || {}));

  const styles = {
    input: (theme) => ({
      width: "100%",
      padding: "0.6rem 1rem",
      background: getColor("gray_1").back,
      borderRadius: "3rem",
      border: `0.1rem solid ${theme.front}`,
      color: theme.front,
      outline: "none",
      boxSizing: "border-box",
      transition: "all 0.3s ease"
    }),
    btn: (color, isSlim = false) => ({
      padding: isSlim ? "0.4rem 1.2rem" : "0.7rem 1.8rem",
      background: color.back,
      color: color.front,
      borderRadius: "3rem",
      cursor: "pointer",
      textAlign: "center",
      userSelect: "none",
      transition: "all 0.2s",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }),
    switch: (active, theme) => ({
      width: "3.2rem",
      height: "1.6rem",
      background: active ? getColor("main").back : "rgba(0,0,0,0.1)",
      borderRadius: "3rem",
      position: "relative",
      cursor: "pointer",
      transition: "all 0.3s ease",
      flexShrink: 0
    }),
    switchDot: (active) => ({
      width: "1.2rem",
      height: "1.2rem",
      background: "white",
      borderRadius: "50%",
      position: "absolute",
      top: "0.2rem",
      left: active ? "1.8rem" : "0.2rem",
      transition: "all 0.3s ease",
      boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
      pointerEvents: "none"
    })
  };

  const renderSwitch = (label, key, theme) => m("div", { style: { marginBottom: "1.2rem", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.2rem" } }, [
    m("div", { style: { opacity: "0.4" } }, trs(label, { cn: label, en: label })),
    m("div", {
      style: styles.switch(!!outState.draft[key], theme),
      onclick: (e) => {
        e.stopPropagation();
        outState.draft[key] = outState.draft[key] ? 0 : 1;
        m.redraw();
      }
    }, m("div", { style: styles.switchDot(!!outState.draft[key]) }))
  ]);

  const renderField = (label, key, theme) => m("div", { style: { marginBottom: "1rem" } }, [
    m("div", { style: { opacity: "0.3", marginBottom: "0.3rem", marginLeft: "1.2rem", fontSize: "0.85rem" } }, trs(label, { cn: label, en: label })),
    m("input", {
      style: styles.input(theme),
      value: outState.draft[key] !== undefined ? outState.draft[key] : "",
      oninput: (e) => {
        outState.draft[key] = (key.includes("qqNum")) ? (parseInt(e.target.value) || 0) : e.target.value;
      }
    })
  ]);

  const renderGroupArray = (key, labelId, theme) => {
    if (!outState.draft[key]) outState.draft[key] = [];
    return m("div", { style: { marginTop: "1.5rem" } }, [
      m("div", { style: { marginBottom: "0.8rem", opacity: "0.25", marginLeft: "1.2rem" } }, trs("关联列表", { cn: "关联群组列表", en: "Group List" })),
      m("div", { style: { display: "flex", flexDirection: "column", gap: "1rem" } }, [
        outState.draft[key].map((item, index) => m("div", {
          style: {
            padding: "1rem",
            background: getColor("gray_1").back,
            border: `1px solid ${theme.front}05`,
            borderRadius: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem"
          }
        }, [
          // 第一行：输入框网格
          m("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" } }, [
            m("div", [
              m("div", { style: { opacity: "0.25", marginLeft: "0.8rem", fontSize: "0.8rem", marginBottom: "0.2rem" } }, labelId),
              m("input", { style: styles.input(theme), value: item.groupid || item.channelid || "", oninput: (e) => key.includes("channels") ? item.channelid = e.target.value : item.groupid = e.target.value })
            ]),
            m("div", [
              m("div", { style: { opacity: "0.25", marginLeft: "0.8rem", fontSize: "0.8rem", marginBottom: "0.2rem" } }, trs("名称", { cn: "名称", en: "Name" })),
              m("input", { style: styles.input(theme), value: item.name, oninput: (e) => item.name = e.target.value })
            ])
          ]),

          // 上级智能体选择
          modelList.length > 0 ? m("div", { style: { display: "flex", alignItems: "center", gap: "0.8rem", marginTop: "0.2rem" } }, [
            m("div", { style: { opacity: "0.25", fontSize: "0.8rem", flexShrink: 0 } }, trs("上级智能体", { cn: "上级智能体", en: "Superior Agent" })),
            m("select", {
              style: { ...styles.input(theme), padding: "0.4rem 0.8rem", width: "100%" },
              value: item.derivedFromAgentName || "",
              onchange: (e) => { item.derivedFromAgentName = e.target.value; }
            }, [
              m("option", { value: "" }, trs("系统默认", { cn: "系统默认", en: "System Default" })),
              modelList.map(mdl =>
                m("option", { value: mdl.name, key: mdl.name }, `${mdl.name} (${mdl.model})`)
              )
            ])
          ]) : null,

          // 第二行：操作栏
          m("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.5rem" } }, [
            m("div", { style: { display: "flex", alignItems: "center", gap: "0.6rem" } }, [
              m("div", { style: { opacity: "0.3", fontSize: "0.85rem" } }, trs("启用", { cn: "启用", en: "Enable" })),
              m("div", {
                style: styles.switch(!!item.switch, theme),
                onclick: (e) => {
                  e.stopPropagation();
                  item.switch = item.switch ? 0 : 1;
                  m.redraw();
                }
              }, m("div", { style: styles.switchDot(!!item.switch) }))
            ]),
            m("div", {
              style: { ...styles.btn(getColor("pink_1"), true), fontSize: "0.8rem", opacity: 0.8 },
              onclick: (e) => {
                e.stopPropagation();
                outState.draft[key].splice(index, 1);
                m.redraw();
              }
            }, trs("删除", { cn: "删除", en: "Del" }))
          ])
        ])),
        m("div", {
          style: { ...styles.btn(getColor("blue_1"), true), padding: "0.8rem", marginTop: "0.5rem" },
          onclick: (e) => {
            e.stopPropagation();
            const newItem = key.includes("channels") ? { channelid: "0", name: "New", switch: 1, derivedFromAgentName: "" } : { groupid: "0", name: "New", switch: 1, derivedFromAgentName: "" };
            outState.draft[key].push(newItem);
            m.redraw();
          }
        }, trs("新增条目", { cn: "+ 新增关联目标", en: "+ Add Item" }))
      ])
    ]);
  };

  return {
    view() {
      const theme = getColor("gray_4");
      const activeColor = getColor("main");
      return m("div",
        {
          style: {
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: getColor("gray_1").back,
            color: theme.front,
            overflow: "hidden"
          }
        },
        [
          m("div",
            {
              style: {
                display: "flex",
                background: getColor("gray_12").back,
                padding: "0.6rem 1rem",
                gap: "0.6rem",
                justifyContent: "center"
              }
            },
            [
              m("div", {
                style: { ...styles.btn(currentTab === "official" ? activeColor : getColor("gray_4"), true), flex: 1, maxWidth: "10rem" },
                onclick: (e) => { e.stopPropagation(); currentTab = "official"; m.redraw(); }
              }, trs("官方版", { cn: "官方版", en: "Official" })),
              m("div", {
                style: { ...styles.btn(currentTab === "local" ? activeColor : getColor("gray_4"), true), flex: 1, maxWidth: "10rem" },
                onclick: (e) => { e.stopPropagation(); currentTab = "local"; m.redraw(); }
              }, trs("本地版", { cn: "本地版", en: "Local" }))
            ]
          ),

          m("div",
            {
              style: {
                flex: 1,
                overflowY: "auto",
                padding: "1.2rem",
                paddingBottom: "2rem"
              }
            },
            [
              currentTab === "official" ? [
                renderSwitch("机器人总开关", "3rd_qqRobot_switch", theme),
                renderSwitch("调试模式开关", "3rd_qqRobot_debugMode", theme),
                renderSwitch("响应任意群组", "3rd_qqRobot_reactAnyGroup", theme),
                renderField("机器人 QQ 号", "3rd_qqRobot_qqNum", theme),
                renderField("AppID", "3rd_qqRobot_appid", theme),
                renderField("令牌 Token", "3rd_qqRobot_token", theme),
                renderField("秘钥 Secret", "3rd_qqRobot_secret", theme),
                renderGroupArray("3rd_qqRobot_groups", "群号", theme),
                renderGroupArray("3rd_qqRobot_channels", "频道号", theme)
              ] : [
                renderSwitch("机器人总开关", "3rd_qqRobotLocal_switch", theme),
                renderField("机器人 QQ 号", "3rd_qqRobotLocal_qqNum", theme),
                renderField("WebSocket 地址", "3rd_qqRobotLocal_wsUrl", theme),
                renderGroupArray("3rd_qqRobotLocal_groups", "群号", theme)
              ]
            ]
          )
        ]
      );
    }
  };
};
