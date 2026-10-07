import mithril from "/@npm/mithril.js"
window.m = mithril
window.Mob = false

import Chat from "./view/chat/Chat.js"
import Layout from "./view/layout/Layout.js"
import Browser from "./view/browser/Browser.js"
import TitleBar from "./view/common/TitleBar.js"

import iconPark_ from "./view/common/iconPark.js"
import Nav from "./view/common/nav.js"
import Notice from "./view/common/notice.js"
import commonData from "./view/common/commonData.js"



import comData from "./comData/comData.js"
import ioSocket from "./comData/ioSocket.js"
import initRoute from "./init/init_routeBack.js"
import initResponsive from "./init/init_responsive.js"
import settingData from "./view/setting/settingData.js"
import initShortcut from "./init/init_shortcut.js"


window.Notice = Notice

// 💡 多视口重绘代理：主窗口统一联动子窗口重绘，解决内嵌组件词法作用域刷新丢失问题
/* if (!window.opener) {
  const originRedraw = m.redraw
  m.redraw = function () {
    originRedraw()
    try {
      if (Notice?.data?.dataArr) {
        Notice.data.dataArr.forEach(tab => {
          try {
            const childWin = tab._winConfig?.childWin
            if (childWin && !childWin.closed) {
              childWin.m?.redraw()
            }
          } catch (childErr) {
            console.warn("[Notice] 联动子窗口重绘异常:", childErr)
          }
        })
      }
    } catch (err) {
      console.warn("[Notice] 广播重绘异常:", err)
    }
  }
  m.redraw.sync = originRedraw.sync
} */




;(async () => {
  try {
    initRoute()
    initResponsive()
    if (window.opener) {
      document.documentElement.style.fontSize = window.opener.document.documentElement.style.fontSize
    }
    initShortcut()
    iconPark_.init()
    //注意先后，ioSocket引入了comData，要先初始化
    await comData.init()
    if (!window.opener) {
      ioSocket.init()
    }

    // 初始化 i18n 并从后端加载字典
    const { init: i18nInit } = await import("./view/common/i18n.js")
    await i18nInit()
    //同步共同数据到服务端

    try {
      await settingData.options?.pull()
    } catch (err) {
      console.warn("拉取配置失败，将使用本地默认兜底配置：", err)
      // 为静态展示注入默认的 option 兜底，防止视频立绘和经典蓝白主题失效
      settingData.options.data = [
        { key: "global_themeColor", value: 2 },
        { key: "global_actorSwitch", value: 1 },
        { key: "global_language", value: "cn" }
      ]
    }
    let themeColor = await settingData.options.get("global_themeColor")
    if (themeColor === undefined) {
      themeColor = 2 // 静态预览环境默认使用经典蓝白主题
    }
    commonData.themeColor = themeColor


    let Run = function () {
      return {
        oncreate({ attrs }) {
          Notice.launch({
            tip: "宅喵终端",
            isWindow: true,
            titleBar: TitleBar,
            hideBtn: 2,
            useMaximize: true,
            content() {
              return {
                view() {
                  return m(Layout, [
                    m(attrs.content, attrs.noticeConfig?.contentAttrs)
                  ])
                }
              }
            },
            ...attrs.noticeConfig,
          })
        },
        view({ attrs, children }) {
          return [
            m(Notice),
            // 导航栏必须与 Notice 层「平级」渲染：
            // Notice 容器固定为 zIndex:999999，而主窗口 .window-box 是 position:fixed + zIndex:0（自成层叠上下文），
            // 导航栏若留在窗口内部，无论 z-index 调多高都压不过 Notice。
            attrs.showNav ? m(Nav) : null,
          ]
        }
      }
    }




    let Win = function () {
      return {
        oncreate() {
          const winId = m.route.param("winId")
          const tabs = window.opener.Notice.data.dataArr.filter((tab)=>{
            return tab._winConfig.id === winId
          })

          tabs.forEach(tab => {
            if(!tab.__initChildWin){
              tab.__initChildWin = true

              const saveContent = tab.content
              tab.content = function(){
                return {
                  view() {
                    return m(Layout, [
                      m(saveContent, { ...tab.contentAttrs })
                    ])
                  }
                }
              }
            }
            Notice.launch(tab)
          })
        },
        view({ attrs, children }) {
          return [
            m(Notice),
            m(Nav)
            // 导航栏必须与 Notice 层「平级」渲染：
            // Notice 容器固定为 zIndex:999999，而主窗口 .window-box 是 position:fixed + zIndex:0（自成层叠上下文），
            // 导航栏若留在窗口内部，无论 z-index 调多高都压不过 Notice。
          ]
        }
      }
    }



    // 挂载组件到DOM元素
    const appEl = document.getElementById('app');

    m.route(appEl, "/chat", {
      "/chat": {
        render(v) {
          return [
            m(Run, {
              content: Chat,
              showNav: true,
              noticeConfig: {
                isMain: true,
              }
            })
          ]
        }
      },
      "/browser": {
        render(v) {
          return [
            m(Run, {
              content: Browser,
              showNav:false,
              noticeConfig:{
                title:"浏览器（废弃）"
              }
            })

          ]
        }
      },
      "/window":{
        render(v){
          return [
            m(Win)
          ]
        }
      }

    })



  }
  catch (err) {
    throw err
  }
})();

