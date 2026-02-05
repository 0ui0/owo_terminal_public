import getColor from "./getColor"
import commonData from "./commonData"
import NavItem from "./navItem"
import Notice from "./notice"
import { trs } from "./i18n.js"

let barWidth = 0
let contentWidth = 0
let presentItem = ""
let threeDWidth = 0

let navRotate = 20

const calcWidth = (dom) => getComputedStyle(dom).width.replace("px", "") * 1

let urlList = commonData.navList || []

export default {
  oncreate: ({ dom }) => {
    commonData.navDom = dom
  },

  onupdate: ({ dom }) => {
    //barWidth = calcWidth(dom)
  },

  view: (v) => {
    const winCount = Notice.data.dataArr ? new Set(Notice.data.dataArr.map(i => i._winConfig)).size : 0
    const fullLength = urlList.length + winCount
    const barZoomRate = fullLength > 8 ? 8 / fullLength : 1

    return m("", {
      style: {
        "user-select": "none",
        "-webkit-user-select": "none",
        position: "fixed",
        alignItems: "center",
        bottom: "0rem",
        left: "50%",
        transform: "translate(-50%,0)",
        transition: "all 0.5s ease",
        zIndex: 999,
        ...(commonData.navWinMode ? {
          width: "100%",
          paddingTop: "1rem",
          left: "0",
          transform: "unset",
          borderRadius: "0.5rem 0.5rem 0 0",
          backgroundColor: "rgba(230,230,229,0.5)",

          backgroundImage: "url(./statics/nav_bg.svg)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% auto",
          backgroundPosition: "bottom",
          "backdrop-filter": "blur(5px)",
          "-webkit-backdrop-filter": "blur(5px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          boxShadow: "0 -0.5rem 0.5rem rgba(100,100,100,0.3)",
          borderTop: "0.1rem solid rgba(10,10,10,0.3)"
        } : {})
      }
    }, [
      m("", {
        style: {
          "user-select": "none",
          "-webkit-user-select": "none",
          display: "flex",
          alignItems: "center",
          backgroundColor: "#413f4388",
          backgroundImage: "url(./statics/nav_bg.svg)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% auto",
          backgroundPosition: "bottom",
          borderRadius: "5rem",
          minWidth: Mob ? "85vw" : "auto",
          padding: "1rem 0",
          marginBottom: "1.2rem",
          "backdrop-filter": "blur(5px)",
          "-webkit-backdrop-filter": "blur(5px)",
          transition: "all ease 1s",
          boxShadow: "0 0 0.5rem rgba(100,100,100,0.3)",
          border: "0.1rem solid rgb(117, 93, 92)",
          position: "relative",
          ...(commonData.navWinMode ? {
            background: "unset",
            boxShadow: "none",
            "backdrop-filter": "unset",
            "-webkit-backdrop-filter": "unset",
            marginBottom: "0",
            border: "none"
          } : {})
        }
      }, [
        // 返回按钮
        m("", {
          style: {
            "user-select": "none",
            "-webkit-user-select": "none",
            display: "inline-flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            transition: "all 0.5s ease",
            zIndex: "1"


          }
        }, [
          m("img[src=./statics/back2.png]", {
            style: {
              "user-select": "none",
              "-webkit-user-select": "none",
              marginLeft: "1rem",
              marginRight: "1rem",
              width: `${2 * barZoomRate}rem`,
              height: "auto",
              cursor: "pointer",
              transition: "all 0.5s"
            },
            title: trs("通用/返回"),
            onmouseover: (e) => {
              e.target.style.transform = "scale(1.2)"
            },
            onmouseout: (e) => {
              e.target.style.transform = "scale(1)"
            },
            onclick: () => {
              ROUTE.back()
            }
          })
        ]),

        m("", {
          style: {
            display: "inline-flex",
            justifyContent: "space-evenly",
            alignItems: "center",
            width: "100%",
            "user-select": "none",
            "-webkit-user-select": "none",
            zIndex: "1"
          }
        }, [
          urlList.map((item, index) =>
            m(NavItem, {
              item: item,
              index: index,
              urlList: urlList,
              barZoomRate: barZoomRate
            })
          ),

          // 程序通知部分
          // 程序通知部分
          // 程序通知部分
          Notice.data.dataArr && Notice.data.dataArr.length > 0
            ? m("", {
              style: {
                display: "inline-flex",
                justifyContent: "space-evenly",
                alignItems: "center",
                borderLeft: "0.2rem solid rgba(0,0,0,0.2)"
              }
            }, [
              (() => {
                // 1. 根据 _winConfig 分组，找出每个窗口的 Active Tab
                const windows = new Map()
                Notice.data.dataArr.forEach(item => {
                  const config = item._winConfig
                  if (!windows.has(config)) {
                    windows.set(config, [])
                  }
                  windows.get(config).push(item)
                })

                return Array.from(windows.entries()).map(([config, tabs], index) => {
                  // 找到该窗口的激活 Tab
                  let activeTab = tabs.find(t => t.sign === config.activeSign)
                  if (!activeTab && tabs.length > 0) activeTab = tabs[0]

                  if (!activeTab) return null

                  // 创建程序项
                  const programItem = {
                    name: trs("聊天界面/词汇/程序"),
                    type: "program",
                    tip: activeTab.tip,
                    url: "/program_",
                    icon: "program",
                    sizeRate: 1,
                    power: 1,
                    onBar: false,
                    winId: config.id,
                    sign: activeTab.sign,
                    // 添加点击事件处理，点击任务栏图标：
                    // 1. 如果窗口当前是激活状态且未最小化 -> 最小化
                    // 2. 否则 (最小化/未激活) -> 激活/还原
                    onClick: () => {
                      const isTop = Notice.data.activeWindowId === config.id
                      if (isTop && !config.minimized) {
                        Notice.minimizeWindow(config.id)
                      } else {
                        Notice.activateWindow(config.id)
                      }
                    }
                  };

                  return m(NavItem, {
                    item: programItem,
                    index: index,
                    urlList: urlList,
                    barZoomRate: barZoomRate
                  });
                })
              })()
            ])
            : null

        ]),


      ])
    ])
  }
}