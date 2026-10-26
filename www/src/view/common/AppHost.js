import Box from "./box.js"
import Tag from "./tag.js"
import AutoForm from "./autoForm.js"
import FormItem from "./FormItem.js"
import ChatToolSelect from "../chat/ChatToolSelect.js"
import settingData from "../setting/settingData.js"
import format from "./format.js"
import { trs } from "./i18n.js"
import getColor from "./getColor.js"
import Menu from "./menu.js"
import sysMenu from "./sysMenu.js"
import Tip from "./tip.js"
import jsonpatch from "/@npm/fast-json-patch.js"
import { Terminal } from "/@npm/@xterm/xterm.js"
import { FitAddon } from "/@npm/@xterm/addon-fit.js"
import { v4 as uuidv4 } from "/@npm/uuid.js"
import Notice from "./notice.js"
import ioSocket from "../../comData/ioSocket.js"
import comData from "../../comData/comData.js"
import commonData from "./commonData.js"
import chatData from "../chat/chatData.js"

export default function() {
  let realComponent = null
  let errorStr = ""
  let isLoading = true

  return {
    async oninit(v) {
      const msg = v.attrs.msg
      const appId = v.attrs.appId
      const noticeConfig = v.attrs.noticeConfig

      // 在当前窗口环境下接管所有动态配置与钩子，杜绝跨窗口闭包泄漏
      if (noticeConfig && appId) {
        noticeConfig.cancel = async (dom, closeFn) => {
          try {
            await settingData.fnCall("appClose", [appId])
          } catch (e) {
            console.error("appClose失败:", e)
          }
          if (typeof closeFn === "function") closeFn()
        }
        noticeConfig.confirm = async (dom, closeFn) => {
          try {
            await settingData.fnCall("appClose", [appId])
          } catch (e) {
            console.error("appClose失败:", e)
          }
          if (typeof closeFn === "function") closeFn()
        }
        noticeConfig.onWindowUpdate = (rect) => {
          settingData.fnCall("appUpdateWindow", [appId, rect])
        }
        noticeConfig.headerButtons = [
          {
            icon: window.iconPark ? window.iconPark.getIcon("Quote", { fill: "#eee", size: "12px" }) : '"',
            color: "#5e6c79",
            onclick: () => {
              chatData.quoteAppId(appId)
              if (noticeConfig._winConfig && noticeConfig._winConfig.id) {
                Notice.minimizeWindow(noticeConfig._winConfig.id)
              }
            }
          }
        ]
      }

      if (!msg || !msg.frontendUrl) {
        errorStr = "缺少 frontendUrl 参数"
        isLoading = false
        m.redraw()
        return
      }

      try {
        const module = await import(msg.frontendUrl)
        let comp = module.default
        if (typeof comp === "function") {
          comp = comp({
            appId,
            m,
            Notice,
            ioSocket,
            comData,
            commonData,
            chatData,
            settingData,
            format,
            Box,
            Tag,
            iconPark: window.iconPark,
            getColor,
            trs,
            Terminal,
            FitAddon,
            Menu,
            sysMenu,
            Tip,
            uuid: uuidv4,
            jsonpatch,
            AutoForm,
            FormItem,
            ChatToolSelect
          })
        }
        realComponent = comp
        isLoading = false
        m.redraw()
      } catch (err) {
        console.error("AppHost 加载组件失败:", err)
        errorStr = err.message
        isLoading = false
        m.redraw()
      }
    },

    view(v) {
      if (errorStr) {
        return m(Box, {
          style: {
            padding: "1rem",
            color: getColor("red_1").front
          }
        }, `App 加载失败: ${errorStr}`)
      }
      if (isLoading || !realComponent) {
        return m(Box, {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            color: getColor("gray_4").front
          }
        }, [
          window.iconPark ? m.trust(window.iconPark.getIcon("LoadingThree", { size: "20px", class: "rotate" })) : null,
          m("span", { style: { marginLeft: "0.5rem" } }, "正在加载应用...")
        ])
      }
      return m(realComponent, v.attrs)
    }
  }
}

