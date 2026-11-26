import m from "/@npm/mithril.js"
import Box from "../common/box.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import { trs } from "../common/i18n.js"
import comData from "../../comData/comData.js"
import chatData from "./chatData.js"

export default () => {
  let selectedMode = "readWrite"
  let selectedStage = "无附加"
  let selectedChatListId = null

  return {
    oninit({ attrs }) {
      const chatLists = comData.data.get().chatLists
      selectedChatListId = attrs.targetChatListId !== undefined ? attrs.targetChatListId : chatLists[0].id
      const targetSession = attrs.targetSession || chatLists.find(l => l.id === selectedChatListId)
      
      selectedMode = targetSession.toolAccessMode || "readWrite"
      selectedStage = targetSession.workStage || "无附加"

      const noticeConfig = attrs.noticeConfig
      if (noticeConfig) {
        noticeConfig.confirm = async () => {
          if (attrs.updateListSession) {
            try {
              const res = await attrs.updateListSession(selectedChatListId, { 
                toolAccessMode: selectedMode,
                workStage: selectedStage,
              })
              
              if (res && res.ok === false) {
                Notice.launch({ msg: res.msg, color: "pink" })
                return true // 拦截关闭
              }
              
              Notice.launch({ msg: res.msg })
            } catch (err) {
              console.error("[ChatSendMenu]", err)
              return true
            }
          }
          return undefined // 关闭窗口
        }
      }
    },
    view({ attrs }) {
      const modeOptions = chatData.getModeOptions()
      const stageOptions = chatData.getStageOptions()

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: `${getSize(4)}rem`,
            padding: `${getSize(3)}rem`,
            color: getColor("gray_1").front
          }
        },
        [
          // 模式选择组
          m("", { style: { display: "flex", flexDirection: "column", gap: `${getSize(1)}rem` } }, [
            m("span", { style: { fontSize: `${getSize(4)}rem`, color: getColor("gray_1").front, marginLeft: `${getSize(1)}rem` } }, 
              trs("输入栏/标签/发送模式", { cn: "发送模式", en: "Send Mode" })
            ),
            modeOptions.map(opt => {
              const isSelected = selectedMode === opt.value
              return m(Box, {
                key: opt.value,
                isBtn: true,
                color: isSelected ? "main" : "gray_4",
                style: {
                  borderRadius: `${getSize(8)}rem`,
                  margin: "0",
                  padding: `${getSize(3)}rem ${getSize(4)}rem`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                },
                onclick: () => {
                  selectedMode = opt.value
                  m.redraw()
                }
              }, [
                m("", { style: { display: "flex", flexDirection: "column", gap: `${getSize(0.5)}rem`, textAlign: "left" } }, [
                  m("span", opt.label),
                  m("span", { style: { fontSize: `${getSize(3)}rem`, opacity: 0.6 } }, opt.desc)
                ]),
                isSelected ? m.trust(window.iconPark.getIcon("CheckOne", { size: `${getSize(5)}rem`, fill: getColor("main").front })) : null
              ])
            })
          ]),

          // 分割线
          m("hr", { style: { border: "none", borderTop: `${getSize(0.25)}rem solid ${getColor("gray_4").back}`, margin: "0" } }),

          // 阶段选择组
          m("", { style: { display: "flex", flexDirection: "column", gap: `${getSize(1)}rem` } }, [
            m("span", { style: { fontSize: `${getSize(4)}rem`, color: getColor("gray_1").front, marginLeft: `${getSize(1)}rem` } }, 
              trs("输入栏/标签/附加阶段指令", { cn: "附加阶段指令", en: "Append Stage Command" })
            ),
            m("div", {
              style: {
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: `${getSize(1)}rem`
              }
            }, stageOptions.map(opt => {
              const isSelected = selectedStage === opt.value
              return m(Box, {
                key: opt.value,
                isBtn: true,
                color: isSelected ? "pink_1" : "gray_4",
                style: {
                  borderRadius: `${getSize(8)}rem`,
                  margin: "0",
                  padding: `${getSize(2)}rem ${getSize(3)}rem`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center"
                },
                onclick: () => {
                  selectedStage = opt.value
                  if (opt.value === "调查并讨论") {
                    selectedMode = "readOnly"
                  } else {
                    selectedMode = "readWrite"
                  }
                  m.redraw()
                }
              }, opt.label)
            }))
          ])
        ]
      )
    }
  }
}