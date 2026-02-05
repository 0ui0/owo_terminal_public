import getColor from "./getColor"
import commonData from "./commonData"
import Notice from "./notice"

export default {
  view: ({ attrs }) => {
    const { item, index, urlList, barZoomRate } = attrs
    const navWinMode = false // 默认不启用winMode

    return m(".animated.bounceIn", {
      style: {
        "user-select": "none",
        "-webkit-user-select": "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        // 单个按钮背后的触控区域
        width: "100%",
        transition: "width 1s ease"
      },

      onbeforeremove: (v) => {
        v.dom.classList.add("bounceOut")
        return new Promise((res, rej) => {
          setTimeout(() => {
            res()
          }, 700)
        })
      },

      onmouseover: (e) => {
        if (item.type === "program") {
          return
        }
        urlList.forEach((item) => item.sizeRate = 0.8)
        if (urlList[index - 1]) urlList[index - 1].sizeRate = 1
        if (urlList[index + 1]) urlList[index + 1].sizeRate = 1
        if (urlList[index - 2]) urlList[index - 2].sizeRate = 0.9
        if (urlList[index + 2]) urlList[index + 2].sizeRate = 0.9
        urlList[index].sizeRate = 1.15
      },

      onmouseout: (e) => {
        if (item.type === "program") {
          return
        }
        urlList.forEach((item) => item.sizeRate = 1)
      }
    }, [
      m("", {
        style: {
          display: "inline-block",
          position: "relative",
          userSelect: "none",
          "user-select": "none",
          "-webkit-user-select": "none",
          margin: !Mob ? `0 ${2 ** barZoomRate}rem` : ""
        }
      }, [
        m(`img[src=./statics/navbar/${item.icon}.svg]`, {
          title: item.name,
          style: {
            "user-select": "none",
            "-webkit-user-select": "none",
            display: "relative",
            margin: "0 0.5rem",
            width: Mob
              ? `${(3.5 * item.sizeRate * barZoomRate).toFixed(2)}rem`
              : `${(3 * item.sizeRate * barZoomRate).toFixed(2)}rem`,
            height: Mob
              ? `${(3.5 * item.sizeRate * barZoomRate).toFixed(2)}rem`
              : `${(3 * item.sizeRate * barZoomRate).toFixed(2)}rem`,
            willChange: "width,height,transform",
            transform: "translateZ(0)",
            cursor: "pointer",
            transition: "all 0.5s"
          },
          onclick: (e) => {
            // 优先使用传入的 onClick 回调 (支持自定义逻辑，如 minimize toggle)
            if (item.onClick) {
              item.onClick(e)
              return
            }

            // 如果是程序类型项目，执行默认激活
            if (item.type === "program") {
              if (item.winId) {
                Notice.activateWindow(item.winId)
              }
            } else {
              ROUTE.set(item.url);
            }
          }
        })
      ]),

      // 指示条
      m("", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          //background: "red",
          display: "inline-flex",
          justifyContent: "center",
          overflow: "visible",
          pointerEvents: "none"
        }
      }, [
        m("", {
          style: {
            "user-select": "none",
            "-webkit-user-select": "none",
            position: "absolute",
            minWidth: "max-content",
            top: "-3.5rem",
            height: item.type === "program" || m.route.get().match(item.url) ? "2rem" : "0",
            width: item.type === "program" || m.route.get().match(item.url) ? (item.type === "program" ? "auto" : "4rem") : "0",
            background: "rgba(0,0,0,0.5)",
            borderRadius: "1rem",
            transition: "all 0.8s",
            textAlign: "center",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transform: "scale(0.8)",
            "backdrop-filter": "blur(5px)",
            "-webkit-backdrop-filter": "blur(5px)"
          }
        }, [
          item.type === "program" || m.route.get().match(item.url) ?
            m("span", {
              oninit: (e) => {
                setTimeout(() => {
                  e.dom.style.opacity = 1
                }, 200)
              },
              style: {
                "user-select": "none",
                "-webkit-user-select": "none",
                opacity: 0,
                transition: "all 0.8s",
                fontSize: "1rem",
                lineHeight: "2rem",
                color: "#ccc",
                margin: "0 0.2rem"
              }
            }, [
              item.type === "program" ? (item.tip || "程序") : item.name
            ]) : null
        ])
      ])
    ])
  }
}