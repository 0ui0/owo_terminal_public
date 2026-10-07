/* frontend.js - qqBot 前端入口：工作台外壳（标题栏 + 三页签 + 保存条） */
import qqBotData from "./qqBotData.js";
import HomeView from "./frontendModules/HomeView.js";
import ConsoleView from "./frontendModules/ConsoleView.js";
import SettingsView from "./frontendModules/SettingsView.js";

const TABS = [
  { key: "home", cn: "总览", en: "Overview" },
  { key: "log", cn: "控制台", en: "Console" },
  { key: "set", cn: "设置", en: "Settings" }
];

export default ({ appId, m, Notice, ioSocket, commonData, iconPark, getColor, trs, settingData, Box, Tag, sysMenu, ChatToolSelect }) => {

  let config = {};
  let modelList = [];
let toolList = [];
  let pulseMeta = {};
  let pulseGroups = [];
  let status = {};
  let logs = [];
  let lastLogId = 0;
  let tab = "home";
  let subTab = "official";
  let draft = null;
  let dirty = false;
  let editKey = 0;
  let filterLevel = "all";
  let autoScroll = true;
  let redrawTimer = null;
  let cfgFilePath = null; // 当前绑定的配置文件路径（“保存”会直接写回它）

  const instanceInterface = {
    onDispatch: (msg, callback) => {
      try {
        if (msg.action === "updateConfig") {
          config = msg.args.config || {};
          m.redraw();
        }
        if (msg.action === "log") {
          logs.push(msg.args);
          if (logs.length > 500) {
            logs.splice(0, logs.length - 500);
          }
          lastLogId = msg.args.id;
          // 日志可能成串涌入，节流重绘避免主线程打满
          if (!redrawTimer) {
            redrawTimer = setTimeout(() => {
              redrawTimer = null;
              m.redraw();
            }, 120);
          }
        }
      } catch (err) {
        console.log(err);
      }
      if (callback) callback({ ok: true, msg: "OK" });
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

  /* 拉取配置 / 状态 / 日志快照 */
  const fetchAll = async () => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "getConfig", {}]);
      if (res && res.ok) {
        config = res.data || {};
        modelList = settingData.options.get("ai_aiList")?.filter(item => item.switch) || [];
        const toolRes = await settingData.fnCall("getToolsList", [0, "all"]);
        if (toolRes && toolRes.ok) {
          toolList = toolRes.data || [];
        }
        pulseMeta = res.pulseMeta || {};
        pulseGroups = res.pulseGroups || [];
        if (!dirty) {
          draft = JSON.parse(JSON.stringify(config));
        }
      }
      const statusRes = await settingData.fnCall("appDispatch", [appId, "getStatus", {}]);
      if (statusRes && statusRes.ok) {
        status = statusRes.data || {};
      }
      const logsRes = await settingData.fnCall("appDispatch", [appId, "getLogs", { sinceId: lastLogId }]);
      if (logsRes && logsRes.ok && Array.isArray(logsRes.data)) {
        logs = logs.concat(logsRes.data).slice(-500);
        lastLogId = logs.length ? logs[logs.length - 1].id : lastLogId;
      }
      m.redraw();
    } catch (err) {
      console.log(err);
    }
  };

  /* 保存草稿到后端（后端会同步打上存档脏标记） */
  const saveDraft = async () => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "updateConfig", draft]);
      if (res && res.ok) {
        config = JSON.parse(JSON.stringify(draft));
        dirty = false;
        editKey++;
        Notice.launch({ msg: res.msg });
      } else {
        Notice.launch({ tip: trs("QQBot/保存失败", { cn: "保存失败", en: "Save Failed" }), msg: res && res.msg ? res.msg : "未知错误" });
      }
    } catch (err) {
      console.log(err);
      Notice.launch({ tip: trs("QQBot/保存失败", { cn: "保存失败", en: "Save Failed" }), msg: err.message });
    }
  };

  /* 丢弃草稿 */
  const discardDraft = () => {
    draft = JSON.parse(JSON.stringify(config));
    dirty = false;
    editKey++;
    m.redraw();
  };

  /* 打开：从 JSON 文件载入配置（对应菜单「打开」） */
  const openConfig = async () => {
    try {
      const dialogRes = await settingData.fnCall("appOpenDialog", [{ filters: [{ name: "JSON", extensions: ["json"] }] }]);
      if (!dialogRes || !dialogRes.ok || dialogRes.canceled) return;
      const readRes = await settingData.fnCall("appDispatch", [appId, "readFile", { filePath: dialogRes.filePath }]);
      if (!readRes || !readRes.ok || !readRes.data) return;

      const loaded = JSON.parse(readRes.data);

      // 打开即生效：先提交给后端，让机器人立刻按新配置工作（对齐记事本的「打开」语义）
      const res = await settingData.fnCall("appDispatch", [appId, "updateConfig", loaded]);
      if (!res || !res.ok) {
        Notice.launch({ tip: trs("QQBot/菜单/打开失败", { cn: "打开失败", en: "Open Failed" }), msg: res && res.msg ? res.msg : "写入配置失败" });
        return;
      }

      draft = JSON.parse(JSON.stringify(loaded));
      cfgFilePath = dialogRes.filePath;
      dirty = false;
      editKey++;
      m.redraw();
      Notice.launch({ msg: trs("QQBot/菜单/打开成功", { cn: "配置已打开并生效", en: "Config opened and applied" }) });
    } catch (err) {
      console.log(err);
      Notice.launch({ tip: trs("QQBot/设置/导入失败", { cn: "导入失败", en: "Import Failed" }), msg: err.message });
    }
  };

  /* 另存为：选择路径并写入（对应菜单「另存为」） */
  const saveConfigAs = async () => {
    try {
      const dialogRes = await settingData.fnCall("appSaveDialog", [{
        filePath: "qqBot_config.json",
        filters: [{ name: "JSON", extensions: ["json"] }]
      }]);
      if (!dialogRes || !dialogRes.ok || !dialogRes.filePath) return;
      cfgFilePath = dialogRes.filePath;
      const saveRes = await settingData.fnCall("appDispatch", [appId, "saveToFile", {
        filePath: dialogRes.filePath,
        content: JSON.stringify(draft || config, null, 2)
      }]);
      if (saveRes && saveRes.ok) {
        Notice.launch({ msg: trs("QQBot/设置/导出成功", { cn: "配置已导出", en: "Exported" }) });
      } else {
        Notice.launch({ tip: trs("QQBot/设置/导出失败", { cn: "导出失败", en: "Export Failed" }), msg: saveRes && saveRes.msg ? saveRes.msg : "写入文件失败" });
      }
    } catch (err) {
      console.log(err);
      Notice.launch({ tip: trs("QQBot/设置/导出失败", { cn: "导出失败", en: "Export Failed" }), msg: err.message });
    }
  };

  /* 保存：已绑定配置文件就直接写回，否则转为“另存为” */
  const saveConfig = async () => {
    try {
      if (!cfgFilePath) {
        await saveConfigAs();
        return;
      }
      const saveRes = await settingData.fnCall("appDispatch", [appId, "saveToFile", {
        filePath: cfgFilePath,
        content: JSON.stringify(draft || config, null, 2)
      }]);
      if (saveRes && saveRes.ok) {
        Notice.launch({ msg: trs("QQBot/菜单/保存成功", { cn: `已保存到 ${cfgFilePath}`, en: `Saved to ${cfgFilePath}` }) });
      } else {
        Notice.launch({ tip: trs("QQBot/菜单/保存失败", { cn: "保存失败", en: "Save Failed" }), msg: saveRes && saveRes.msg ? saveRes.msg : "写入文件失败" });
      }
    } catch (err) {
      console.log(err);
      Notice.launch({ tip: trs("QQBot/菜单/保存失败", { cn: "保存失败", en: "Save Failed" }), msg: err.message });
    }
  };

  /* 恢复默社交脉冲参数 */
  const resetPulse = () => {
    draft.pulseConfig = {};
    dirty = true;
    editKey++;
    m.redraw();
  };

  /* 恢复出厂：清空草稿，需手动保存才生效 */
  const resetAll = () => {
    draft = {};
    dirty = true;
    editKey++;
    m.redraw();
  };

  /* 清空日志 */
  const clearLogs = async () => {
    try {
      logs = [];
      await settingData.fnCall("appDispatch", [appId, "clearLogs", {}]);
      m.redraw();
    } catch (err) {
      console.log(err);
    }
  };

  /* 打开对应群组的智能体窗口 */
  const openAgent = (group) => {
    settingData.fnCall("appDispatch", [appId, "openAgentWindow", { listId: group.listId, name: group.name }]);
  };

  /* 一键启停：同时切换本地与官方总开关 */
  const togglePower = async () => {
    try {
      const isOn = !!(status.localSwitch || status.officialSwitch);
      const res = await settingData.fnCall("appDispatch", [appId, "setPower", { on: !isOn }]);
      if (res && res.ok) {
        Notice.launch({ msg: res.msg });
      } else {
        Notice.launch({ tip: trs("QQBot/操作失败", { cn: "操作失败", en: "Failed" }), msg: res && res.msg ? res.msg : "未知错误" });
      }
      await fetchAll();
    } catch (err) {
      console.log(err);
      Notice.launch({ tip: trs("QQBot/操作失败", { cn: "操作失败", en: "Failed" }), msg: err.message });
    }
  };

  /* 快捷键前置条件：当前活跃窗口属于本 App（对齐 svgEditor 的 checkActiveApp） */
  const checkActiveApp = () => {
    try {
      if (!Notice || !Notice.data || !Notice.data.activeWindowId) return false;
      const activeItem = Notice.data.dataArr.find(i => i._winConfig?.id === Notice.data.activeWindowId);
      if (activeItem) {
        const appIdInWindow = activeItem.sign || activeItem.contentAttrs?.appId;
        if (appIdInWindow && !String(appIdInWindow).startsWith(appId)) return false;
      }
      return true;
    } catch (err) {
      console.log(err);
      return false;
    }
  };

  /* 常用快捷键：Cmd/Ctrl+O 打开、Cmd/Ctrl+S 保存、Cmd/Ctrl+Shift+S 另存为 */
  const onKeydown = (e) => {
    try {
      if (["input", "textarea"].includes(e.target?.tagName?.toLowerCase())) return;
      if (!checkActiveApp()) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = String(e.key || "").toLowerCase();
      if (key === "o") {
        e.preventDefault();
        openConfig();
        return;
      }
      if (key === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          saveConfigAs();
        } else {
          saveConfig();
        }
      }
    } catch (err) {
      console.log(err);
    }
  };

  /* 文件菜单：贴按钮弹出（对齐 editor 的 Notice 菜单 + sysMenu 组件） */
  const openFileMenu = (e) => {
    try {
      if (!sysMenu) return;
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      const target = e?.currentTarget || e?.target;
      const rect = target && typeof target.getBoundingClientRect === "function"
        ? target.getBoundingClientRect()
        : { left: 10, bottom: 40 };

      const closeMenu = (v) => {
        if (v && v.attrs && typeof v.attrs.delete === "function") v.attrs.delete();
      };

      Notice.launch({
        newWindow: true,
        win: { x: Math.max(10, rect.left), y: rect.bottom + 6 },
        sign: `qqBot_menu_${appId}_file`,
        tip: trs("QQBot/菜单/文件", { cn: "文件", en: "File" }),
        content: {
          view: (v) => m(sysMenu,
            {
              menuItems: [
                {
                  id: "open",
                  name: trs("QQBot/菜单/打开", { cn: "打开…", en: "Open…" }),
                  shortcut: "⌘O",
                  onclick: () => {
                    closeMenu(v);
                    openConfig();
                  }
                },
                {
                  id: "save",
                  name: trs("QQBot/菜单/保存", { cn: "保存", en: "Save" }),
                  shortcut: "⌘S",
                  onclick: () => {
                    closeMenu(v);
                    saveConfig();
                  }
                },
                {
                  id: "saveAs",
                  name: trs("QQBot/菜单/另存为", { cn: "另存为…", en: "Save As…" }),
                  shortcut: "⇧⌘S",
                  onclick: () => {
                    closeMenu(v);
                    saveConfigAs();
                  }
                }
              ]
            }
          )
        }
      });
    } catch (err) {
      console.log(err);
    }
  };

  return {
    oninit(vnode) {
      if (vnode.attrs.data && vnode.attrs.data.config) {
        config = vnode.attrs.data.config;
      }

      // 把「文件」菜单挂到系统窗口的标题栏上（对齐编辑器：noticeConfig.titleBar）
      const noticeConfig = vnode.attrs.noticeConfig;
      if (noticeConfig) {
        noticeConfig.titleBar = {
          view: () => m("",
            {
              onpointerdown: (e) => e.stopPropagation(),
              style: {
                display: "flex",
                alignItems: "center",
                height: "100%"
              }
            },
            [
              m(Box,
                {
                  tagName: "div",
                  isBtn: true,
                  color: "main",
                  noValue: true,
                  style: {
                    padding: "0.4rem 1rem",
                    borderRadius: "3rem",
                    fontSize: "1.2rem",
                    display: "inline-flex",
                    alignItems: "center",
                    cursor: "pointer",
                    margin: "0 0.3rem",
                    boxShadow: "0 0.2rem 0.6rem rgba(0, 0, 0, 0.15)",
                    "-webkit-app-region": "no-drag",
                    transition: "opacity 0.2s ease"
                  },
                  ext: {
                    onpointerenter: function () {
                      this.style.opacity = "0.5";
                    },
                    onpointerleave: function () {
                      this.style.opacity = "1";
                    }
                  },
                  onclick: (dom, e) => openFileMenu(e)
                },
                trs("QQBot/菜单/文件", { cn: "文件", en: "File" })
              )
            ]
          )
        };
      }

      fetchAll();
    },
    oncreate() {
      window.addEventListener("keydown", onKeydown);
    },
    onremove() {
      window.removeEventListener("keydown", onKeydown);
      if (redrawTimer) clearTimeout(redrawTimer);
      qqBotData.unregisterInstances(appId, commonData);
    },
    view() {
      const running = !!(status.localSwitch || status.officialSwitch);

      return m("div",
        {
          style: {
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: getColor("gray_1").back,
            color: getColor("gray_1").front,
            overflow: "hidden"
          }
        },
        [
          m("div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                padding: "0.5rem 1.2rem",
                background: getColor("gray_12").back,
                color: getColor("gray_12").front
              }
            },
            [
              m(Box,
                {
                  isBtn: true,
                  color: running ? "green_1" : "gray_2",
                  style: {
                    margin: "0",
                    flex: "none",
                    padding: "0.4rem 1.2rem",
                    fontSize: "1.2rem"
                  },
                  onclick: () => togglePower()
                },
                running
                  ? trs("QQBot/运行中", { cn: "● 运行中（点击停止）", en: "● Running (click to stop)" })
                  : trs("QQBot/已停止", { cn: "○ 已停止（点击启动）", en: "○ Stopped (click to start)" })
              )
            ]
          ),

          m("div",
            {
              style: {
                display: "flex",
                gap: "0.5rem",
                padding: "0.5rem 1.2rem",
                background: getColor("gray_12").back
              }
            },
            TABS.map(item => m(Box,
              {
                isBtn: true,
                color: tab === item.key ? "main" : "gray_4",
                style: {
                  flex: "1",
                  margin: "0",
                  padding: "0.7rem 1rem",
                  textAlign: "center",
                  fontSize: "1.4rem"
                },
                onclick: () => {
                  tab = item.key;
                  if (tab === "set" && !draft) {
                    draft = JSON.parse(JSON.stringify(config));
                  }
                  if (tab !== "set") {
                    fetchAll();
                  }
                  m.redraw();
                }
              },
              trs(`QQBot/页签/${item.key}`, { cn: item.cn, en: item.en })
            ))
          ),

          m("div",
            {
              style: {
                flex: "1",
                minHeight: "0",
                overflowY: "auto",
                padding: "1.2rem"
              }
            },
            [
              tab === "home" ? m(HomeView,
                {
                  m,
                  Box,
                  Tag,
                  getColor,
                  trs,
                  config,
                  status,
                  onOpenAgent: openAgent
                }
              ) : null,
              tab === "log" ? m(ConsoleView,
                {
                  m,
                  Tag,
                  getColor,
                  trs,
                  logs,
                  filterLevel,
                  autoScroll,
                  onFilter: (key) => {
                    filterLevel = key;
                    m.redraw();
                  },
                  onClear: clearLogs,
                  onToggleScroll: (value) => {
                    autoScroll = value;
                    m.redraw();
                  }
                }
              ) : null,
              tab === "set" ? m(SettingsView,
                {
                  m,
                  Box,
                  Tag,
                  Notice,
                  ChatToolSelect,
                  getColor,
                  trs,
                  draft: draft || config,
                  editKey,
                  subTab,
                  modelList,
                  toolList,
                  pulseMeta,
                  pulseGroups,
                  onSubTab: (key) => {
                    subTab = key;
                    m.redraw();
                  },
                  onChange: () => {
                    dirty = true;
                    m.redraw();
                  },
                  onImport: openConfig,
                  onExport: saveConfigAs,
                  onResetPulse: resetPulse,
                  onResetAll: resetAll
                }
              ) : null
            ]
          ),

          m("div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                padding: "0.5rem 1.2rem",
                background: getColor("gray_12").back,
                color: getColor("gray_12").front,
                fontSize: "1.1rem",
                flex: "none"
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
                  m("span",
                    {
                      style: {
                        opacity: "0.7",
                        fontWeight: "600"
                      }
                    },
                    trs("QQBot/状态栏/标签", { cn: "配置文件", en: "Config File" })
                  ),
                  m("span",
                    {
                      style: {
                        opacity: "0.9"
                      }
                    },
                    cfgFilePath
                      ? cfgFilePath.split("/").pop()
                      : trs("QQBot/状态栏/未保存文件名", { cn: "未绑定外部文件", en: "Unsaved file" })
                  )
                ]
              ),
              m("div",
                {
                  style: {
                    opacity: "0.5",
                    fontSize: "1.0rem",
                    wordBreak: "break-all",
                    lineHeight: "1.4"
                  }
                },
                cfgFilePath
                  ? cfgFilePath
                  : trs("QQBot/状态栏/未保存", { cn: "配置仅存于内存中，可通过文件菜单另存为", en: "(not saved to file yet)" })
              )
            ]
          ),

          tab === "set" ? m("div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "0.8rem 1.2rem",
                background: getColor("gray_12").back
              }
            },
            [
              m("div",
                {
                  style: {
                    flex: "1",
                    fontSize: "1.2rem",
                    opacity: "0.6",
                    minWidth: "0"
                  }
                },
                dirty
                  ? trs("QQBot/未应用提示", { cn: "配置有未应用的改动", en: "Unapplied changes" })
                  : trs("QQBot/已应用提示", { cn: "配置已是最新", en: "All changes applied" })
              ),
              m(Box,
                {
                  isBtn: true,
                  color: "gray_4",
                  style: {
                    margin: "0",
                    flex: "none",
                    padding: "0.6rem 1.6rem"
                  },
                  onclick: () => discardDraft()
                },
                trs("QQBot/撤销", { cn: "撤销", en: "Discard" })
              ),
              m(Box,
                {
                  isBtn: true,
                  color: dirty ? "main" : "gray_4",
                  style: {
                    margin: "0",
                    flex: "none",
                    padding: "0.6rem 1.6rem"
                  },
                  onclick: () => saveDraft()
                },
                trs("QQBot/应用", { cn: "应用", en: "Apply" })
              )
            ]
          ) : null
        ]
      );
    }
  };
};
