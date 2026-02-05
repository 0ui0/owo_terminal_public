
import taskManagerData from "./taskManagerData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, iconPark }) => {
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
      if (res.ok && res.data?.ok) {
        appList = res.data.data
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
      if (res.ok && res.data?.ok) {
        Notice.launch({ msg: `已成功终止: ${targetId}`, color: "green" })
        await fetchList(true)
      } else {
        Notice.launch({ msg: "操作失败: " + (res.msg || "应用可能已退出"), color: "red" })
      }
    } catch (e) {
      console.error(e)
    }
  }

  const showApp = async (targetId) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "show", { targetId }])
      if (res.ok && res.data?.ok) {
        Notice.launch({ msg: `已尝试唤醒界面: ${targetId}`, color: "green" })
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
        background: isHovered ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.03)",
        borderRadius: "14px",
        border: `1px solid ${isHovered ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.05)"}`,
        transition: "all 0.25s ease",
        transform: isHovered ? "translateY(-1px)" : "none",
      }
    }, [
      // App Type Graphic
      m("div", {
        style: {
          width: "40px", height: "40px", borderRadius: "10px",
          background: "linear-gradient(135deg, #444, #222)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", marginRight: "16px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.2)"
        }
      }, app.type.charAt(0).toUpperCase()),

      // Identity
      m("div", { style: { flex: 1, minWidth: 0 } }, [
        m("div", {
          style: {
            fontSize: "13px", fontWeight: "600", color: "#fff",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }
        }, app.id),
        m("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" } }, [
          m("span", { style: { fontSize: "11px", opacity: 0.4 } }, app.type),
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
            background: "#23D4B222", color: "#23D4B2",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid #23D4B244"
          },
          onclick: () => showApp(app.id)
        }, m.trust(iconPark.getIcon("PreviewOpen", { fill: "#23D4B2", size: "14px" }))),

        // 引用 AppID (同窗口引用按钮同款风格)
        m(Box, {
          isBtn: true,
          style: {
            width: "25px", height: "25px", borderRadius: "50%",
            background: "#5e6c79", color: "#eee",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid #393432"
          },
          onclick: () => quoteId(app.id)
        }, m.trust(iconPark.getIcon("Quote", { fill: "#eee", size: "12px" }))),

        // 终止进程
        m(Box, {
          isBtn: true,
          style: {
            width: "25px", height: "25px", borderRadius: "50%",
            background: "#F06258", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid #393432"
          },
          onclick: () => killApp(app.id)
        }, m.trust(iconPark.getIcon("Close", { fill: "#fff", size: "12px" })))
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
          background: "linear-gradient(135deg, #16161a, #0a0a0c)",
          color: "#d1d1d6",
          fontFamily: "'Inter', system-ui, sans-serif",
          overflow: "hidden"
        }
      }, [
        // Glassy Navigation
        m("div", {
          style: {
            padding: "18px 24px",
            background: "rgba(255, 255, 255, 0.02)",
            backdropFilter: "blur(25px)",
            WebkitBackdropFilter: "blur(25px)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }
        }, [
          m("div", [
            m("div", { style: { fontSize: "16px", fontWeight: "800", color: "#fff", letterSpacing: "-0.3px" } }, "进程管理器"),
            m("div", { style: { fontSize: "10px", opacity: 0.3, marginTop: "2px", fontWeight: "500" } }, [
              m("span", { style: { color: "#23D4B2" } }, "● "),
              `AUTO-POLLING · ${appList.length} ACTIVE`
            ])
          ]),
          m(Box, {
            isBtn: true,
            style: {
              width: "36px", height: "36px", borderRadius: "10px",
              background: isLoading ? "rgba(255,255,255,0.05)" : "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.3s",
            },
            onclick: () => fetchList()
          }, m.trust(iconPark.getIcon("Refresh", { fill: isLoading ? "#23D4B2" : "#666", size: "16px" })))
        ]),

        // Viewport
        m("div", {
          style: {
            flex: 1, overflowY: "auto", padding: "20px",
            background: "radial-gradient(circle at top, rgba(35, 212, 178, 0.03) 0%, transparent 50%)"
          }
        }, [
          appList.length === 0
            ? m("div", { style: { height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.1 } }, [
              m.trust(iconPark.getIcon("Terminal", { size: "48px", fill: "#fff" })),
              m("div", { style: { marginTop: "12px", fontSize: "12px" } }, "系统纯净 · 暂无第三方负载")
            ])
            : appList.map(AppCard)
        ]),

        // Cyber Bottom Bar
        m("div", {
          style: {
            padding: "10px 24px",
            fontSize: "9px", letterSpacing: "1.5px", opacity: 0.25,
            fontWeight: "300", background: "rgba(0,0,0,0.1)",
            display: "flex", justifyContent: "space-between"
          }
        }, [
          m("span", "CORE.TASK_PROC.OWO"),
          m("span", `UPTIME_SYNC: ${new Date(lastRefresh).toLocaleTimeString()}`)
        ])
      ])
    }
  }
}
