import Notice from "../common/notice.js"
import settingData from "../setting/settingData.js"
import { trs } from "../common/i18n.js"
import getAppIconUrl from "../common/getAppIconUrl.js"
import getColor from "../common/getColor.js"

export default {
  oninit(vnode) {
    vnode.state.appDefs = []
    vnode.state.loading = true
    // 获取 App 类型列表
    settingData.fnCall("appGetTypes").then(result => {
      vnode.state.appDefs = result.data || []
      vnode.state.loading = false
      m.redraw()
    })
  },

  view(vnode) {
    return m("", {
      style: {
        display: "flow-root",
        padding: "2rem",
        boxSizing: "border-box",
        minWidth: "31rem"
      }
    }, [
      vnode.state.loading
        ? m("", { style: { textAlign: "center", margin: "2rem", color: getColor("gray_4").front } }, trs("系统/状态/加载中", { cn: "加载中...", en: "Loading..." }))
        : vnode.state.appDefs.length === 0
          ? m("", { style: { textAlign: "center", margin: "2rem", color: getColor("gray_4").front } }, trs("应用/无应用", { cn: "暂无可用应用", en: "No apps available" }))
          : m("", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))",
              gap: "1.2rem"
            }
          }, vnode.state.appDefs.map(app =>
            m("", {
              key: app.id,
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                aspectRatio: "1 / 1",
                gap: "0.8rem",
                borderRadius: "1.2rem",
                background: getColor("gray_2").back,
                color: getColor("gray_6").front,
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s"
              },
              onmouseover(e) { 
                e.currentTarget.style.background = getColor("gray_3").back
                e.currentTarget.style.color = getColor("gray_3").front
              },
              onmouseout(e) { 
                e.currentTarget.style.background = getColor("gray_2").back
                e.currentTarget.style.color = getColor("gray_6").front
              },
              onclick() {
                // 启动 App
                settingData.fnCall("appLaunch", [app.id])
              }
            }, [
              m("", {
                style: {
                  width: "4.2rem",
                  height: "4.2rem",
                  borderRadius: "1rem",
                  overflow: "hidden",
                  boxShadow: "0 0.4rem 1rem rgba(0,0,0,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: getColor("gray_1").back,
                  flexShrink: 0
                }
              }, [
                m("img", {
                  src: getAppIconUrl(app.id, app.icon),
                  onerror: (e) => { e.target.src = "/statics/navbar/program.svg" },
                  style: { width: "100%", height: "100%", objectFit: "cover" }
                })
              ]),
              m("span", {
                style: {
                  fontSize: "1.1rem",
                  textAlign: "center",
                  padding: "0 0.8rem",
                  lineHeight: "1.2",
                  display: "-webkit-box",
                  "-webkit-line-clamp": "2",
                  "-webkit-box-orient": "vertical",
                  overflow: "hidden"
                }
              }, app.name)
            ])
          ))
    ])
  }
}
