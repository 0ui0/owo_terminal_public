// 桌面入口组件 - App 网格列表
import Notice from "../common/notice.js"
import settingData from "../setting/settingData.js"
import { trs } from "../common/i18n.js"

export default {
  oninit(vnode) {
    vnode.state.appDefs = []
    vnode.state.loading = true
    // 获取 App 类型列表
    settingData.fnCall("appGetTypes").then(result => {
      vnode.state.appDefs = result || []
      vnode.state.loading = false
      m.redraw()
    })
  },

  view(vnode) {
    return m("div", {
      style: {
        padding: "20px",
        minWidth: "300px",
        maxWidth: "500px"
      }
    }, [
      m("div", { style: { fontSize: "18px", fontWeight: "bold", marginBottom: "20px", textAlign: "center" } }, trs("聊天界面/词汇/应用")),

      vnode.state.loading
        ? m("div", { style: { textAlign: "center", padding: "20px" } }, trs("系统/状态/加载中", { cn: "加载中...", en: "Loading..." }))
        : vnode.state.appDefs.length === 0
          ? m("div", { style: { textAlign: "center", padding: "20px", color: "#888" } }, trs("应用/无应用", { cn: "暂无可用应用", en: "No apps available" }))
          : m("div", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "15px"
            }
          }, vnode.state.appDefs.map(app =>
            m("div", {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "15px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.1)",
                cursor: "pointer",
                transition: "all 0.2s"
              },
              onmouseover(e) { e.currentTarget.style.background = "rgba(255,255,255,0.2)" },
              onmouseout(e) { e.currentTarget.style.background = "rgba(255,255,255,0.1)" },
              onclick() {
                // 关闭桌面窗口
                // 关闭桌面窗口
                //if (vnode.attrs.delete) vnode.attrs.delete()
                // 启动 App
                settingData.fnCall("appLaunch", [app.id])
              }
            }, [
              m("div", { style: { fontSize: "32px", marginBottom: "8px" } }, app.icon || "📦"),
              m("div", { style: { fontSize: "12px", textAlign: "center" } }, app.name)
            ])
          ))
    ])
  }
}
