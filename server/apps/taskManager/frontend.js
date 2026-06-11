
import taskManagerData from "./taskManagerData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, iconPark, getColor }) => {
  // === State ===
  let appList = []
  let isLoading = false
  let lastRefresh = Date.now()
  let hoverId = null
  let pollTimer = null

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
        Notice.launch({ msg:res.msg, color: "green" })
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
    return m("div", {
      style: {
        display: "inline-flex", alignItems: "center", gap: "6px",
        padding: "3px 10px", borderRadius: "12px",
        fontSize: "10px", fontWeight: "600",
        background: isVisible
          ? "rgba(35, 212, 178, 0.15)"
          : "rgba(240, 98, 88, 0.1)",
        color: isVisible ? "#23D4B2" : "#F06258",
        border: `1px solid ${isVisible ? "rgba(35, 212, 178, 0.2)" : "rgba(240, 98, 88, 0.2)"}`,
      }
    }, [
      m("div", {
        style: {
          width: "5px", height: "5px", borderRadius: "50%",
          background: isVisible ? "#23D4B2" : "#F06258",
          boxShadow: isVisible ? "0 0 6px #23D4B2" : "none"
        }
      }),
      isVisible ? "活跃窗口" : "后台存活"
    ])
  }

  const AppCard = (app) => {
    const isHovered = hoverId === app.id

    return m("div", {
      key: app.id,
      onmouseenter: () => { hoverId = app.id; m.redraw() },
      onmouseleave: () => { hoverId = null; m.redraw() },
      style: {
        display: "flex", alignItems: "center",
        padding: "12px 16px", marginBottom: "10px",
        background: getColor('gray_3').back,
        opacity: isHovered ? 1 : 0.85,
        borderRadius: "14px",
        border: `1px solid ${isHovered ? getColor('gray_3').front + '33' : getColor('gray_3').front + '11'}`,
        color: getColor('gray_3').front,
        transition: "all 0.25s ease",
        transform: isHovered ? "translateY(-1px)" : "none",
      }
    }, [
      // App Type Graphic
      m("div", {
        style: {
          width: "40px", height: "40px", borderRadius: "10px",
          background: `linear-gradient(135deg, ${getColor('gray_12').back}, ${getColor('gray_12').front}22)`,
          color: getColor('gray_12').front,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", marginRight: "16px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.2)"
        }
      }, app.type.charAt(0).toUpperCase()),

      // Identity
      m("div", { style: { flex: 1, minWidth: 0 } }, [
        m("div", {
          style: {
            fontSize: "13px", fontWeight: "600", color: getColor('gray_3').front,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }
        }, app.id),
        m("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" } }, [
          m("span", { style: { fontSize: "11px", opacity: 0.6, color: getColor('gray_3').front } }, app.type),
          StatusBadge(app.guiLaunched)
        ])
      ]),

      // Toolset
      m("div", {
        style: {
          display: "flex", gap: "10px",
          opacity: isHovered ? 1 : 0.6,
          transition: "opacity 0.2s"
        }
      }, [
        // 唤醒 / 唤醒界面
        m(Box, {
          isBtn: true,
          style: {
            width: "25px", height: "25px", borderRadius: "50%",
            background: "rgba(35, 212, 178, 0.15)", color: "#23D4B2",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(35, 212, 178, 0.3)"
          },
          onclick: () => showApp(app.id)
        }, m.trust(iconPark.getIcon("PreviewOpen", { fill: "#23D4B2", size: "14px" }))),

        // 引用 AppID (同窗口引用按钮同款风格)
        m(Box, {
          isBtn: true,
          style: {
            width: "25px", height: "25px", borderRadius: "50%",
            background: getColor('yellow_1').back, color: getColor('yellow_1').front,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${getColor('yellow_1').front}33`
          },
          onclick: () => quoteId(app.id)
        }, m.trust(iconPark.getIcon("Quote", { fill: getColor('yellow_1').front, size: "12px" }))),

        // 终止进程
        m(Box, {
          isBtn: true,
          style: {
            width: "25px", height: "25px", borderRadius: "50%",
            background: "rgba(240, 98, 88, 0.15)", color: "#F06258",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(240, 98, 88, 0.3)"
          },
          onclick: () => killApp(app.id)
        }, m.trust(iconPark.getIcon("Close", { fill: "#F06258", size: "12px" })))
      ])
    ])
  }

  return {
    onremove() {
      taskManagerData.unregisterInstances(appId, commonData)
      if (pollTimer) clearInterval(pollTimer)
    },
    view() {
      return m("div", {
        style: {
          display: "flex", flexDirection: "column",
          width: "100%", height: "100%",
          background: getColor('gray_4').back,
          color: getColor('gray_4').front,
          fontFamily: "'Inter', system-ui, sans-serif",
          overflow: "hidden"
        }
      }, [
        // Glassy Navigation
        m("div", {
          style: {
            padding: "18px 24px",
            background: getColor('gray_12').back,
            borderBottom: `1px solid ${getColor('gray_4').front}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }
        }, [
          m("div", [
            m("div", { style: { fontSize: "16px", fontWeight: "800", color: getColor('gray_12').front, letterSpacing: "-0.3px" } }, "进程管理器"),
            m("div", { style: { fontSize: "10px", opacity: 0.5, marginTop: "2px", fontWeight: "500", color: getColor('gray_12').front } }, [
              m("span", { style: { color: "#23D4B2" } }, "● "),
              `AUTO-POLLING · ${appList.length} ACTIVE`
            ])
          ]),
          m(Box, {
            isBtn: true,
            style: {
              width: "36px", height: "36px", borderRadius: "10px",
              background: isLoading ? "rgba(255,255,255,0.05)" : "transparent",
              border: `1px solid ${getColor('gray_12').front}22`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.3s",
            },
            onclick: () => fetchList()
          }, m.trust(iconPark.getIcon("Refresh", { fill: isLoading ? "#23D4B2" : getColor('gray_12').front, size: "16px" })))
        ]),

        // Viewport
        m("div", {
          style: {
            flex: 1, overflowY: "auto", padding: "20px",
            background: getColor('gray_4').back
          }
        }, [
          appList.length === 0
            ? m("div", { style: { height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.25, color: getColor('gray_4').front } }, [
              m.trust(iconPark.getIcon("Terminal", { size: "48px", fill: getColor('gray_4').front })),
              m("div", { style: { marginTop: "12px", fontSize: "12px" } }, "系统纯净 · 暂无第三方负载")
            ])
            : appList.map(AppCard)
        ]),

        // Cyber Bottom Bar
        m("div", {
          style: {
            padding: "10px 24px",
            fontSize: "9px", letterSpacing: "1.5px",
            color: getColor('gray_12').front,
            opacity: 0.4,
            background: getColor('gray_12').back,
            display: "flex", justifyContent: "space-between",
            borderTop: `1px solid ${getColor('gray_4').front}22`,
          }
        }, [
          m("span", "CORE.TASK_PROC.OWO"),
          m("span", `UPTIME_SYNC: ${new Date(lastRefresh).toLocaleTimeString()}`)
        ])
      ])
    }
  }
}
