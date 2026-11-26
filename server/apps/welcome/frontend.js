/* frontend.js - 欢迎使用 App（Word 启动画廊风格 + 样式设计指南 + App 开发指南） */

import welcomeData from "./welcomeData.js"

const getBaseName = (pathStr) => {
  if (typeof pathStr !== "string" || !pathStr) return ""
  const partsArr = pathStr.split(/[/\\]/)
  return partsArr[partsArr.length - 1] || pathStr
}

const getParentBreadcrumb = (pathStr) => {
  if (typeof pathStr !== "string" || !pathStr) return ""
  const partsArr = pathStr.split(/[/\\]/).filter(Boolean)
  if (partsArr.length <= 1) return pathStr
  return partsArr.slice(0, -1).join(" › ")
}

const formatDateShort = (tsNum) => {
  if (!tsNum) return ""
  const d = new Date(tsNum)
  const now = new Date()
  const isSameDayBool =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (isSameDayBool) {
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    return `${hh}:${mm}`
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default ({
  appId,
  m,
  Notice,
  comData,
  commonData,
  chatData,
  settingData,
  Box,
  Tag,
  iconPark,
  getColor,
  getSize,
  trs,
  launchModelWizard,
  Setting
}) => {
  let recentProjectsArr = []
  let selectedCardStr = "new"
  let busyBool = false

  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (callback) {
        callback({ ok: true, msg: "OK" })
      }
    }
  }

  welcomeData.addTool("commonData", commonData)
  welcomeData.registerInstances(appId, instanceInterface)
  if (commonData && typeof commonData.registerApp === "function") {
    commonData.registerApp(appId, welcomeData)
  }

  const renderIcon = (nameStr, sizeTierNum, colorStr) => {
    if (!iconPark || typeof iconPark.getIcon !== "function") return null
    return m.trust(iconPark.getIcon(nameStr, {
      size: `${getSize(sizeTierNum)}rem`,
      fill: colorStr
    }))
  }

  const refreshAllTmStatus = async () => {
    try {
      const listsArr = comData.data.get()?.chatLists || []
      for (const list of listsArr) {
        await chatData.updateTmStatus(list.id)
      }
      m.redraw()
    } catch (err) {
      console.error("[welcome] 刷新时光机状态失败:", err)
    }
  }

  const loadRecentProjects = async () => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "getRecentProjects", {}])
      if (res && res.ok && Array.isArray(res.data)) {
        recentProjectsArr = res.data
        m.redraw()
      }
    } catch (err) {
      console.error("[welcome] 获取最近项目失败:", err)
    }
  }

  const runNewAndSave = async () => {
    if (busyBool) return
    busyBool = true
    m.redraw()
    try {
      const newRes = await settingData.fnCall("projectNew", [{}])
      if (!newRes || !newRes.ok) {
        if (newRes && newRes.msg !== "User canceled") {
          Notice.launch({ msg: trs("系统/错误/提示") + (newRes.msg || "Unknown error") })
        }
        return
      }
      const saveRes = await settingData.fnCall("projectSave", [{ saveAs: true }])
      if (saveRes && saveRes.ok) {
        await refreshAllTmStatus()
        await loadRecentProjects()
      } else if (saveRes && saveRes.msg !== "User canceled") {
        Notice.launch({ msg: trs("系统/错误/提示") + (saveRes.msg || "Unknown error") })
      }
    } catch (err) {
      console.error("[welcome] 新建并保存项目失败:", err)
      Notice.launch({ msg: trs("系统/错误/提示") + err.message })
    } finally {
      busyBool = false
      m.redraw()
    }
  }

  const openProjectByPath = async (targetPathStr = "") => {
    if (busyBool) return
    busyBool = true
    m.redraw()
    try {
      const payload = targetPathStr ? { path: targetPathStr } : {}
      const res = await settingData.fnCall("projectLoad", [payload])
      if (res && res.ok) {
        await refreshAllTmStatus()
        await loadRecentProjects()
      } else if (res && res.msg === "VERSION_MISMATCH") {
        Notice.launch({
          tip: trs("项目/版本不匹配", { cn: "存档版本不匹配", en: "Version Mismatch" }),
          msg: trs("项目/版本不匹配详情", {
            cn: `存档版本 (${res.savedVersion}) 与当前版本 (${res.currentVersion}) 不一致，是否以兼容模式继续导入？`,
            en: `Archive version (${res.savedVersion}) differs from current (${res.currentVersion}). Continue in compatibility mode?`
          }),
          confirm: async () => {
            try {
              const retryRes = await settingData.fnCall("projectLoad", [{ path: res.path, forceConvert: true }])
              if (retryRes && retryRes.ok) {
                await refreshAllTmStatus()
                await loadRecentProjects()
              } else {
                Notice.launch({ msg: trs("系统/错误/提示") + (retryRes?.msg || "Unknown error") })
              }
            } catch (retryErr) {
              console.error("[welcome] 兼容导入项目失败:", retryErr)
              Notice.launch({ msg: trs("系统/错误/提示") + retryErr.message })
            }
            return undefined
          }
        })
      } else if (res && res.msg !== "User canceled") {
        Notice.launch({ msg: trs("系统/错误/提示") + (res.msg || "Unknown error") })
      }
    } catch (err) {
      console.error("[welcome] 打开项目失败:", err)
      Notice.launch({ msg: trs("系统/错误/提示") + err.message })
    } finally {
      busyBool = false
      m.redraw()
    }
  }

  const openModelWizard = () => {
    if (typeof launchModelWizard === "function") {
      launchModelWizard({
        onSuccess: () => {
          m.redraw()
        }
      })
    } else {
      Notice.launch({
        msg: trs("欢迎页/向导不可用", { cn: "未找到模型向导模块", en: "Model wizard unavailable" })
      })
    }
  }

  const runSelectedCard = async () => {
    if (selectedCardStr === "new") {
      await runNewAndSave()
    } else if (selectedCardStr === "open") {
      await openProjectByPath("")
    } else if (selectedCardStr === "model") {
      openModelWizard()
    }
  }

  return {
    oninit(vnode) {
      const noticeConfig = vnode.attrs.noticeConfig
      if (noticeConfig) {
        noticeConfig.hideBtn = 2
        noticeConfig.useMinus = false
        noticeConfig.headerButtons = []
      }
      loadRecentProjects()
    },

    onremove() {
      welcomeData.unregisterInstances(appId, commonData)
    },

    view() {
      const aiListArr = settingData.options.get("ai_aiList") || []
      const enabledModelCountNum = aiListArr.filter(item => item && item.switch).length
      const currentProjectStr = typeof commonData.currentProject === "string" ? commonData.currentProject : ""

      const galleryCardsArr = [
        {
          key: "new",
          icon: "AddOne",
          title: trs("欢迎页/卡片/新建项目", { cn: "新建项目", en: "New Project" }),
          sub: trs("欢迎页/卡片/新建副标题", { cn: "创建并保存到目录", en: "Create & save" }),
          actionLabel: trs("欢迎页/按钮/新建并保存", { cn: "新建并保存", en: "Create & Save" })
        },
        {
          key: "open",
          icon: "FolderOpen",
          title: trs("欢迎页/卡片/打开项目", { cn: "打开项目", en: "Open Project" }),
          sub: trs("欢迎页/卡片/打开副标题", { cn: "载入已有 .owo", en: "Load .owo file" }),
          actionLabel: trs("欢迎页/按钮/打开项目", { cn: "打开项目", en: "Open Project" })
        },
        {
          key: "model",
          icon: "Brain",
          title: trs("欢迎页/卡片/配置模型", { cn: "配置 AI 模型", en: "Add AI Model" }),
          sub: enabledModelCountNum > 0
            ? trs("欢迎页/卡片/已启用模型", { cn: `已启用 ${enabledModelCountNum} 个`, en: `${enabledModelCountNum} active` })
            : trs("欢迎页/卡片/未配置模型", { cn: "启动添加向导", en: "Launch wizard" }),
          actionLabel: trs("欢迎页/按钮/启动向导", { cn: "启动向导", en: "Launch Wizard" })
        }
      ]

      const activeCardObj = galleryCardsArr.find(item => item.key === selectedCardStr) || galleryCardsArr[0]

      const navItemsArr = [
        {
          key: "start",
          icon: "Planet",
          label: trs("欢迎页/导航/开始", { cn: "开始", en: "Home" }),
          active: true,
          onclick: () => {
            selectedCardStr = "new"
            m.redraw()
          }
        },
        {
          key: "new",
          icon: "AddOne",
          label: trs("欢迎页/导航/新建", { cn: "新建", en: "New" }),
          active: false,
          onclick: () => runNewAndSave()
        },
        {
          key: "open",
          icon: "FolderOpen",
          label: trs("欢迎页/导航/打开", { cn: "打开", en: "Open" }),
          active: false,
          onclick: () => openProjectByPath("")
        },
        {
          key: "model",
          icon: "Brain",
          label: trs("欢迎页/导航/模型", { cn: "模型", en: "Models" }),
          active: false,
          onclick: () => openModelWizard()
        },
        {
          key: "setting",
          icon: "Setting",
          label: trs("欢迎页/导航/设置", { cn: "设置", en: "Settings" }),
          active: false,
          spacerBefore: true,
          onclick: () => {
            Notice.launch({
              sign: "setting_main",
              tip: trs("输入栏/提示/设置中心", { cn: "设置中心", en: "Settings" }),
              content: Setting
            })
          }
        }
      ]

      return m("",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            background: getColor("gray_1").back,
            color: getColor("gray_1").front
          }
        },
        [
          /* 左侧窄导航栏（对齐 Word 左侧图标导航） */
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: `${getSize(2)}rem`,
                padding: `${getSize(4)}rem ${getSize(2)}rem`,
                background: getColor("gray_4").back,
                color: getColor("gray_4").front,
                borderRight: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                flex: "none"
              }
            },
            navItemsArr.map(item => m(Box,
              {
                key: item.key,
                isBtn: true,
                color: item.active ? "main" : "gray_4",
                style: {
                  margin: "0",
                  marginTop: item.spacerBefore ? "auto" : "0",
                  padding: `${getSize(2)}rem ${getSize(3)}rem`,
                  borderRadius: `${getSize(8)}rem`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: `${getSize(1)}rem`,
                  background: item.active ? getColor("main").back : "transparent",
                  color: item.active ? getColor("main").front : getColor("gray_4").front,
                  opacity: item.active ? 1 : 0.75
                },
                onclick: item.onclick
              },
              [
                renderIcon(item.icon, 4, item.active ? getColor("main").front : getColor("gray_4").front),
                m("",
                  {
                    style: {
                      fontSize: `${getSize(3)}rem`,
                      lineHeight: `${getSize(4)}rem`,
                      whiteSpace: "nowrap"
                    }
                  },
                  item.label
                )
              ]
            ))
          ),

          /* 右侧主画布：上画廊 + 中分割线 + 下最近项目表 + 底栏 */
          m("",
            {
              style: {
                flex: "1",
                minWidth: `${getSize(85)}rem`,
                display: "flex",
                flexDirection: "column"
              }
            },
            [
              /* 主内容滚动区 */
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: `${getSize(4)}rem`,
                    padding: `${getSize(4)}rem ${getSize(6)}rem`
                  }
                },
                [
                  /* 上半区：标题与提醒 + 画廊预览卡片 */
                  m("",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: `${getSize(3)}rem`
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: `${getSize(3)}rem`,
                            flexWrap: "wrap"
                          }
                        },
                        [
                          m("",
                            {
                              style: {
                                fontSize: `${getSize(5)}rem`,
                                lineHeight: `${getSize(6)}rem`,
                                opacity: 0.85
                              }
                            },
                            trs("欢迎页/快速开始", { cn: "开始使用", en: "Get Started" })
                          ),
                          m("",
                            {
                              style: {
                                fontSize: `${getSize(3)}rem`,
                                lineHeight: `${getSize(4)}rem`,
                                opacity: 0.55
                              }
                            },
                            currentProjectStr
                              ? trs("欢迎页/当前项目", {
                                  cn: `当前存档：${getBaseName(currentProjectStr)}`,
                                  en: `Current: ${getBaseName(currentProjectStr)}`
                                })
                              : trs("欢迎页/Word提醒", {
                                  cn: "类似 Word，需保存为 .owo 存档才会持久化数据",
                                  en: "Like Word, save as a .owo file to persist data"
                                })
                          )
                        ]
                      ),

                      /* 横排纸张比例画廊卡片 */
                      m("",
                        {
                          style: {
                            display: "flex",
                            alignItems: "flex-start",
                            gap: `${getSize(4)}rem`,
                            flexWrap: "wrap"
                          }
                        },
                        galleryCardsArr.map(card => {
                          const isSelectedBool = selectedCardStr === card.key
                          return m("",
                            {
                              key: card.key,
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: `${getSize(2)}rem`,
                                cursor: "pointer"
                              },
                              onclick: () => {
                                selectedCardStr = card.key
                                m.redraw()
                              },
                              ondblclick: () => {
                                selectedCardStr = card.key
                                runSelectedCard()
                              }
                            },
                            [
                              /* 纸张质感预览框 */
                              m(Box,
                                {
                                  color: "gray_4",
                                  style: {
                                    margin: "0",
                                    padding: `${getSize(6)}rem ${getSize(5)}rem`,
                                    borderRadius: `${getSize(8)}rem`,
                                    border: isSelectedBool
                                      ? `${getSize(0.5)}rem solid ${getColor("main").back}`
                                      : `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: `${getSize(2)}rem`,
                                    minWidth: `${getSize(28)}rem`,
                                    boxShadow: isSelectedBool
                                      ? `0 ${getSize(1)}rem ${getSize(4)}rem rgba(0, 0, 0, 0.15)`
                                      : `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.08)`,
                                    transition: "border-color 0.2s ease, box-shadow 0.2s ease"
                                  }
                                },
                                [
                                  renderIcon(
                                    card.icon,
                                    8,
                                    isSelectedBool ? getColor("main").back : getColor("gray_4").front
                                  ),
                                  m("",
                                    {
                                      style: {
                                        fontSize: `${getSize(3)}rem`,
                                        lineHeight: `${getSize(4)}rem`,
                                        opacity: 0.6,
                                        textAlign: "center",
                                        whiteSpace: "nowrap"
                                      }
                                    },
                                    card.sub
                                  )
                                ]
                              ),

                              /* 下方标签：选中态为 main 高亮胶囊（对齐 Word 空白文档下方蓝色胶囊） */
                              isSelectedBool
                                ? m(Tag,
                                    {
                                      color: "main",
                                      styleExt: {
                                        margin: "0"
                                      }
                                    },
                                    card.title
                                  )
                                : m("",
                                    {
                                      style: {
                                        fontSize: `${getSize(3)}rem`,
                                        lineHeight: `${getSize(4)}rem`,
                                        padding: `${getSize(0.5)}rem ${getSize(2)}rem`,
                                        opacity: 0.85
                                      }
                                    },
                                    card.title
                                  )
                            ]
                          )
                        })
                      )
                    ]
                  ),

                  /* 分割线 */
                  m("",
                    {
                      style: {
                        height: `${getSize(0.25)}rem`,
                        background: "rgba(0, 0, 0, 0.15)"
                      }
                    }
                  ),

                  /* 下半区：「最近」项目双栏列表 */
                  m("",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: `${getSize(2)}rem`
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            gap: `${getSize(2)}rem`
                          }
                        },
                        [
                          m(Tag,
                            {
                              color: "main",
                              styleExt: {
                                margin: "0"
                              }
                            },
                            trs("欢迎页/最近标签", { cn: "最近", en: "Recent" })
                          )
                        ]
                      ),

                      /* 表头 */
                      m("",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: `${getSize(3)}rem`,
                            padding: `${getSize(1)}rem ${getSize(2)}rem`,
                            borderBottom: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                            fontSize: `${getSize(3)}rem`,
                            lineHeight: `${getSize(4)}rem`,
                            opacity: 0.55
                          }
                        },
                        [
                          m("", trs("欢迎页/表头/名称", { cn: "名称", en: "Name" })),
                          m("", trs("欢迎页/表头/上次打开时间", { cn: "上次打开时间", en: "Date Opened" }))
                        ]
                      ),

                      /* 列表主体（斑马纹交替行，无套娃灰框） */
                      recentProjectsArr.length === 0
                        ? m("",
                            {
                              style: {
                                padding: `${getSize(6)}rem ${getSize(2)}rem`,
                                textAlign: "center",
                                fontSize: `${getSize(3)}rem`,
                                lineHeight: `${getSize(4)}rem`,
                                opacity: 0.5
                              }
                            },
                            trs("欢迎页/暂无最近项目", {
                              cn: "暂无最近打开的项目，点击上方「新建项目」保存一个 .owo 存档即可开始",
                              en: "No recent projects yet. Create and save a .owo archive above to get started."
                            })
                          )
                        : m("",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: `${getSize(0)}rem`
                              }
                            },
                            recentProjectsArr.slice(0, 6).map((item, idx) => m("",
                              {
                                key: item.path,
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: `${getSize(4)}rem`,
                                  padding: `${getSize(2)}rem ${getSize(2)}rem`,
                                  borderRadius: `${getSize(8)}rem`,
                                  background: idx % 2 === 1 ? "rgba(0, 0, 0, 0.04)" : "transparent",
                                  cursor: "pointer"
                                },
                                onclick: () => openProjectByPath(item.path)
                              },
                              [
                                m("",
                                  {
                                    style: {
                                      display: "flex",
                                      alignItems: "center",
                                      gap: `${getSize(2)}rem`,
                                      minWidth: "0",
                                      flex: "1"
                                    }
                                  },
                                  [
                                    renderIcon("FileText", 5, getColor("main").back),
                                    m("",
                                      {
                                        style: {
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: `${getSize(1 / 2)}rem`,
                                          minWidth: "0",
                                          flex: "1"
                                        }
                                      },
                                      [
                                        m("",
                                          {
                                            style: {
                                              fontSize: `${getSize(4)}rem`,
                                              lineHeight: `${getSize(5)}rem`,
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap"
                                            }
                                          },
                                          item.name || getBaseName(item.path)
                                        ),
                                        m("",
                                          {
                                            style: {
                                              fontSize: `${getSize(3)}rem`,
                                              lineHeight: `${getSize(4)}rem`,
                                              opacity: 0.5,
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap"
                                            }
                                          },
                                          getParentBreadcrumb(item.path)
                                        )
                                      ]
                                    )
                                  ]
                                ),
                                m("",
                                  {
                                    style: {
                                      fontSize: `${getSize(3)}rem`,
                                      lineHeight: `${getSize(4)}rem`,
                                      opacity: 0.6,
                                      whiteSpace: "nowrap",
                                      flex: "none"
                                    }
                                  },
                                  formatDateShort(item.updatedAt)
                                )
                              ]
                            ))
                          )
                    ]
                  )
                ]
              ),

              /* 底部操作栏（对齐 Word 右下角「取消 / 创建」） */
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: `${getSize(2)}rem`,
                    padding: `${getSize(2)}rem ${getSize(6)}rem`,
                    borderTop: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`
                  }
                },
                [
                  m(Box,
                    {
                      isBtn: true,
                      color: "gray_4",
                      style: {
                        margin: "0",
                        padding: `${getSize(1.5)}rem ${getSize(4)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`
                      },
                      onclick: async () => {
                        try {
                          await settingData.fnCall("appClose", [appId])
                        } catch (err) {
                          console.error("[welcome] 关闭欢迎页失败:", err)
                        }
                      }
                    },
                    trs("欢迎页/按钮/取消", { cn: "暂不设置", en: "Cancel" })
                  ),
                  m(Box,
                    {
                      isBtn: true,
                      color: "main",
                      style: {
                        margin: "0",
                        padding: `${getSize(1.5)}rem ${getSize(4)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        opacity: busyBool ? 0.6 : 1
                      },
                      onclick: () => runSelectedCard()
                    },
                    activeCardObj.actionLabel
                  )
                ]
              )
            ]
          )
        ]
      )
    }
  }
}
