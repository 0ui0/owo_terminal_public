// quickOpen 前端：VSCode 风格快速打开
// 搜索框 + 一键清除X按钮 + 全文搜索Switch + 搜索配置 + 工作目录标签（主目录默认选中）+ 模块化结果列表 + 键盘导航
// 严格对齐 App 开发指南与 Singleton Data Manager 规范

import quickOpenData from "./quickOpenData.js"
import SearchConfigModal from "./frontendModules/SearchConfigModal.js"
import FullTextResultListFactory from "./frontendModules/FullTextResultList.js"
import FileNameResultListFactory from "./frontendModules/FileNameResultList.js"

export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, getColor, trs, Box, Tag, iconPark, data = {} }) => {
  // 权威应用状态对象（单一事实来源）
  const appData = {
    searchConfig: {
      useRegex: false,
      caseSensitive: false,
      wholeWord: false,
      excludePatterns: "node_modules, .git, dist, build",
      ...(data?.searchConfig || {})
    },
    isFullText: Boolean(data?.isFullText)
  }

  // 组件与表单实例
  const FormInput = new Box()
  const FullTextSwitch = new Box()
  const FullTextResultList = FullTextResultListFactory({ m, Box, getColor, trs })
  const FileNameResultList = FileNameResultListFactory({ m, Box, getColor, trs })

  FullTextSwitch.data.value = appData.isFullText

  let keyword = ""
  let dirs = []
  let results = {}
  let activeDir = null
  let selectedIndex = 0
  let searchTimer = null
  let inputDom = null

  // 实例接口（暴露给 quickOpenData Singleton）
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (callback) callback({ ok: true, msg: "操作成功" })
    }
  }

  // 初始化注册生命周期
  const init = () => {
    quickOpenData.addTool("commonData", commonData)
    quickOpenData.registerInstances(appId, instanceInterface)
    if (commonData?.registerApp) commonData.registerApp(appId, quickOpenData)
  }
  init()

  // 持久化同步状态到后端
  const syncPersistentData = async (showToast = false) => {
    try {
      appData.isFullText = FullTextSwitch.data.value
      const res = await settingData.fnCall("appUpdateData", [appId, {
        searchConfig: appData.searchConfig,
        isFullText: appData.isFullText
      }])
      if (showToast && res && res.msg) {
        Notice.launch({ msg: res.msg })
      }
    } catch (err) {
      console.error("同步持久化数据失败:", err)
      if (showToast) {
        Notice.launch({ msg: err.message || "更新配置失败" })
      }
    }
  }

  // 读取当前会话（targetChatListId）的工作目录数组
  const loadDirs = () => {
    const com = comData.data?.get()
    const targetId = com?.targetChatListId ?? 0
    const list = com?.chatLists?.find(l => l.id === targetId) || com?.chatLists?.[0]
    const newDirs = (list?.workDirs || []).map(item => ({ ...item }))

    if (newDirs.map(d => d.path).join("|") !== dirs.map(d => d.path).join("|")) {
      dirs = newDirs
      activeDir = dirs[0]?.path || null
      results = {}
    }
  }

  // 并行搜索所有工作目录（复用全局 projectSearch crossFunc）
  const doSearch = async () => {
    const q = keyword.trim()
    if (!q) {
      results = {}
      selectedIndex = 0
      m.redraw()
      return
    }
    const isFullText = FullTextSwitch.data.value
    const targets = dirs.filter(d => d.path)
    const resArr = await Promise.all(targets.map(d =>
      settingData.fnCall("projectSearch", [q, d.path, appData.searchConfig]).catch(() => ({ ok: false }))
    ))
    results = {}
    resArr.forEach((res, i) => {
      const allMatches = res && res.ok ? (res.data || []) : []
      results[targets[i].path] = isFullText ? allMatches : allMatches.filter(f => f.isFileNameMatch)
    })
    selectedIndex = 0
    m.redraw()
  }

  const onSearchInput = (v) => {
    keyword = v
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(doSearch, 200)
    m.redraw()
  }

  // 打开搜索配置弹窗（点击 Check 确认后接收 res.msg 并输出 Notice 提示）
  const openSearchConfig = () => {
    SearchConfigModal({
      m,
      Notice,
      Box,
      getColor,
      trs,
      appId,
      searchConfig: appData.searchConfig,
      onConfigApplied: async () => {
        await syncPersistentData(true)
        doSearch()
      }
    })
  }

  // 打开文件（按扩展名分发到对应 App，若是代码行匹配则附带 line 行号），并关闭自身
  const openFile = (item) => {
    if (item.isDirectory) {
      settingData.fnCall("appLaunch", ["explorer", { data: { currentPath: item.path } }])
    } else {
      const ext = (item.path.split('.').pop() || "").toLowerCase()
      if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico"].includes(ext)) {
        settingData.fnCall("appLaunch", ["imageViewer", { data: { currentImagePath: item.path } }])
      } else if (ext === ".html" || ext === ".htm") {
        settingData.fnCall("appLaunch", ["browser", { data: { url: "file://" + item.path } }])
      } else {
        settingData.fnCall("appLaunch", ["editor", {
          data: {
            filePath: item.path,
            ...(item.isSearchResult && !item.isFileNameMatch && item.line ? { line: item.line } : {})
          }
        }])
      }
    }
    settingData.fnCall("appClose", [appId])
  }

  // 键盘导航：上下选择、回车打开、Esc 关闭
  const onKeydown = (e) => {
    const list = results[activeDir] || []
    if (e.key === "ArrowDown") {
      e.preventDefault()
      selectedIndex = Math.min(selectedIndex + 1, Math.max(list.length - 1, 0))
      m.redraw()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      selectedIndex = Math.max(selectedIndex - 1, 0)
      m.redraw()
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (list[selectedIndex]) openFile(list[selectedIndex])
    } else if (e.key === "Escape") {
      settingData.fnCall("appClose", [appId])
    }
  }

  return {
    oninit(vnode) {
      // 💡 严格遵循开发指南 5.2 节：从 vnode.attrs.data 恢复后端持久化数据
      const vData = vnode.attrs?.data
      if (vData?.searchConfig) {
        appData.searchConfig = {
          ...appData.searchConfig,
          ...vData.searchConfig
        }
      }
      if (vData?.isFullText !== undefined) {
        appData.isFullText = Boolean(vData.isFullText)
        FullTextSwitch.data.value = appData.isFullText
      }
    },
    onremove() {
      quickOpenData.unregisterInstances(appId, commonData)
    },
    view() {
      loadDirs()
      const list = results[activeDir] || []

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
            margin: "1rem"
          }
        },
        [
          // 顶部搜索控制栏：并排等高双胶囊 (左侧 Box 搜索框 + 右侧 Box 全文组合)
          m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "0.6rem"
              }
            },
            [
              // 1. 左侧：搜索 Box 胶囊 + 内置 CloseSmall 清除按钮
              m("",
                {
                  style: {
                    flex: 1,
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    minWidth: 0
                  }
                },
                [
                  m(FormInput,
                    {
                      tagName: "input[type=text]",
                      color: "gray_2",
                      style: {
                        width: "100%",
                        height: "3.2rem",
                        lineHeight: "3.2rem",
                        margin: 0,
                        padding: "0 2.4rem 0 1.2rem",
                        borderRadius: "3rem",
                        boxSizing: "border-box",
                        fontSize: "1.3rem",
                        minWidth: 0
                      },
                      ext: {
                        placeholder: dirs.length === 0
                          ? trs("快速打开/未指定目录占位", { cn: "未指定工作目录...", en: "No working directory..." })
                          : (FullTextSwitch.data.value
                              ? trs("快速打开/搜索/全文占位", { cn: "全文内容搜索...", en: "Search file contents..." })
                              : trs("快速打开/搜索/文件名占位", { cn: "快速搜索文件名...", en: "Search file names..." })),
                        onkeydown: (e) => onKeydown(e)
                      },
                      oninput: (dom, e) => {
                        onSearchInput(e.target.value)
                      },
                      oncreate: (v) => {
                        inputDom = v.dom
                        if (inputDom) inputDom.focus()
                      }
                    }
                  ),

                  // 内置一键清除 X 按钮 (仅在有输入内容时浮现)
                  keyword
                    ? m("div",
                      {
                        style: {
                          position: "absolute",
                          right: "0.8rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          opacity: 0.6
                        },
                        title: trs("快速打开/清除", { cn: "清除", en: "Clear" }),
                        onclick: () => {
                          FormInput.data.value = ""
                          keyword = ""
                          if (inputDom) inputDom.focus()
                          doSearch()
                        }
                      },
                      m.trust(iconPark.getIcon("CloseSmall", {
                        size: "1.4rem",
                        fill: getColor('gray_5').front
                      }))
                    )
                    : null
                ]
              ),

              // 2. 右侧：全文开关 Box 胶囊 (与左侧高度严格 3.2rem 等高并排)
              m(Box,
                {
                  color: "gray_2",
                  style: {
                    height: "3.2rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0 1rem",
                    margin: 0,
                    borderRadius: "3rem",
                    boxSizing: "border-box",
                    flexShrink: 0
                  }
                },
                [
                  // 说明文字在左边，天然继承 Box 成套 front 颜色
                  m("span",
                    {
                      style: {
                        fontSize: "1.2rem",
                        cursor: "pointer",
                        userSelect: "none"
                      },
                      onclick: () => {
                        FullTextSwitch.data.value = !FullTextSwitch.data.value
                        syncPersistentData(false)
                        doSearch()
                      }
                    },
                    trs("快速打开/全文开关标签", {
                      cn: "全文",
                      en: "FullText"
                    })
                  ),

                  // Box 开关在右边 (显式消除自带 margin)
                  m(FullTextSwitch,
                    {
                      isSwitch: true,
                      color: "main",
                      style: {
                        margin: 0
                      },
                      onclick: () => {
                        syncPersistentData(false)
                        doSearch()
                      }
                    }
                  ),

                  // 开启全文时的配置齿轮
                  FullTextSwitch.data.value
                    ? m("div",
                      {
                        style: {
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          marginLeft: "0.2rem"
                        },
                        title: trs("快速打开/配置", { cn: "搜索参数配置", en: "Search Config" }),
                        onclick: () => openSearchConfig()
                      },
                      m.trust(iconPark.getIcon("Setting", {
                        size: "1.6rem",
                        fill: getColor('blue_1').front
                      }))
                    )
                    : null
                ]
              )
            ]
          ),

          // 未指定工作目录提示（纯净文字，无字符Emoji）
          dirs.length === 0 ? m("",
            {
              style: {
                textAlign: "center",
                color: getColor('gray_4').front,
                padding: "2rem 1rem",
                fontSize: "1.3rem",
                lineHeight: "2rem"
              }
            },
            trs("快速打开/未配置工作目录", {
              cn: "当前会话尚未指定工作目录，请先在聊天窗口添加工作目录喵！",
              en: "No working directory configured for current session!"
            })
          ) : null,

          // 工作目录标签（主目录默认选中，点击联动切换当前检索目录）
          dirs.length > 0 ? m("",
            {
              style: {
                display: "flex",
                flexWrap: "wrap",
                gap: "0.4rem"
              }
            },
            dirs.map(d => m(Tag,
              {
                styleExt: {
                  background: d.path === activeDir ? getColor('main').back : getColor('gray_3').back,
                  color: d.path === activeDir ? getColor('main').front : getColor('gray_4').front,
                  cursor: "pointer"
                },
                ext: {
                  onclick: () => {
                    activeDir = d.path
                    selectedIndex = 0
                    m.redraw()
                  }
                }
              },
              (d.path.split(/[/\\]/).pop() || d.path) + (d.type === "main" ? " ★" : "")
            ))
          ) : null,

          // 结果列表：根据全文搜索开关状态分别委托给专用的独立组件渲染
          FullTextSwitch.data.value
            ? m(FullTextResultList, {
                list,
                selectedIndex,
                keyword,
                onOpenFile: (f) => openFile(f)
              })
            : m(FileNameResultList, {
                list,
                selectedIndex,
                keyword,
                onOpenFile: (f) => openFile(f)
              })
        ]
      )
    }
  }
}
