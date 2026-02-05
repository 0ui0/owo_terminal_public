import m from "mithril"
window.m = m
window.Mob = false
window.m = m
import Chat from "./view/chat/Chat.js"
import Layout from "./view/layout/Layout.js"
import Browser from "./view/browser/Browser.js"

import iconPark_ from "./view/common/iconPark.js"
import Nav from "./view/common/nav.js"
import Notice from "./view/common/notice.js"



import comData from "./comData/comData.js"
import ioSocket from "./comData/ioSocket.js"
import initRoute from "./init/init_routeBack.js"
import initResponsive from "./init/init_responsive.js"




(async () => {
  try {
    initRoute()
    initResponsive()
    iconPark_.init()
    //注意先后，ioSocket引入了comData，要先初始化
    await comData.init()
    ioSocket.init()

    // 初始化 i18n 并从后端加载字典
    const { init: i18nInit } = await import("./view/common/i18n.js")
    await i18nInit()
    //同步共同数据到服务端







    // 挂载组件到DOM元素
    const appEl = document.getElementById('app');

    m.route(appEl, "/chat", {
      "/chat": {
        render(v) {
          return [
            m(Layout, [
              m(Chat),
            ]),
          ]
        }
      },
      "/browser": {
        render(v) {
          return [
            m(Layout, [
              m(Browser),
            ]),
          ]
        }
      },

    })

  }
  catch (err) {
    throw err
  }
})();

