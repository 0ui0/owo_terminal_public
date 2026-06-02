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
import commonData from "./view/common/commonData.js"



import comData from "./comData/comData.js"
import ioSocket from "./comData/ioSocket.js"
import initRoute from "./init/init_routeBack.js"
import initResponsive from "./init/init_responsive.js"
import settingData from "./view/setting/settingData.js"




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

