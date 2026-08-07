import taskManagerData from "./taskManagerData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, Tag, iconPark, getColor }) => {
  // === State ===
  let appList = []
  let isLoading = false
  let lastRefresh = Date.now()
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
        appList = res.data
        lastRefresh = Date.now()
      }
    } catch (e) {
      console.error(e)
    } finally {
      isLoading = false
      m.redraw()
    }
  }

  const killApp = async (targetId) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "kill", { targetId }])
      if (res.ok) {
        Notice.launch({ msg: res.msg, color: "green" })
        await fetchList(true)
      } else {
        Notice.launch({ msg: res.msg, color: "red" })
      }
    } catch (e) {
      console.error(e)
    }
  }

  const showApp = async (targetId) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "show", { targetId }])
      if (res.ok) {
        Notice.launch({ msg: res.msg, color: "green" })
      }
    } catch (e) {
      console.error(e)
    }
  }

  const quoteId = (targetId) => {
    if (chatData && chatData.quoteAppId) {
      chatData.quoteAppId(targetId)
      Notice.launch({ msg: "已引用 AppID 到输入框", color: "green" })
    } else {
      Notice.launch({ msg: "引用功能尚未开启", color: "yellow" })
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
    taskManagerData.addTool("commonData", commonData)
    taskManagerData.registerInstances(appId, instanceInterface)
    if (commonData && commonData.registerApp) commonData.registerApp(appId, taskManagerData)

    fetchList()
    // 启动定时拉取 (每 3 秒刷新一次)
    pollTimer = setInterval(() => fetchList(true), 3000)
  }

  init()

  // === Render Helpers ===
  const StatusBadge = (isVisible) => {
    const successColor = "green_1"
    const failColor = "pink_1"
    const badgeColor = isVisible ? successColor : failColor

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
          boxShadow: isVisible ? `0 0 0.4rem ${getColor(badgeColor).front}` : "none"
        }
      }),
      isVisible ? "活跃窗口" : "后台存活"
    ])
  }

  const AppCard = (app, isMob) => {
    const isHovered = hoverId === app.id

    const contentArea = m("", {
      style: {
        display: "flex",
        alignItems: "center",
        flex: 1,
        minWidth: 0,
        marginBottom: isMob ? "1.0rem" : "0rem"
      }
    }, [
      // Graphic (App Icon)
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
          overflow: "hidden"
        }
      }, m("img", {
        src: `/api/apps/${app.type}/${app.icon || "icon.svg"}`,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "contain"
        },
        onerror: (e) => {
          e.target.style.display = "none"
          e.target.parentNode.style.background = `linear-gradient(135deg, ${getColor("gray_12").back}, ${getColor("gray_12").front}22)`
          e.target.parentNode.style.color = getColor("gray_12").front
          const fallback = document.createElement("span")
          fallback.innerText = app.type.charAt(0).toUpperCase()
          fallback.style.fontSize = "1.8rem"
          fallback.style.fontWeight = "bold"
          e.target.parentNode.appendChild(fallback)
        }
      })),
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
        }, app.id),
        m("", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "1.0rem",
            marginTop: "0.4rem"
          }
        }, [
          m("span", {
            style: {
              fontSize: "1.1rem",
              opacity: 0.6
            }
          }, app.type),
          StatusBadge(app.guiLaunched)
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
      // 唤醒 / 唤醒界面
      m(Tag, {
        isBtn: true,
        color: "green_1",
        onclick: () => showApp(app.id)
      }, m.trust(iconPark.getIcon("PreviewOpen", { fill: getColor("green_1").front, size: "1.2rem" }))),

      // 引用 AppID (同窗口引用按钮同款风格)
      m(Tag, {
        isBtn: true,
        color: "yellow_1",
        onclick: () => quoteId(app.id)
      }, m.trust(iconPark.getIcon("Quote", { fill: getColor("yellow_1").front, size: "1.2rem" }))),

      // 终止进程
      m(Tag, {
        isBtn: true,
        color: "pink_1",
        onclick: () => killApp(app.id)
      }, m.trust(iconPark.getIcon("Close", { fill: getColor("pink_1").front, size: "1.2rem" })))
    ])

    return m(Box, {
      key: app.id,
      color: "gray_3",
      isBlock: true,
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
        const hasRefresh = config.headerButtons.some(b => b.id === "task_manager_refresh")
        if (!hasRefresh) {
          config.headerButtons.push({
            id: "task_manager_refresh",
            icon: m.trust(iconPark.getIcon("Refresh", { fill: getColor("gray_8").front, size: "1.2rem" })),
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
      taskManagerData.unregisterInstances(appId, commonData)
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
        appList.length === 0
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
              m.trust(iconPark.getIcon("Terminal", { size: "4.8rem", fill: getColor("gray_4").front })),
              m("", { style: { marginTop: "1.2rem", fontSize: "1.2rem" } }, "系统纯净 · 暂无第三方负载")
            ])
          : appList.map(app => AppCard(app, isMob))
      ])
    }
  }
}
