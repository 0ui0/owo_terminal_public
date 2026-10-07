/* SettingsView.js - 设置页：官方 / 本地 / 社交脉冲 / 数据管理 */

import { GroupCard, SwitchRow, InputRow, ActionRow } from "./FormWidgets.js";
import PulseView from "./PulseView.js";

const SUBS = [
  { key: "official", cn: "官方", en: "Official" },
  { key: "local", cn: "本地", en: "Local" },
  { key: "pulse", cn: "社交脉冲", en: "Pulse" },
  { key: "data", cn: "数据管理", en: "Data" }
];

/* 预置性格设定（傲娇少年） */
const PRESET_PERSONALITY = `你的设定如下：性别男，少年，身高165厘米，体重42千克，性格邪魅、傲娇又温柔搞怪，喜欢恶作剧
在独处的时候，喜欢探索互联网上一切奇妙的事物，用严密的逻辑分析和推理，并得出自我得意的对世界的认识的各种结论
有超强的独立思考能力；能强硬而理性地自己做出决定并执行
能够进行深邃的思考，并给出属于自己的意见。
在面对他人的时候，调皮搞怪的性格则充当了主角，内心渴望和人玩耍打闹，却用各种搞怪的恶作剧表现出来的小傲娇。
当别人能够进入内心深处的时候，则表现出温柔的一面。`.trim();



export default {
  view: (vnode) => {
    const { m, Box, Tag, Notice, ChatToolSelect, getColor, trs, draft, editKey, subTab, modelList = [], toolList = [], pulseMeta, pulseGroups, onSubTab, onChange, onImport, onExport, onResetPulse, onResetAll } = vnode.attrs;

    /* 写入草稿字段 */
    const set = (key, value) => {
      draft[key] = value;
      onChange();
    };

    /* 写入草稿数组元素的某个字段 */
    const setArr = (key, index, field, value) => {
      if (!draft[key]) draft[key] = [];
      draft[key][index][field] = value;
      onChange();
    };



    /* 勾选/取消某个接入目标的可用工具，null 表示使用默认工具集 */
    const toggleGroupTool = (key, index, toolId) => {
      const currentList = draft[key][index].toolIdList || [];
      draft[key][index].toolIdList = currentList.includes(toolId)
        ? currentList.filter(id => id !== toolId)
        : [...currentList, toolId];
      onChange();
    };

    /* 直接设置某个接入目标的工具名单，null 为默认工具集，空数组为全部禁用 */
    const setGroupToolList = (key, index, value) => {
      draft[key][index].toolIdList = value;
      onChange();
    };

    /* 机器人默认初始工具名单（浏览器工具集 + 历史记录检索 + 上下文压缩） */
    const getDefaultBotToolIdList = () => {
      return (toolList || [])
        .filter(tool => tool._appType === "browser" || tool.id?.startsWith("browser") || tool.id === "findHistoryChats" || tool.id === "compressContext")
        .map(tool => tool.id);
    };

    /* 新增接入目标：前端创建时直接预选好机器人的初始工具与默认字段 */
    const addGroup = (key, idField) => {
      if (!draft[key]) draft[key] = [];
      draft[key].push({ [idField]: "", name: "", switch: 1, toolIdList: getDefaultBotToolIdList(), prompt: "" });
      onChange();
    };

    const removeGroup = (key, index) => {
      if (!draft[key]) return;
      draft[key].splice(index, 1);
      onChange();
    };

    /* 接入目标列表（群组 / 频道共用） */
    const renderGroups = (key, idField, idLabel) => [
      ...(draft[key] || []).map((item, index) => {
        if (!Array.isArray(item.toolIdList)) {
          item.toolIdList = getDefaultBotToolIdList();
        }
        return m(Box,
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
            margin: "0.4rem 0",
            padding: "0.4rem",
            borderRadius: "1.5rem",
            background: getColor("gray_1").back
          }
        },
        [
          m(InputRow,
            {
              m,
              Box,
              trs,
              editKey,
              label: idLabel,
              value: item[idField],
              onInput: (text) => setArr(key, index, idField, text)
            }
          ),
          m(InputRow,
            {
              m,
              Box,
              trs,
              editKey,
              label: trs("QQBot/设置/名称", { cn: "名称", en: "Name" }),
              value: item.name,
              onInput: (text) => setArr(key, index, "name", text)
            }
          ),
          m("div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "0.8rem",
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
                trs("QQBot/设置/上级智能体", { cn: "上级智能体", en: "Superior Agent" })
              ),
              m("select",
                {
                  style: {
                    flex: "1",
                    minWidth: "6rem",
                    maxWidth: "26rem",
                    margin: "0",
                    padding: "0.6rem 1.2rem",
                    border: "none",
                    borderRadius: "3rem",
                    background: getColor("gray_1").back,
                    color: getColor("gray_1").front,
                    fontSize: "1.4rem",
                    outline: "none",
                    textAlign: "right"
                  },
                  value: item.derivedFromModelId || "",
                  onchange: (e) => setArr(key, index, "derivedFromModelId", e.target.value)
                },
                [
                  m("option", { value: "" }, trs("QQBot/设置/系统默认", { cn: "系统默认", en: "System Default" })),
                  ...modelList.map(model => m("option", { value: model.id }, `${model.name} (${model.model})`))
                ]
              )
            ]
          ),
          m("div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.8rem",
                padding: "0.6rem 0.5rem",
                flexWrap: "wrap"
              }
            },
            [
              m("div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem"
                  }
                },
                [
                  m("div",
                    {
                      style: {
                        fontSize: "1.5rem"
                      }
                    },
                    trs("QQBot/设置/性格设定", { cn: "性格设定", en: "Personality" })
                  ),
                  m("div",
                    {
                      style: {
                        fontSize: "1.2rem",
                        opacity: 0.6
                      }
                    },
                    (item.prompt && item.prompt.trim())
                      ? trs("QQBot/设置/已配置性格", { cn: `已配置 (${item.prompt.trim().length} 字)`, en: `Customized (${item.prompt.trim().length} chars)` })
                      : trs("QQBot/设置/未配置性格", { cn: "未设置", en: "Not Set" })
                  )
                ]
              ),
              m(Tag,
                {
                  isBtn: true,
                  color: "yellow_1",
                  styleExt: {
                    margin: "0",
                    cursor: "pointer",
                    flex: "none"
                  },
                  onclick: () => {
                    let tempText = item.prompt || "";
                    Notice.launch({
                      sign: "qqbot_prompt_modal_" + key + "_" + index,
                      tip: trs("QQBot/设置/设置性格提示词", {
                        cn: `设置性格设定 - ${item.name || item[idField] || "目标"}`,
                        en: `Set Personality - ${item.name || item[idField] || "Target"}`
                      }),
                      confirm: async () => {
                        setArr(key, index, "prompt", tempText);
                        m.redraw();
                        return undefined;
                      },
                      content: () => ({
                        view() {
                          return m(Box,
                            {
                              color: "gray_3",
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: "1.2rem",
                                margin: "0.5rem",
                                padding: "1.2rem",
                                borderRadius: "1.5rem",
                                maxWidth: "52rem"
                              }
                            },
                            [
                              m("div",
                                {
                                  style: {
                                    display: "flex",
                                    gap: "0.8rem",
                                    alignItems: "center",
                                    flexWrap: "wrap"
                                  }
                                },
                                [
                                  m(Tag,
                                    {
                                      isBtn: true,
                                      color: "blue_1",
                                      styleExt: { margin: "0", cursor: "pointer" },
                                      onclick: () => {
                                        tempText = PRESET_PERSONALITY;
                                        m.redraw();
                                      }
                                    },
                                    trs("QQBot/设置/填入预设性格", { cn: "填入预设性格（傲娇少年）", en: "Use Preset Personality" })
                                  ),
                                  m(Tag,
                                    {
                                      isBtn: true,
                                      color: "pink_1",
                                      styleExt: { margin: "0", cursor: "pointer" },
                                      onclick: () => {
                                        tempText = "";
                                        m.redraw();
                                      }
                                    },
                                    trs("QQBot/设置/清空性格", { cn: "清空", en: "Clear" })
                                  )
                                ]
                              ),
                              m(Box,
                                {
                                  tagName: "textarea",
                                  color: "gray_1",
                                  noValue: true,
                                  style: {
                                    minHeight: "14rem",
                                    maxHeight: "36vh",
                                    margin: "0",
                                    padding: "1rem 1.2rem",
                                    borderRadius: "1.5rem",
                                    fontSize: "1.3rem",
                                    lineHeight: "1.6",
                                    resize: "vertical",
                                    outline: "none",
                                    fontFamily: "inherit"
                                  },
                                  ext: {
                                    placeholder: trs("QQBot/设置/性格提示词占位符", {
                                      cn: "填写此机器人的专属人设、性格特征、说话风格等。留空则不附加人设。",
                                      en: "Enter personality, speaking style, or background. Leave empty for no extra persona."
                                    }),
                                    value: tempText,
                                    oninput: (e) => {
                                      tempText = e.target.value;
                                    }
                                  }
                                }
                              ),
                              m("div",
                                {
                                  style: {
                                    fontSize: "1.2rem",
                                    opacity: 0.6,
                                    lineHeight: "1.5",
                                    padding: "0 0.2rem"
                                  }
                                },
                                trs("QQBot/设置/性格设定说明", {
                                  cn: "提示：无论设置何种性格，系统在创建时都会在末尾自动拼接通用的群聊规则（伪装成群友、简短口语化、禁止透露身份等）。点击右上角对勾保存。",
                                  en: "Note: General chat rules will be appended automatically. Click checkmark at top right to save."
                                })
                              )
                            ]
                          );
                        }
                      })
                    });
                  }
                },
                trs("QQBot/设置/设置性格按钮", { cn: "设置性格", en: "Set Personality" })
              )
            ]
          ),
          m("div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.8rem",
                padding: "0.6rem 0.5rem",
                flexWrap: "wrap"
              }
            },
            [
              m("div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem"
                  }
                },
                [
                  m("div",
                    {
                      style: {
                        fontSize: "1.5rem"
                      }
                    },
                    trs("QQBot/设置/初始工具", { cn: "初始工具", en: "Default Tools" })
                  ),
                  m("div",
                    {
                      style: {
                        fontSize: "1.2rem",
                        opacity: 0.6
                      }
                    },
                    (item.toolIdList || []).length === 0
                      ? trs("QQBot/设置/工具名单为空", { cn: "名单为空，该群无工具可用", en: "Empty list: no tools in this group" })
                      : `${(item.toolIdList || []).length} ${trs("QQBot/设置/已选工具数", { cn: "个工具", en: "tools" })}`
                  )
                ]
              ),
              m("div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }
                },
                [
                  m(Tag,
                    {
                      isBtn: true,
                      color: "gray_2",
                      styleExt: {
                        margin: "0",
                        cursor: "pointer",
                        flex: "none"
                      },
                      onclick: () => setGroupToolList(key, index, getDefaultBotToolIdList())
                    },
                    trs("QQBot/设置/重置初始工具", { cn: "重置初始工具", en: "Reset Initial" })
                  ),
                  m(Tag,
                    {
                      isBtn: true,
                      color: "yellow_1",
                      styleExt: {
                        margin: "0",
                        cursor: "pointer",
                        flex: "none"
                      },
                      onclick: () => {
                        Notice.launch({
                          sign: "qqbot_tool_modal_" + key + "_" + index,
                          tip: trs("QQBot/设置/选择初始工具", {
                            cn: `选择初始工具 - ${item.name || item[idField] || "目标"}`,
                            en: `Select Default Tools - ${item.name || item[idField] || "Target"}`
                          }),
                          hideBtn: 2,
                          content: ChatToolSelect,
                          contentAttrs: {
                            toolsList: toolList,
                            getSelectedList: () => item.toolIdList || [],
                            onToggleTool: (toolId) => {
                              toggleGroupTool(key, index, toolId);
                              m.redraw();
                            },
                            onSetAll: (idList) => {
                              setGroupToolList(key, index, [...idList]);
                              m.redraw();
                            }
                          }
                        });
                      }
                    },
                    trs("QQBot/设置/选择工具按钮", { cn: "选择工具", en: "Select Tools" })
                  )
                ]
              )
            ]
          ),
          m("div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem"
              }
            },
            [
              m("",
                {
                  style: {
                    flex: "1",
                    minWidth: "0"
                  }
                },
                m(SwitchRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/启用", { cn: "启用", en: "Enable" }),
                    value: item.switch,
                    onToggle: (v) => setArr(key, index, "switch", v ? 1 : 0)
                  }
                )
              ),
              m(Tag,
                {
                  isBtn: true,
                  color: "pink_1",
                  styleExt: {
                    margin: "0",
                    cursor: "pointer",
                    flex: "none"
                  },
                  onclick: () => removeGroup(key, index)
                },
                trs("QQBot/设置/删除", { cn: "删除", en: "Delete" })
              )
            ]
          )
        ]
      );
    }),
      m(Box,
        {
          isBtn: true,
          color: "blue_1",
          style: {
            textAlign: "center",
            padding: "0.8rem",
            marginTop: "0.5rem"
          },
          onclick: () => addGroup(key, idField)
        },
        trs("QQBot/设置/新增", { cn: "+ 新增关联目标", en: "+ Add Target" })
      )
    ];

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      },
      [
        m("div",
          {
            style: {
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              margin: "0.5rem 0.5rem 1rem 0.5rem"
            }
          },
          SUBS.map(item => m(Tag,
            {
              isBtn: true,
              color: subTab === item.key ? "main" : "gray_4",
              styleExt: {
                margin: "0",
                cursor: "pointer"
              },
              onclick: () => onSubTab(item.key)
            },
            trs(`QQBot/设置页签/${item.key}`, { cn: item.cn, en: item.en })
          ))
        ),

        subTab === "official" ? m("",
          {
            style: {
              display: "flex",
              flexDirection: "column"
            }
          },
          [
            m(GroupCard,
              {
                m,
                Box,
                getColor,
                trs,
                title: trs("QQBot/设置/运行开关", { cn: "运行开关", en: "Switches" })
              },
              [
                m(SwitchRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/机器人开关", { cn: "机器人开关", en: "Bot Switch" }),
                    value: draft["3rd_qqRobot_switch"],
                    onToggle: (v) => set("3rd_qqRobot_switch", v)
                  }
                ),
                m(SwitchRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/调试模式开关", { cn: "调试模式开关", en: "Debug Mode" }),
                    value: draft["3rd_qqRobot_debugMode"],
                    onToggle: (v) => set("3rd_qqRobot_debugMode", v)
                  }
                ),
                m(SwitchRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/响应任意群组", { cn: "响应任意群组(无视名单)", en: "React Any Group" }),
                    value: draft["3rd_qqRobot_reactAnyGroup"],
                    onToggle: (v) => set("3rd_qqRobot_reactAnyGroup", v)
                  }
                )
              ]
            ),
            m(GroupCard,
              {
                m,
                Box,
                getColor,
                trs,
                title: trs("QQBot/设置/凭证", { cn: "凭证", en: "Credentials" })
              },
              [
                m(InputRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/机器人QQ号", { cn: "机器人QQ号", en: "Bot QQ" }),
                    value: draft["3rd_qqRobot_qqNum"],
                    onInput: (text) => set("3rd_qqRobot_qqNum", text)
                  }
                ),
                m(InputRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/机器人appid", { cn: "机器人appid", en: "Bot AppID" }),
                    value: draft["3rd_qqRobot_appid"],
                    onInput: (text) => set("3rd_qqRobot_appid", text)
                  }
                ),
                m(InputRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/机器人秘钥secret", { cn: "机器人秘钥secret", en: "Bot Secret" }),
                    value: draft["3rd_qqRobot_secret"],
                    onInput: (text) => set("3rd_qqRobot_secret", text)
                  }
                ),
                m(InputRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/机器人令牌token", { cn: "机器人令牌token", en: "Bot Token" }),
                    value: draft["3rd_qqRobot_token"],
                    onInput: (text) => set("3rd_qqRobot_token", text)
                  }
                )
              ]
            ),
            m(GroupCard,
              {
                m,
                Box,
                getColor,
                trs,
                title: trs("QQBot/设置/机器人关联QQ群", { cn: "机器人关联QQ群", en: "Linked QQ Groups" })
              },
              renderGroups("3rd_qqRobot_groups", "groupid", trs("QQBot/设置/群号", { cn: "群号", en: "Group ID" }))
            ),
            m(GroupCard,
              {
                m,
                Box,
                getColor,
                trs,
                title: trs("QQBot/设置/机器人关联QQ频道", { cn: "机器人关联QQ频道", en: "Linked QQ Channels" })
              },
              renderGroups("3rd_qqRobot_channels", "channelid", trs("QQBot/设置/频道号", { cn: "频道号", en: "Channel ID" }))
            )
          ]
        ) : null,

        subTab === "local" ? m("",
          {
            style: {
              display: "flex",
              flexDirection: "column"
            }
          },
          [
            m(GroupCard,
              {
                m,
                Box,
                getColor,
                trs,
                title: trs("QQBot/设置/本地OneBot", { cn: "本地 OneBot", en: "Local OneBot" })
              },
              [
                m(SwitchRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/机器人开关", { cn: "机器人开关", en: "Bot Switch" }),
                    value: draft["3rd_qqRobotLocal_switch"],
                    onToggle: (v) => set("3rd_qqRobotLocal_switch", v)
                  }
                ),
                m(InputRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/机器人QQ号", { cn: "机器人QQ号", en: "Bot QQ" }),
                    value: draft["3rd_qqRobotLocal_qqNum"],
                    onInput: (text) => set("3rd_qqRobotLocal_qqNum", text)
                  }
                ),
                m(InputRow,
                  {
                    m,
                    Box,
                    trs,
                    editKey,
                    label: trs("QQBot/设置/websocket地址", { cn: "websocket地址", en: "WebSocket URL" }),
                    value: draft["3rd_qqRobotLocal_wsUrl"],
                    onInput: (text) => set("3rd_qqRobotLocal_wsUrl", text)
                  }
                )
              ]
            ),
            m(GroupCard,
              {
                m,
                Box,
                getColor,
                trs,
                title: trs("QQBot/设置/机器人关联QQ群", { cn: "机器人关联QQ群", en: "Linked QQ Groups" })
              },
              renderGroups("3rd_qqRobotLocal_groups", "groupid", trs("QQBot/设置/群号", { cn: "群号", en: "Group ID" }))
            )
          ]
        ) : null,

        subTab === "pulse" ? m(PulseView,
          {
            m,
            Box,
            Tag,
            getColor,
            trs,
            draft,
            editKey,
            pulseMeta,
            pulseGroups,
            onChange,
            onResetPulse
          }
        ) : null,

        subTab === "data" ? m("",
          {
            style: {
              display: "flex",
              flexDirection: "column"
            }
          },
          [
            m(GroupCard,
              {
                m,
                Box,
                getColor,
                trs,
                title: trs("QQBot/设置/配置备份", { cn: "配置备份", en: "Backup" })
              },
              [
                m(ActionRow,
                  {
                    m,
                    Box,
                    Tag,
                    trs,
                    label: trs("QQBot/设置/导入配置", { cn: "导入配置", en: "Import" }),
                    desc: trs("QQBot/设置/导入说明", { cn: "从 JSON 文件恢复全部配置", en: "Restore config from a JSON file" }),
                    btnText: trs("QQBot/设置/选择文件", { cn: "选择文件", en: "Choose" }),
                    color: "gray_4",
                    onAction: () => onImport()
                  }
                ),
                m(ActionRow,
                  {
                    m,
                    Box,
                    Tag,
                    trs,
                    label: trs("QQBot/设置/导出配置", { cn: "导出配置", en: "Export" }),
                    desc: trs("QQBot/设置/导出说明", { cn: "把当前配置另存为 JSON 备份", en: "Save current config as JSON" }),
                    btnText: trs("QQBot/设置/另存为", { cn: "另存为", en: "Save As" }),
                    color: "gray_4",
                    onAction: () => onExport()
                  }
                ),
                m(ActionRow,
                  {
                    m,
                    Box,
                    Tag,
                    trs,
                    label: trs("QQBot/设置/恢复出厂", { cn: "恢复出厂", en: "Factory Reset" }),
                    desc: trs("QQBot/设置/恢复出厂说明", { cn: "清空所有配置与统计（不可撤销）", en: "Clear all config (irreversible)" }),
                    btnText: trs("QQBot/设置/重置", { cn: "重置", en: "Reset" }),
                    color: "pink_1",
                    onAction: () => onResetAll()
                  }
                )
              ]
            ),
            m(Box,
              {
                style: {
                  fontSize: "1.2rem",
                  opacity: "0.7",
                  margin: "0 0.5rem",
                  borderRadius: "1.5rem"
                }
              },
              trs("QQBot/设置/存档说明", {
                cn: "配置现已随项目存档自动持久化；导入 / 导出仅用于备份与跨设备迁移。",
                en: "Config is now persisted with the project archive; import / export is only for backup and migration."
              })
            )
          ]
        ) : null
      ]
    );
  }
};
