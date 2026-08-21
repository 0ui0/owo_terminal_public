import sessionManagerData from "./sessionManagerData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, Tag, iconPark, getColor, AutoForm, FormItem }) => {
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
  // 完全参考 admin_page_main.js 标准范式：FormItem（标签）+ AutoForm（字段编辑器）
  const CreateSessionForm = (vnode) => {
    // formData 作为 AutoForm 数据源，字段值由 AutoForm 直接编辑
    const formData = {
      name: "",
      modelId: "",
      prompt: "",
      parentId: 0
    }
    const enabledAgents = settingData.options.get("ai_aiList")?.filter(m => m.switch) || []
    let submitting = false

    const close = () => Notice.closeTab(vnode.attrs.noticeConfig)
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
          modelId: formData.modelId
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
