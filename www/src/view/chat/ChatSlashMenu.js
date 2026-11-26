import chatData from "./chatData.js"
import settingData from "../setting/settingData.js"
import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import Notice from "../common/notice.js"
import Setting from "../setting/setting.js"
import ChatModelSelector from "./ChatModelSelector.js"
import ChatSendParams from "./ChatSendParams.js"

/**
 * ChatSlashMenu - 聊天输入框斜杠 / 快捷命令菜单组件
 * 支持从编辑器输入 `/` 触发（带键盘导航与词过滤），也支持从工具栏 `+` 按钮直接弹出
 */
export default () => {
  let currentAttrs = {}
  let listContainerDom = null
  let lastScrolledVersion = -1
  let catalogLoading = false
  let plansList = []
  let skillsList = []

  const localState = {
    query: "",
    submenuId: "",
    selectedIndex: 0,
    parentSelectedIndex: 0,
    scrollVersion: 0
  }

  const getMenuState = () => {
    return currentAttrs.slashState || localState
  }

  const loadDynamicCatalogs = async () => {
    if (catalogLoading) return
    catalogLoading = true
    try {
      const [plansRes, userSkillsRes, sysSkillsRes] = await Promise.all([
        settingData.fnCall("getPlansList", []).catch((err) => {
          console.error("[ChatSlashMenu] 拉取 plans 列表失败:", err)
          return {
            ok: false,
            data: []
          }
        }),
        settingData.fnCall("getUserSkillsList", []).catch((err) => {
          console.error("[ChatSlashMenu] 拉取用户 skills 列表失败:", err)
          return {
            ok: false,
            data: []
          }
        }),
        settingData.fnCall("getSystemSkillsList", []).catch((err) => {
          console.error("[ChatSlashMenu] 拉取系统 skills 列表失败:", err)
          return {
            ok: false,
            data: []
          }
        })
      ])

      if (plansRes && plansRes.ok && Array.isArray(plansRes.data)) {
        plansList = plansRes.data
      }

      const mergedSkills = []
      const seenIds = new Set()

      if (userSkillsRes && userSkillsRes.ok && Array.isArray(userSkillsRes.data)) {
        userSkillsRes.data.forEach((s) => {
          if (!seenIds.has(s.id)) {
            seenIds.add(s.id)
            mergedSkills.push(s)
          }
        })
      }

      if (sysSkillsRes && sysSkillsRes.ok && Array.isArray(sysSkillsRes.data)) {
        sysSkillsRes.data.forEach((s) => {
          if (!seenIds.has(s.id)) {
            seenIds.add(s.id)
            mergedSkills.push(s)
          }
        })
      }

      skillsList = mergedSkills
      m.redraw()
    } catch (err) {
      console.error("[ChatSlashMenu] 拉取 plans/skills 目录失败:", err)
    } finally {
      catalogLoading = false
    }
  }

  const scrollActiveItemIntoView = () => {
    if (!listContainerDom) return
    const state = getMenuState()
    if (state.selectedIndex <= 0) {
      listContainerDom.scrollTop = 0
      return
    }
    const activeDom = listContainerDom.children[state.selectedIndex]
    if (!activeDom) return
    const padPx = parseFloat(window.getComputedStyle(listContainerDom).paddingTop) || 0
    const itemTop = activeDom.offsetTop - padPx
    const itemBottom = activeDom.offsetTop + activeDom.offsetHeight + padPx
    if (itemTop < listContainerDom.scrollTop) {
      listContainerDom.scrollTop = Math.max(0, itemTop)
    } else if (itemBottom > listContainerDom.scrollTop + listContainerDom.clientHeight) {
      listContainerDom.scrollTop = itemBottom - listContainerDom.clientHeight
    }
  }

  const goBackSubmenu = () => {
    const state = getMenuState()
    if (!state.submenuId) return false
    state.submenuId = ""
    state.selectedIndex = state.parentSelectedIndex
    state.scrollVersion++
    m.redraw()
    return true
  }

  const updateSession = async (targetListId, updatesObj) => {
    try {
      if (typeof currentAttrs.onUpdateSession === "function") {
        await currentAttrs.onUpdateSession(targetListId, updatesObj)
        return
      }
      chatData.initSessionState(targetListId, updatesObj)
      await settingData.fnCall("updateListConfig", [targetListId, updatesObj])
      m.redraw()
    } catch (err) {
      console.error("[ChatSlashMenu] 更新会话配置失败:", err)
      Notice.launch({
        msg: trs("输入框/提示/配置更新失败", {
          cn: "会话配置更新失败",
          en: "Failed to update session config"
        })
      })
    }
  }

  const finishInsert = (insertStr) => {
    if (typeof currentAttrs.onInsertText === "function") {
      currentAttrs.onInsertText(insertStr)
    } else if (typeof currentAttrs.onClose === "function") {
      currentAttrs.onClose()
    }
  }

  const finishAction = (shouldFocus) => {
    if (typeof currentAttrs.onFinishAction === "function") {
      currentAttrs.onFinishAction(shouldFocus)
    } else if (typeof currentAttrs.onClose === "function") {
      currentAttrs.onClose()
    }
  }

  const notifyToast = (msgStr) => {
    if (typeof currentAttrs.onToast === "function") {
      currentAttrs.onToast(msgStr)
    }
  }

  const buildItems = () => {
    const listId = currentAttrs.listId || 0
    const state = getMenuState()
    const session = chatData.getSessionState(listId)
    const currentStage = session.workStage || "无附加"
    const currentMode = session.toolAccessMode || "readWrite"
    const queryLower = (state.query || "").trim().toLowerCase()

    const attachChildren = [
      {
        id: "attach_upload",
        label: trs("输入框/斜杠/上传新附件", {
          cn: "上传新附件",
          en: "Upload New Attachment"
        }),
        desc: trs("输入框/斜杠/上传新附件说明", {
          cn: "选择本地文件上传并插入标签",
          en: "Choose local files to upload"
        }),
        keywords: "attach upload file 附件 上传 文件",
        action: () => {
          finishAction(false)
          if (typeof currentAttrs.onUploadAttach === "function") {
            currentAttrs.onUploadAttach()
          }
        }
      },
      ...session.attachments.map((att) => ({
        id: `attach_${att.id}`,
        label: att.id,
        desc: trs("输入框/斜杠/插入已有附件", {
          cn: "插入已上传附件标签",
          en: "Insert uploaded attachment tag"
        }),
        keywords: `attach 附件 ${att.id}`,
        action: () => {
          finishInsert(`[attachid:${att.id}] `)
        }
      }))
    ]

    const planChildren = plansList.length > 0
      ? plansList.map((planObj) => ({
          id: `plan_${planObj.path}`,
          label: planObj.name,
          desc: planObj.path,
          keywords: `plan 计划书 ${planObj.name}`,
          action: () => {
            finishInsert(`[filePath:${planObj.path}] `)
          }
        }))
      : [
          {
            id: "plan_placeholder",
            label: trs("输入框/斜杠/计划书占位", {
              cn: "owo_data/plans（暂无计划书）",
              en: "owo_data/plans (No plans)"
            }),
            desc: trs("输入框/斜杠/计划书占位说明", {
              cn: "存在计划书文件时，点选即可插入 [filePath:...] 标签",
              en: "Inserts [filePath:...] when plan files exist"
            }),
            disabled: true,
            keywords: "plan plans 计划书",
            action: () => {}
          }
        ]

    const skillChildren = skillsList.length > 0
      ? skillsList.map((skillObj) => ({
          id: `skill_${skillObj.name}`,
          label: skillObj.name,
          desc: skillObj.desc || skillObj.path || "",
          keywords: `skill 技能 ${skillObj.name}`,
          action: () => {
            finishInsert(skillObj.path ? `[filePath:${skillObj.path}] ` : `[skill:${skillObj.name}] `)
          }
        }))
      : [
          {
            id: "skill_placeholder",
            label: trs("输入框/斜杠/技能占位", {
              cn: "owo_data/skills（暂无可用技能）",
              en: "owo_data/skills (No skills)"
            }),
            desc: trs("输入框/斜杠/技能占位说明", {
              cn: "配置技能后，可点选插入预置技能标签",
              en: "Available once skills are configured"
            }),
            disabled: true,
            keywords: "skill skills 技能",
            action: () => {}
          }
        ]

    const stageChildren = chatData.getStageOptions().map((opt) => ({
      id: `stage_${opt.value}`,
      label: opt.label,
      desc: opt.text || trs("输入框/斜杠/无附加说明", {
        cn: "清除当前阶段附加指令",
        en: "Clear stage instruction"
      }),
      active: currentStage === opt.value,
      keywords: `mode stage 模式 阶段 ${opt.value} ${opt.label}`,
      action: async () => {
        try {
          finishAction(true)
          const updateData = {
            workStage: opt.value
          }
          if (opt.value === "调查并讨论") {
            updateData.toolAccessMode = "readOnly"
          } else if (opt.value !== "无附加") {
            updateData.toolAccessMode = "readWrite"
          }
          await updateSession(listId, updateData)
          notifyToast(trs("输入框/斜杠/已切换模式", {
            cn: `已切换模式：${opt.label}`,
            en: `Switched stage: ${opt.label}`
          }))
        } catch (err) {
          console.error("[ChatSlashMenu] 切换模式失败:", err)
        }
      }
    }))

    const permChildren = chatData.getModeOptions().map((opt) => ({
      id: `perm_${opt.value}`,
      label: opt.label,
      desc: opt.desc,
      active: currentMode === opt.value,
      keywords: `perm permission 权限 ${opt.value} ${opt.label}`,
      action: async () => {
        try {
          finishAction(true)
          await updateSession(listId, {
            toolAccessMode: opt.value
          })
          notifyToast(trs("输入框/斜杠/已切换权限", {
            cn: `已切换权限：${opt.label}`,
            en: `Switched permission: ${opt.label}`
          }))
        } catch (err) {
          console.error("[ChatSlashMenu] 切换权限失败:", err)
        }
      }
    }))

    const rootItems = [
      {
        id: "attach",
        label: trs("输入框/斜杠/附件", {
          cn: "附件",
          en: "Attachments"
        }),
        desc: trs("输入框/斜杠/附件说明", {
          cn: "上传或插入当前会话附件",
          en: "Upload or insert session attachments"
        }),
        icon: "Paperclip",
        submenuId: "attach",
        keywords: "attach file 附件",
        children: attachChildren
      },
      {
        id: "plans",
        label: trs("输入框/斜杠/计划书", {
          cn: "计划书 (plans)",
          en: "Plans"
        }),
        desc: trs("输入框/斜杠/计划书说明", {
          cn: "插入 owo_data/plans 计划书文件标签",
          en: "Insert plan file tag from owo_data/plans"
        }),
        icon: "FileText",
        submenuId: "plans",
        keywords: "plan plans 计划书",
        children: planChildren
      },
      {
        id: "skills",
        label: trs("输入框/斜杠/技能", {
          cn: "技能 (skills)",
          en: "Skills"
        }),
        desc: trs("输入框/斜杠/技能说明", {
          cn: "插入 owo_data/skills 预置技能",
          en: "Insert preset skill from owo_data/skills"
        }),
        icon: "MagicWand",
        submenuId: "skills",
        keywords: "skill skills 技能",
        children: skillChildren
      },
      {
        id: "stage",
        label: trs("输入框/斜杠/模式", {
          cn: "模式",
          en: "Work Stage"
        }),
        desc: trs("输入框/斜杠/模式说明", {
          cn: `当前：${currentStage}`,
          en: `Current: ${currentStage}`
        }),
        icon: "Brain",
        submenuId: "stage",
        keywords: "stage mode 模式 调查 规划 执行",
        children: stageChildren
      },
      {
        id: "perm",
        label: trs("输入框/斜杠/权限", {
          cn: "权限",
          en: "Tool Access"
        }),
        desc: trs("输入框/斜杠/权限说明", {
          cn: `当前：${(chatData.getModeOptions().find((o) => o.value === currentMode)?.label) || currentMode}`,
          en: `Current: ${currentMode}`
        }),
        icon: "Lock",
        submenuId: "perm",
        keywords: "perm permission 权限 读写 只读 仅聊天",
        children: permChildren
      },
      {
        id: "compress",
        label: trs("输入框/斜杠/压缩上下文", {
          cn: "压缩上下文",
          en: "Compress Context"
        }),
        desc: trs("输入框/斜杠/压缩上下文说明", {
          cn: "插入要求 AI 压缩上下文的标签",
          en: "Insert context compression tag"
        }),
        icon: "Inbox",
        keywords: "compress context 压缩 上下文",
        action: () => {
          finishInsert("[compress:请压缩当前对话的上下文并提炼关键进展] ")
        }
      },
      {
        id: "model",
        label: trs("输入框/斜杠/切换模型", {
          cn: "切换模型",
          en: "Switch Model"
        }),
        desc: trs("输入框/斜杠/切换模型说明", {
          cn: "弹出模型选择与切换窗口",
          en: "Open model selector dialog"
        }),
        icon: "RobotOne",
        keywords: "model ai 模型 切换",
        action: () => {
          finishAction(false)
          Notice.launch({
            sign: `switch_model_dialog_${listId}`,
            tip: trs("输入栏/提示/选择与管理模型", {
              cn: "选择与切换模型",
              en: "Select & Switch Model"
            }),
            content: ChatModelSelector,
            contentAttrs: {
              targetChatListId: listId,
              targetSession: chatData.getSessionState(listId),
              updateListSession: updateSession
            }
          })
        }
      },
      {
        id: "terminal",
        label: trs("输入框/斜杠/打开终端", {
          cn: "打开终端",
          en: "Open Terminal"
        }),
        desc: trs("输入框/斜杠/打开终端说明", {
          cn: "启动终端应用窗口",
          en: "Launch terminal window"
        }),
        icon: "Terminal",
        keywords: "terminal shell cli 终端 命令行",
        action: async () => {
          try {
            finishAction(false)
            await settingData.fnCall("appLaunch", ["terminal"])
          } catch (err) {
            console.error("[ChatSlashMenu] 打开终端失败:", err)
          }
        }
      },
      {
        id: "chat_params",
        label: trs("输入框/斜杠/配置对话", {
          cn: "配置对话",
          en: "Chat Settings"
        }),
        desc: trs("输入框/斜杠/配置对话说明", {
          cn: "配置思考控制与更多对话参数",
          en: "Configure thinking control and chat parameters"
        }),
        icon: "More",
        keywords: "more params think config 配置 对话 参数 更多",
        action: () => {
          finishAction(false)
          Notice.launch({
            sign: `chat_send_params_modal_${listId}`,
            tip: trs("输入栏/提示/更多参数配置", {
              cn: "更多参数配置",
              en: "More Parameters"
            }),
            content: ChatSendParams,
            contentAttrs: {
              targetChatListId: listId,
              targetSession: chatData.getSessionState(listId),
              updateListSession: updateSession
            }
          })
        }
      },
      {
        id: "setting",
        label: trs("输入框/斜杠/系统设置", {
          cn: "系统设置",
          en: "System Settings"
        }),
        desc: trs("输入框/斜杠/系统设置说明", {
          cn: "打开系统设置中心",
          en: "Open system settings center"
        }),
        icon: "Setting",
        keywords: "setting settings system config 系统 设置",
        action: () => {
          finishAction(false)
          Notice.launch({
            tip: trs("输入栏/提示/设置中心", {
              cn: "设置中心",
              en: "Settings"
            }),
            content: Setting
          })
        }
      }
    ]

    if (state.submenuId) {
      const parentObj = rootItems.find((item) => item.submenuId === state.submenuId)
      const subTitle = parentObj ? parentObj.label : ""
      const subArr = parentObj ? parentObj.children : []
      return [
        {
          id: "__slash_back__",
          label: trs("输入框/斜杠/返回上级", {
            cn: `← 返回上一级 (${subTitle})`,
            en: `← Back (${subTitle})`
          }),
          desc: "",
          isBack: true,
          action: () => goBackSubmenu()
        },
        ...(queryLower
          ? subArr.filter((item) => `${item.label} ${item.desc || ""} ${item.keywords || ""}`.toLowerCase().includes(queryLower))
          : subArr)
      ]
    }

    if (!queryLower) return rootItems

    const matchedArr = []
    rootItems.forEach((item) => {
      if (`${item.label} ${item.desc || ""} ${item.keywords || ""}`.toLowerCase().includes(queryLower)) {
        matchedArr.push(item)
      }
      if (item.children) {
        item.children.forEach((sub) => {
          if (!sub.disabled && `${sub.label} ${sub.desc || ""} ${sub.keywords || ""}`.toLowerCase().includes(queryLower)) {
            matchedArr.push(sub)
          }
        })
      }
    })
    return matchedArr
  }

  const executeItem = (itemObj) => {
    if (!itemObj || itemObj.disabled) return
    const state = getMenuState()
    if (itemObj.submenuId) {
      state.parentSelectedIndex = state.selectedIndex
      state.submenuId = itemObj.submenuId
      state.selectedIndex = 0
      state.scrollVersion++
      m.redraw()
      return
    }
    if (typeof itemObj.action === "function") {
      itemObj.action()
    }
  }

  const controller = {
    moveSelection: (delta) => {
      const state = getMenuState()
      const items = buildItems()
      if (items.length > 0) {
        state.selectedIndex = (state.selectedIndex + delta + items.length) % items.length
        state.scrollVersion++
        m.redraw()
      }
    },
    enterSubmenu: () => {
      const state = getMenuState()
      const curItem = buildItems()[state.selectedIndex]
      if (curItem && curItem.submenuId) {
        executeItem(curItem)
        return true
      }
      return false
    },
    executeSelected: () => {
      const state = getMenuState()
      const curItem = buildItems()[state.selectedIndex]
      if (curItem) {
        executeItem(curItem)
      } else if (typeof currentAttrs.onClose === "function") {
        currentAttrs.onClose()
      }
    },
    goBack: () => goBackSubmenu(),
    hasSubmenu: () => Boolean(getMenuState().submenuId)
  }

  return {
    oninit({ attrs }) {
      currentAttrs = attrs || {}
      loadDynamicCatalogs()
      if (typeof currentAttrs.onReady === "function") {
        currentAttrs.onReady(controller)
      }
    },
    oncreate(vnode) {
      currentAttrs = vnode.attrs || {}
      listContainerDom = vnode.dom
      lastScrolledVersion = getMenuState().scrollVersion
      scrollActiveItemIntoView()
    },
    onupdate(vnode) {
      currentAttrs = vnode.attrs || {}
      listContainerDom = vnode.dom
      if (lastScrolledVersion !== getMenuState().scrollVersion) {
        lastScrolledVersion = getMenuState().scrollVersion
        scrollActiveItemIntoView()
      }
    },
    onremove() {
      listContainerDom = null
      if (typeof currentAttrs.onReady === "function") {
        currentAttrs.onReady(null)
      }
    },
    view({ attrs }) {
      currentAttrs = attrs || {}
      const state = getMenuState()
      const items = buildItems()
      if (state.selectedIndex >= items.length) {
        state.selectedIndex = Math.max(0, items.length - 1)
      }

      return m("",
        {
          style: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            padding: `${getSize(3)}rem`,
            scrollPadding: `${getSize(3)}rem`,
            gap: `${getSize(3)}rem`,
            minWidth: `min(${getSize(50)}rem, calc(100vw - ${getSize(6)}rem))`,
            maxWidth: currentAttrs.isMini ? `min(${getSize(74)}rem, calc(100vw - ${getSize(6)}rem))` : "100%",
            maxHeight: currentAttrs.isMini ? `${getSize(52)}rem` : "65vh",
            overflowY: "auto",
            userSelect: "none"
          }
        },
        items.length === 0
          ? [
              m("",
                {
                  style: {
                    padding: `${getSize(3)}rem`,
                    fontSize: `${getSize(3)}rem`,
                    color: getColor("brown_2").front,
                    textAlign: "center"
                  }
                },
                trs("输入框/斜杠/无匹配命令", {
                  cn: "无匹配的斜杠命令",
                  en: "No matching commands"
                })
              )
            ]
          : items.map((item, idx) =>
              m("",
                {
                  key: item.id,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: `${getSize(2)}rem`,
                    padding: `${getSize(2)}rem ${getSize(3)}rem`,
                    borderRadius: `${getSize(8)}rem`,
                    background: idx === state.selectedIndex ? getColor("pink_1").back : "transparent",
                    color: idx === state.selectedIndex ? getColor("pink_1").front : getColor("brown_2").front,
                    opacity: item.disabled ? 0.55 : 1,
                    cursor: item.disabled ? "default" : "pointer",
                    flexShrink: 0
                  },
                  onpointerenter: (e) => {
                    if (e.pointerType !== "touch" && state.selectedIndex !== idx) {
                      state.selectedIndex = idx
                      m.redraw()
                    }
                  },
                  onpointerdown: (e) => {
                    if (e.pointerType !== "touch") {
                      e.preventDefault()
                    }
                  },
                  onclick: () => {
                    executeItem(item)
                  }
                },
                [
                  m("",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: `${getSize(2)}rem`,
                        minWidth: 0,
                        flex: 1
                      }
                    },
                    [
                      !state.submenuId && item.icon
                        ? m.trust(window.iconPark.getIcon(item.icon, {
                            fill: idx === state.selectedIndex ? getColor("pink_1").front : getColor("brown_2").front,
                            size: `${getSize(5)}rem`
                          }))
                        : null,
                      m("",
                        {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            minWidth: 0,
                            flex: 1
                          }
                        },
                        [
                          m("span",
                            {
                              style: {
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              }
                            },
                            item.label
                          ),
                          item.desc
                            ? m("span",
                                {
                                  style: {
                                    fontSize: `${getSize(3)}rem`,
                                    opacity: 0.7,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                  }
                                },
                                item.desc
                              )
                            : null
                        ]
                      )
                    ]
                  ),
                  item.active
                    ? m.trust(window.iconPark.getIcon("Check", {
                        fill: idx === state.selectedIndex ? getColor("pink_1").front : getColor("brown_2").front,
                        size: `${getSize(4)}rem`
                      }))
                    : item.submenuId
                      ? m.trust(window.iconPark.getIcon("Right", {
                          fill: idx === state.selectedIndex ? getColor("pink_1").front : getColor("brown_2").front,
                          size: `${getSize(4)}rem`
                        }))
                      : null
                ]
              )
            )
      )
    }
  }
}
