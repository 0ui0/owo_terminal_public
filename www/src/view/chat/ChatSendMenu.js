import m from "mithril"
import Box from "../common/box.js"
import getColor from "../common/getColor.js"
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
            gap: "1.5rem",
            padding: "1rem",
            color: getColor("gray_1").front
          }
        },
        [
          // 模式选择组
          m("", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" } }, [
            m("span", { style: { fontSize: "1.6rem", color: getColor("gray_1").front, marginLeft: "0.5rem" } }, 
              trs("输入栏/标签/发送模式", { cn: "发送模式", en: "Send Mode" })
            ),
            modeOptions.map(opt => {
              const isSelected = selectedMode === opt.value
              return m(Box, {
                key: opt.value,
                isBtn: true,
                color: isSelected ? "main" : "gray_4",
                style: {
                  borderRadius: "3rem",
                  margin: "0",
                  padding: "1rem 1.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                },
                onclick: () => {
                  selectedMode = opt.value
                  m.redraw()
                }
              }, [
                m("", { style: { display: "flex", flexDirection: "column", gap: "0.2rem", textAlign: "left" } }, [
                  m("span", opt.label),
                  m("span", { style: { fontSize: "1.2rem", opacity: 0.6 } }, opt.desc)
                ]),
                isSelected ? m.trust(window.iconPark.getIcon("CheckOne", { size: "1.8rem", fill: getColor("main").front })) : null
              ])
            })
          ]),

          // 分割线
          m("hr", { style: { border: "none", borderTop: `1px solid ${getColor("gray_4").back}`, margin: "0" } }),

          // 阶段选择组
          m("", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" } }, [
            m("span", { style: { fontSize: "1.6rem", color: getColor("gray_1").front, marginLeft: "0.5rem" } }, 
              trs("输入栏/标签/附加阶段指令", { cn: "附加阶段指令", en: "Append Stage Command" })
            ),
            m("div", {
              style: {
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem"
              }
            }, stageOptions.map(opt => {
              const isSelected = selectedStage === opt.value
              return m(Box, {
                key: opt.value,
                isBtn: true,
                color: isSelected ? "pink_1" : "gray_4",
                style: {
                  borderRadius: "3rem",
                  margin: "0",
                  padding: "0.8rem 1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center"
                },
                onclick: () => {
                  selectedStage = opt.value
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