
import aiSelectionData from "./aiSelectionData.js"

export default ({ appId, m, Notice, ioSocket, commonData, chatData, settingData, Box, iconPark }) => {
  // === State ===
  let title = "请选择一项操作"
  let options = []

  // === Actions ===
  const selectOption = async (value) => {
    try {
      await settingData.fnCall("appDispatch", [appId, "select", { value }])
    } catch (e) {
      console.error(e)
    }
  }

  // === Instance Interface ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (msg.action === "getHTML") return callback({ ok: true, data: document.body.innerHTML })
      if (callback) callback({ ok: true })
    }
  }

  // === Init ===
  const init = () => {
    aiSelectionData.addTool("commonData", commonData)
    aiSelectionData.registerInstances(appId, instanceInterface)
    if (commonData.registerApp) commonData.registerApp(appId, aiSelectionData)
  }

  init()

  return {
    oninit(vnode) {
      // 从 vnode.attrs 获取启动参数
      if (vnode.attrs.data) {
        if (vnode.attrs.data.title) title = vnode.attrs.data.title
        if (vnode.attrs.data.options) options = vnode.attrs.data.options
      }
    },
    onremove() {
      aiSelectionData.unregisterInstances(appId, commonData)
    },
    view() {
      return m("div", {
        style: {
          display: "flex", flexDirection: "column",
          width: "100%", height: "100%",
          background: "linear-gradient(135deg, #1e1e24 0%, #0c0c0f 100%)",
          color: "#eee",
          fontFamily: "'Inter', sans-serif",
          padding: "24px",
          boxSizing: "border-box",
          overflow: "hidden",
          position: "relative"
        }
      }, [
        // Bubble Decorative Elements
        m("div", {
          style: {
            position: "absolute", top: "-50px", right: "-50px",
            width: "150px", height: "150px", borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.03)",
            filter: "blur(40px)", pointerEvents: "none"
          }
        }),

        // Header
        m("div", {
          style: {
            marginBottom: "24px", textAlign: "center"
          }
        }, [
          m("div", {
            style: {
              fontSize: "18px", fontWeight: "800", color: "#fff",
              letterSpacing: "-0.5px", marginBottom: "6px"
            }
          }, title),
          m("div", {
            style: {
              fontSize: "11px", opacity: 0.4, letterSpacing: "1px"
            }
          }, "AI ASSISTANT SELECTION")
        ]),

        // Options List
        m("div", {
          style: {
            flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px",
            padding: "4px"
          }
        }, options.map(opt => {
          return m(Box, {
            isBtn: true,
            style: {
              padding: "16px 20px",
              borderRadius: "16px",
              background: opt.color ? `${opt.color}15` : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${opt.color ? `${opt.color}30` : "rgba(255, 255, 255, 0.1)"}`,
              color: opt.color || "#fff",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: "scale(1)",
            },
            onmouseenter: (e) => {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.02)"
              e.currentTarget.style.background = opt.color ? `${opt.color}25` : "rgba(255, 255, 255, 0.08)"
            },
            onmouseleave: (e) => {
              e.currentTarget.style.transform = "none"
              e.currentTarget.style.background = opt.color ? `${opt.color}15` : "rgba(255, 255, 255, 0.05)"
            },
            onclick: () => selectOption(opt.value)
          }, [
            m("span", { style: { fontSize: "14px", fontWeight: "600" } }, opt.label),
            m.trust(iconPark.getIcon("Right", { fill: opt.color || "#666", size: "14px" }))
          ])
        })),

        // Footer
        m("div", {
          style: {
            marginTop: "20px", textAlign: "center", opacity: 0.2, fontSize: "9px"
          }
        }, "POWERED BY OWOS CORE")
      ])
    }
  }
}
