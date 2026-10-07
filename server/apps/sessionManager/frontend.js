import sessionManagerData from "./sessionManagerData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, Tag, iconPark, getColor, AutoForm, FormItem, ChatToolSelect, trs }) => {
  // === State ===
  let sessionList = []
  let isLoading = false
  let hoverId = null
  let pollTimer = null
  let containerWidth = window.innerWidth
  let observer = null

  // === Actions ===
  const fetchList = async (silent = false) => {
    if (!silent) isLoading = true
    m.redraw()
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "list", {}])
      if (res.ok) {
        sessionList = res.data
      }
    } catch (e) {
      console.error(e)
    } finally {
      isLoading = false
      m.redraw()
    }
  }

  const showSession = async (listId) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "show", { listId }])
      if (res.ok) {
        //Notice.launch({ msg: res.msg, color: "green" })
      } else {
        Notice.launch({ msg: res.msg, color: "red" })
      }
    } catch (e) {
      console.error(e)
    }
  }

  // 关闭指定 listId 的会话窗口（若已打开）
  const closeAgentWindow = (listId) => {
    Notice.closeTab("agent_" + listId)
  }

  const delSession = async (listId, name) => {
    Notice.launch({
      tip: "删除会话",
      appType: "sessionManager",
      icon: "icon.svg",
      msg: `确定要删除会话「${name}」(ID: ${listId}) 吗？\n该会话的全部消息将被永久清除，且不可恢复！`,
      confirm: async () => {
        try {
          const res = await settingData.fnCall("appDispatch", [appId, "del", { listId }])
          if (res.ok) {
            Notice.launch({ msg: res.msg, color: "green" })
            closeAgentWindow(listId)
            await fetchList(true)
          } else {
            Notice.launch({ msg: res.msg, color: "red" })
          }
        } catch (e) {
          console.error(e)
        }
      }
    })
  }
  // === 新建会话表单组件（Notice 弹窗内容）===
  // 完全参考 admin_page_main.js 标准范式：FormItem（标签）+ AutoForm（字段编辑器）
  const CreateSessionForm = (vnode) => {
    // formData 作为 AutoForm 数据源，字段值由 AutoForm 直接编辑
    const formData = {
      name: "",
      modelId: "",
      prompt: "",
      parentId: 0
    }
    // 默认工具：默认填入全部可见工具，可手动调整
    let allToolIdList = []
    let defaultToolIdList = []
    let toolsLoaded = false

    // 拉取全部可见工具作为白名单配置候选，并默认继承父会话的可继承工具
    const loadTools = async () => {
      const pId = Number(formData.parentId) || 0
      const [allRes, inheritRes] = await Promise.all([
        settingData.fnCall("getToolsList", [0, "all"]),
        settingData.fnCall("getToolsList", [pId, "inheritable"])
      ])
      if (allRes?.ok && Array.isArray(allRes.data)) {
        allToolIdList = allRes.data
        if (inheritRes?.ok && Array.isArray(inheritRes.data) && inheritRes.data.length > 0) {
          defaultToolIdList = inheritRes.data.map(tool => tool.id)
        } else {
          defaultToolIdList = allRes.data.map(tool => tool.id)
        }
      }
      m.redraw()
    }
    const enabledAgents = settingData.options.get("ai_aiList")?.filter(m => m.switch) || []
    let submitting = false

    const close = () => Notice.closeTab(vnode.attrs.noticeConfig.sign)
    const submit = async () => {
      // AutoForm 会把纯数字输入转成 number，统一 String() 包裹为字符串
      const nameStr = String(formData.name ?? "").trim()
      const promptStr = String(formData.prompt ?? "").trim()
      if (!nameStr) {
        Notice.launch({ msg: "请填写会话名称", color: "yellow" })
        return
      }
      submitting = true
      m.redraw()
      try {
        const res = await settingData.fnCall("appDispatch", [appId, "create", {
          name: nameStr,
          prompt: promptStr,
          parentId: Number(formData.parentId) || 0,
          modelId: formData.modelId,
          defaultTools: defaultToolIdList
        }])
        if (res.ok) {
          close()
          Notice.launch({ msg: res.msg, color: "green" })
          await fetchList(true)
        } else {
          Notice.launch({ msg: res.msg, color: "red" })
        }
      } catch (e) {
        console.error(e)
      } finally {
        submitting = false
        m.redraw()
      }
    }
    return {
      oninit() {
        if (toolsLoaded) return
        toolsLoaded = true
        loadTools()
      },
      view() {
        return m("", {
          style: {
            display: "flex",
            flexDirection: "column",
            width: "100%"
          }
        }, [
          m(FormItem, {
            label: "名称 *"
          }, [
            m(AutoForm, { dataObj: formData, dataName: "name", extEditMode: false })
          ]),
          // 模型字段：AutoForm 显示当前值，下拉框辅助改 formData.modelId
          m(FormItem, {
            label: "AI 模型配置"
          }, [
            m(AutoForm, { dataObj: formData, dataName: "modelId", extEditMode: false }),
            m("select", {
              onchange: (e) => { formData.modelId = e.target.value; m.redraw() },
              style: {
                width: "100%",
                borderRadius: "0.8rem",
                border: "0.15rem solid " + getColor("gray_1").front + "22",
                background: getColor("gray_3").back,
                color: getColor("gray_1").front,
                outline: "none",
                padding: "0.6rem 1rem",
                cursor: "pointer",
                marginTop: "0.6rem"
              }
            }, [
              m("option", { value: "" }, "继承父级模型"),
              enabledAgents.length === 0
                ? m("option", { value: "", disabled: true }, "无可用 AI 模型（请先在设置中开启）")
                : enabledAgents.map(item => m("option", { value: item.id, key: item.id }, item.name))
            ])
          ]),
          m(FormItem, {
            label: "提示词（可选）"
          }, [
            m(AutoForm, { dataObj: formData, dataName: "prompt", extEditMode: false })
          ]),
          m(FormItem, {
            label: "父级会话 ID（可选，默认主控AI）"
          }, [
            m(AutoForm, { dataObj: formData, dataName: "parentId", extEditMode: false })
          ]),
          m(FormItem, {
            label: "初始工具（可手动调整）"
          }, [
            m("", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap"
              }
            }, [
              m(Tag, {
                isBtn: true,
                color: "yellow_1",
                styleExt: {
                  margin: "0",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  padding: "0.4rem 1rem",
                  borderRadius: "3rem"
                },
                onclick: () => {
                  Notice.launch({
                    sign: "session_create_tool_modal",
                    tip: "选择允许使用的工具",
                    hideBtn: 2,
                    content: ChatToolSelect,
                    contentAttrs: {
                      toolsList: allToolIdList,
                      getSelectedList: () => defaultToolIdList,
                      onToggleTool: (toolId) => {
                        defaultToolIdList = defaultToolIdList.includes(toolId)
                          ? defaultToolIdList.filter(id => id !== toolId)
                          : [...defaultToolIdList, toolId]
                        m.redraw()
                      },
                      onSetAll: (idList) => {
                        defaultToolIdList = [...idList]
                        m.redraw()
                      }
                    }
                  })
                }
              }, `选择工具 (${defaultToolIdList.length})`)
            ]),
            m("div", {
              style: {
                fontSize: "1.2rem",
                opacity: 0.6,
                marginTop: "0.4rem"
              }
            }, `新会话将默认允许使用 ${defaultToolIdList.length} 个工具；创建后仍可在输入栏的「更多参数配置」中调整工具许可`)
          ]),
          m("", { style: { display: "flex", justifyContent: "flex-end", gap: "1rem" } }, [
            m(Box, {
              isBtn: true,
              color: "gray_4",
              onclick: close
            }, "取消"),
            m(Box, {
              isBtn: true,
              color: "green_1",
              onclick: submit
            }, submitting ? "创建中..." : "创建")
          ])
        ])
      }
    }
  }

  const openCreateForm = () => {
    Notice.launch({
      sign: "session_create_form",
      tip: "新建会话",
      appType: "sessionManager",
      content: CreateSessionForm,
      hideBtn: 2,
      useMinus: false,
      width: 480
    })
  }

  // === 编辑会话初始工具弹窗 ===
  const EditSessionForm = (vnode) => {
    const { listId, sessionData } = vnode.attrs
    let allToolIdList = []
    let defaultToolIdList = [...sessionData.defaultTools]
    let toolsLoaded = false
    let submitting = false

    const close = () => Notice.closeTab(vnode.attrs.noticeConfig.sign)

    const loadTools = async () => {
      try {
        const res = await settingData.fnCall("getToolsList", [0, "all"])
        if (res.ok) allToolIdList = res.data
      } catch (err) {
        console.error(err)
      }
      m.redraw()
    }

    const submit = async () => {
      submitting = true
      m.redraw()
      try {
        const res = await settingData.fnCall("appDispatch", [appId, "update", {
          listId,
          defaultTools: defaultToolIdList
        }])
        if (!res.ok) {
          Notice.launch({
            msg: res.msg,
            color: "red"
          })
          return
        }
        close()
        Notice.launch({
          msg: res.msg,
          color: "green"
        })
        await fetchList(true)
      } catch (err) {
        console.error(err)
      } finally {
        submitting = false
        m.redraw()
      }
    }

    return {
      oninit() {
        if (toolsLoaded) return
        toolsLoaded = true
        loadTools()
      },
      view() {
        return m(
          "",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              width: "100%"
            }
          },
          [
            // 缓存穿透风险提示卡片（遵循 Box 颜色对齐）
            m(
              Box,
              {
                color: "yellow_1",
                style: {
                  fontSize: "1.2rem",
                  lineHeight: "1.6",
                  margin: "0"
                }
              },
              trs("会话管理器/编辑/穿透警示", {
                cn: "⚠️ 缓存穿透风险提示：修改会话初始工具底座（defaultTools）会改变底层 System Prompt 与工具签名哈希，将导致云端已有的 Prompt Cache（前缀缓存）彻底失效并重新计算。",
                en: "⚠️ Prompt Cache Invalidation Warning: Changing defaultTools will alter the System Prompt and tool signature hash, causing existing cloud KV cache to be recomputed."
              })
            ),

            // 只读项：会话名称
            m(
              FormItem,
              {
                label: trs("会话管理器/表单/名称", { cn: "会话名称", en: "Session Name" })
              },
              [
                m(
                  Box,
                  {
                    color: "gray_3",
                    style: {
                      margin: "0",
                      opacity: 0.7,
                      wordBreak: "break-all"
                    }
                  },
                  sessionData.name + (listId === 0
                    ? trs("会话管理器/标签/主会话", { cn: "（主会话）", en: " (Main)" })
                    : `（ID: ${listId}）`)
                )
              ]
            ),

            // 只读项：AI 模型
            m(
              FormItem,
              {
                label: trs("会话管理器/表单/模型只读", { cn: "AI 模型配置（只读）", en: "AI Model (Readonly)" })
              },
              [
                m(
                  Box,
                  {
                    color: "gray_3",
                    style: {
                      margin: "0",
                      opacity: 0.7,
                      wordBreak: "break-all"
                    }
                  },
                  sessionData.modelId || trs("会话管理器/选项/继承父级模型", { cn: "继承父级模型", en: "Inherit parent model" })
                )
              ]
            ),

            // 只读项：提示词
            m(
              FormItem,
              {
                label: trs("会话管理器/表单/提示词只读", { cn: "提示词（只读）", en: "Prompt (Readonly)" })
              },
              [
                m(
                  Box,
                  {
                    color: "gray_3",
                    style: {
                      margin: "0",
                      opacity: 0.7,
                      maxHeight: "12rem",
                      overflowY: "auto",
                      wordBreak: "break-all"
                    }
                  },
                  sessionData.prompt || trs("会话管理器/提示/无提示词", { cn: "（未配置特定提示词）", en: "(No specific prompt)" })
                )
              ]
            ),

            // 初始工具底座（唯一可编辑项）
            m(
              FormItem,
              {
                label: trs("会话管理器/表单/初始工具", { cn: "初始工具底座（defaultTools）", en: "Default Tools" })
              },
              [
                m(
                  "",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap"
                    }
                  },
                  [
                    m(
                      Tag,
                      {
                        isBtn: true,
                        color: "yellow_1",
                        onclick: () => {
                          Notice.launch({
                            sign: "session_edit_tool_modal",
                            tip: trs("会话管理器/弹窗/选择工具", { cn: "选择允许使用的工具", en: "Select Allowed Tools" }),
                            hideBtn: 2,
                            content: ChatToolSelect,
                            contentAttrs: {
                              toolsList: allToolIdList,
                              getSelectedList: () => defaultToolIdList,
                              onToggleTool: (toolId) => {
                                defaultToolIdList = defaultToolIdList.includes(toolId)
                                  ? defaultToolIdList.filter(id => id !== toolId)
                                  : [...defaultToolIdList, toolId]
                                m.redraw()
                              },
                              onSetAll: (idList) => {
                                defaultToolIdList = [...idList]
                                m.redraw()
                              }
                            }
                          })
                        }
                      },
                      trs("会话管理器/按钮/选择工具数", {
                        cn: `选择工具 (${defaultToolIdList.length})`,
                        en: `Select Tools (${defaultToolIdList.length})`
                      })
                    )
                  ]
                ),
                m(
                  "div",
                  {
                    style: {
                      fontSize: "1.2rem",
                      opacity: 0.6,
                      marginTop: "0.4rem"
                    }
                  },
                  trs("会话管理器/提示/工具生效说明", {
                    cn: `当前已选 ${defaultToolIdList.length} 个初始工具；保存后立即生效于该会话的大模型工具底座。`,
                    en: `${defaultToolIdList.length} tools selected; will take effect as the model's base tools upon saving.`
                  })
                )
              ]
            ),

            // 操作按钮
            m(
              "",
              {
                style: {
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "1rem",
                  marginTop: "0.5rem"
                }
              },
              [
                m(
                  Box,
                  {
                    isBtn: true,
                    color: "gray_4",
                    onclick: close
                  },
                  trs("通用/按钮/取消", { cn: "取消", en: "Cancel" })
                ),
                m(
                  Box,
                  {
                    isBtn: true,
                    color: "green_1",
                    onclick: submit
                  },
                  submitting
                    ? trs("通用/提示/保存中", { cn: "保存中...", en: "Saving..." })
                    : trs("会话管理器/按钮/保存初始工具", { cn: "保存初始工具", en: "Save Tools" })
                )
              ]
            )
          ]
        )
      }
    }
  }

  // 先向服务端预取会话数据，成功后才唤起编辑弹窗
  const openEditForm = async (listId) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "get", { listId }])
      if (!res.ok) {
        Notice.launch({
          msg: res.msg,
          color: "red"
        })
        return
      }
      Notice.launch({
        sign: "session_edit_form_" + listId,
        tip: "编辑会话",
        appType: "sessionManager",
        content: EditSessionForm,
        contentAttrs: {
          listId,
          sessionData: res.data
        },
        hideBtn: 2,
        useMinus: false,
        width: 480
      })
    } catch (err) {
      console.error(err)
    }
  }

  // === Instance Interface ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      const done = (res) => { if (callback) callback(res) }
      if (msg.action === "getHTML") return done({ ok: true, data: document.body.innerHTML })
      done({ ok: true })
    }
  }

  // === Init ===
  const init = () => {
    sessionManagerData.addTool("commonData", commonData)
    sessionManagerData.registerInstances(appId, instanceInterface)
    if (commonData && commonData.registerApp) commonData.registerApp(appId, sessionManagerData)

    fetchList()
  }

  init()

  // === Render Helpers ===
  const StatusBadge = (running) => {
    const badgeColor = running ? "green_1" : "pink_1"
    return m(Tag, {
      color: badgeColor,
      styleExt: {
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        fontSize: "1.0rem",
        margin: "0"
      }
    }, [
      m("", {
        style: {
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          background: getColor(badgeColor).front,
          boxShadow: running ? `0 0 0.4rem ${getColor(badgeColor).front}` : "none"
        }
      }),
      running ? "运行中" : "已停止"
    ])
  }

  const SessionCard = (session, isMob) => {
    const isHovered = hoverId === session.listId

    const contentArea = m("", {
      style: {
        display: "flex",
        alignItems: "center",
        flex: 1,
        minWidth: 0,
        marginBottom: isMob ? "1.0rem" : "0rem"
      }
    }, [
      // Graphic (Avatar)
      m("", {
        style: {
          width: "4.0rem",
          height: "4.0rem",
          borderRadius: "1.0rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: "1.2rem",
          boxShadow: "0 0.4rem 1.0rem rgba(0,0,0,0.2)",
          background: `linear-gradient(135deg, ${getColor("main").back}, ${getColor("main").front}44)`,
          overflow: "hidden"
        }
      }, m.trust(iconPark.getIcon("RobotOne", { size: "2.4rem", fill: getColor("main").front }))),
      // Identity
      m("", { style: { flex: 1, minWidth: 0 } }, [
        m("", {
          style: {
            fontSize: "1.3rem",
            fontWeight: "600",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }
        }, session.name),
        m("", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "1.0rem",
            marginTop: "0.4rem",
            flexWrap: "wrap"
          }
        }, [
          m("span", {
            style: {
              fontSize: "1.1rem",
              opacity: 0.6
            }
          }, `ID: ${session.listId}`),
          session.parentName
            ? m("span", {
              style: {
                fontSize: "1.1rem",
                opacity: 0.6
              }
            }, `← ${session.parentName}`)
            : null,
          StatusBadge(session.running)
        ])
      ])
    ])

    const toolsetArea = m("", {
      style: {
        display: "flex",
        justifyContent: isMob ? "flex-end" : "flex-start",
        gap: "1.0rem"
      }
    }, [
      // 配置初始工具底座（设置齿轮图标，合法存在于 iconPark.js）
      m(Tag, {
        isBtn: true,
        color: "yellow_1",
        onclick: () => openEditForm(session.listId)
      }, m.trust(iconPark.getIcon("SettingTwo", { fill: getColor("yellow_1").front, size: "1.2rem" }))),

      // 唤起会话窗口
      m(Tag, {
        isBtn: true,
        color: "green_1",
        onclick: () => showSession(session.listId)
      }, m.trust(iconPark.getIcon("PreviewOpen", { fill: getColor("green_1").front, size: "1.2rem" }))),

      // 删除会话（主会话 listId: 0 不可删除，不渲染删除按钮）
      session.listId !== 0 ? m(Tag, {
        isBtn: true,
        color: "pink_1",
        onclick: () => delSession(session.listId, session.name)
      }, m.trust(iconPark.getIcon("Close", { fill: getColor("pink_1").front, size: "1.2rem" }))) : null
    ])

    return m(Box, {
      key: session.listId,
      color: "gray_3",
      isBlock: true,
      ext: {
        onmouseenter: () => { hoverId = session.listId },
        onmouseleave: () => { hoverId = null }
      },
      style: {
        display: "flex",
        flexDirection: isMob ? "column" : "row",
        alignItems: isMob ? "stretch" : "center",
        opacity: isHovered ? 1 : 0.85,
        transition: "all 0.25s ease",
        transform: isHovered ? "translateY(-0.1rem)" : "none",
      }
    }, [contentArea, toolsetArea])
  }

  return {
    oninit(vnode) {
      // 动态向窗口标题栏追加刷新按钮
      const config = vnode.attrs.noticeConfig
      if (config) {
        if (!config.headerButtons) config.headerButtons = []
        const hasRefresh = config.headerButtons.some(b => b.id === "session_manager_refresh")
        if (!hasRefresh) {
          config.headerButtons.push({
            id: "session_manager_refresh",
            icon: iconPark.getIcon("Refresh", { fill: getColor("gray_8").front, size: "1.2rem" }),
            color: getColor("green_1").back,
            onclick: (e) => {
              if (e && e.stopPropagation) e.stopPropagation()
              fetchList()
            }
          })
        }
      }

      // 💡 定时轮询必须在组件挂载后启动，才能与 onremove 成对回收；
      // 写在工厂函数顶层会导致 Notice.launch 命中 sign 去重丢弃组件时产生无法回收的孤儿定时器
      if (!pollTimer) {
        pollTimer = setInterval(() => fetchList(true), 3000)
      }
    },
    oncreate(vnode) {
      const dom = vnode.dom
      containerWidth = dom.offsetWidth
      observer = new ResizeObserver(entries => {
        for (let entry of entries) {
          const newWidth = entry.contentRect.width
          if (Math.abs(newWidth - containerWidth) > 5) {
            containerWidth = newWidth
            m.redraw()
          }
        }
      })
      observer.observe(dom)
      m.redraw()
    },
    onremove() {
      sessionManagerData.unregisterInstances(appId, commonData)
      if (pollTimer) clearInterval(pollTimer)
      if (observer) observer.disconnect()
    },
    view() {
      const isMob = window.Mob || (containerWidth < 500)

      return m("", {
        style: {
          flex: 1,
          overflowY: "auto",
          padding: "1.0rem"
        }
      }, [
        // 顶部操作栏
        m("", {
          style: {
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "1.2rem"
          }
        }, [
          m(Tag, {
            isBtn: true,
            color: "green_1",
            onclick: openCreateForm
          }, [
            m.trust(iconPark.getIcon("Plus", { fill: getColor("green_1").front, size: "1.2rem" })),
            m("span", { style: { marginLeft: "0.4rem" } }, "新建会话")
          ])
        ]),
        sessionList.length === 0
          ? m("", {
            style: {
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.25,
              color: getColor("gray_4").front
            }
          }, [
            m.trust(iconPark.getIcon("Message", { size: "4.8rem", fill: getColor("gray_4").front })),
            m("", { style: { marginTop: "1.2rem", fontSize: "1.2rem" } }, "暂无子智能体会话")
          ])
          : sessionList.map(session => SessionCard(session, isMob))
      ])
    }
  }
}
