import sessionManagerData from "./sessionManagerData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, Tag, iconPark, getColor }) => {
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
    const dataArr = Notice.data.dataArr
    if (dataArr) {
      for (let i = dataArr.length - 1; i >= 0; i--) {
        if (dataArr[i].sign === "agent_" + listId) {
          Notice.closeTab(dataArr[i])
        }
      }
    }
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
  const CreateSessionForm = (vnode) => {
    let name = ""
    let prompt = ""
    let parentId = "0"
    const enabledAgents = settingData.options.get("ai_aiList")?.filter(m => m.switch) || []
    let selectedModelId = enabledAgents[0]?.id || ""
    let submitting = false

    const close = () => Notice.closeTab(vnode.attrs.noticeConfig)
    const submit = async () => {
      if (!name.trim()) {
        Notice.launch({ msg: "请填写会话名称", color: "yellow" })
        return
      }
      if (!selectedModelId) {
        Notice.launch({ msg: "请选择 AI 模型配置", color: "yellow" })
        return
      }
      submitting = true
      m.redraw()
      try {
        const res = await settingData.fnCall("appDispatch", [appId, "create", {
          name: name.trim(),
          prompt: prompt.trim(),
          parentId: Number(parentId) || 0,
          modelId: selectedModelId
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
    const inputStyle = {
      fontSize: "1.2rem",
      borderRadius: "0.8rem",
      border: `0.1rem solid ${getColor("gray_5").back}`,
      background: getColor("gray_12").back,
      color: getColor("gray_1").front,
      outline: "none",
      padding: "0.6rem 1rem",
      width: "100%",
      boxSizing: "border-box"
    }
    return {
      view() {
        return m("", {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "1.2rem",
            width: "36rem",
            maxWidth: "90vw",
            boxSizing: "border-box"
          }
        }, [
          m("", { style: { display: "flex", flexDirection: "column", gap: "0.4rem" } }, [
            m("span", { style: { fontSize: "1.0rem", opacity: 0.7 } }, "名称 *"),
            m("input", {
              type: "text",
              value: name,
              placeholder: "例如：数据分析助手",
              oninput: (e) => { name = e.target.value },
              style: inputStyle
            })
          ]),
          m("", { style: { display: "flex", flexDirection: "column", gap: "0.4rem" } }, [
            m("span", { style: { fontSize: "1.0rem", opacity: 0.7 } }, "AI 模型配置 *"),
            m("select", {
              value: selectedModelId,
              onchange: (e) => { selectedModelId = e.target.value },
              style: {
                ...inputStyle,
                cursor: "pointer"
              }
            }, enabledAgents.length === 0
              ? m("option", { value: "" }, "无可用 AI 模型（请先在设置中开启）")
              : enabledAgents.map(item => m("option", { value: item.id, key: item.id }, item.name))
            )
          ]),
          m("", { style: { display: "flex", flexDirection: "column", gap: "0.4rem" } }, [
            m("span", { style: { fontSize: "1.0rem", opacity: 0.7 } }, "提示词（可选）"),
            m("textarea", {
              value: prompt,
              placeholder: "设定子智能体的角色与任务...",
              oninput: (e) => { prompt = e.target.value },
              rows: 4,
              style: {
                ...inputStyle,
                fontSize: "1.1rem",
                resize: "vertical"
              }
            })
          ]),
          m("", { style: { display: "flex", flexDirection: "column", gap: "0.4rem" } }, [
            m("span", { style: { fontSize: "1.0rem", opacity: 0.7 } }, "父级会话 ID（可选，默认主控AI）"),
            m("input", {
              type: "number",
              value: parentId,
              oninput: (e) => { parentId = e.target.value },
              style: inputStyle
            })
          ]),
          m("", { style: { display: "flex", justifyContent: "flex-end", gap: "1rem" } }, [
            m(Tag, {
              isBtn: true,
              color: "gray_4",
              onclick: close
            }, "取消"),
            m(Tag, {
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
    // 启动定时拉取 (每 3 秒刷新一次)
    pollTimer = setInterval(() => fetchList(true), 3000)
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
