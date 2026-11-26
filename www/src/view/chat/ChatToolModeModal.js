import m from "/@npm/mithril.js"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import IconTag from "../common/iconTag.js"
import Notice from "../common/notice.js"
import getColor from "../common/getColor.js"
import { trs } from "../common/i18n.js"
import comData from "../../comData/comData.js"
import getSize from "../common/getSize.js"
import HelpMenu from "../common/HelpMenu.js"

export default () => {
  let selectedChatListId = null

  return {
    oninit({ attrs }) {
      const chatLists = comData.data.get().chatLists
      selectedChatListId = attrs.targetChatListId !== undefined ? attrs.targetChatListId : chatLists[0]?.id
    },

    view({ attrs }) {
      const chatLists = comData.data.get().chatLists
      const targetSession = attrs.targetSession || chatLists.find(l => l.id === selectedChatListId)
      const currentToolsMode = targetSession?.toolsMode || 5
      const updateListSession = attrs.updateListSession

      const modes = [
        {
          id: 1,
          name: trs("输入栏/模式/提示词/名称", { cn: "提示词模式", en: "Prompt Mode" }),
          desc: trs("输入栏/模式/提示词/说明", { cn: "纯 JSON 文本模仿工具调用，用于兼容不支持 Function Call 的旧模型", en: "Pure JSON text simulation, for models lacking Function Call" })
        },
        {
          id: 2,
          name: trs("输入栏/模式/标准工具/名称", { cn: "标准工具模式", en: "Standard Tools" }),
          desc: trs("输入栏/模式/标准工具/说明", { cn: "原生 tool_calls 调用，不写笔记与任务，专注极速单次任务执行", en: "Native tool_calls without notes or tasks, fast execution" })
        },
        {
          id: 3,
          name: trs("输入栏/模式/宅喵工具/名称", { cn: "宅喵工具模式", en: "OwO Tools Mode" }),
          desc: trs("输入栏/模式/宅喵工具/说明", { cn: "招牌主打！强约束 JSON Schema + 记忆笔记 + 任务管理体系，复杂任务高成功率", en: "Flagship mode! Structured JSON + memory notes + task management" })
        },
        {
          id: 4,
          name: trs("输入栏/模式/原生外壳/名称", { cn: "原生外壳模式", en: "Native Wrapper" }),
          desc: trs("输入栏/模式/原生外壳/说明", { cn: "在原生工具调用上包裹 JSON Schema 输出，防止幻觉与废话输出", en: "Grafts JSON Schema onto native tool calls for strict output" })
        },
        {
          id: 5,
          name: trs("输入栏/模式/编程模式/名称", { cn: "编程模式", en: "Coding Mode" }),
          desc: trs("输入栏/模式/编程模式/说明", { cn: "Markdown + 专属扩展标签，自由倾泻代码，适合大规模流水线重构任务", en: "Markdown + extJsonConfig, fast and ideal for continuous refactoring" })
        }
      ]

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: `${getSize(3)}rem`,
            padding: `${getSize(3)}rem`,
            color: getColor("gray_1").front
          }
        },
        [
          // 目标会话选择
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: `${getSize(4)}rem`,
                    color: getColor("gray_1").front,
                    marginLeft: `${getSize(1)}rem`
                  }
                },
                trs("组件/提示/选择目标会话", { cn: "目标会话队列", en: "Target Session Queue" })
              ),
              m("select",
                {
                  value: selectedChatListId,
                  onchange: (e) => {
                    selectedChatListId = Number(e.target.value)
                  },
                  style: {
                    padding: `${getSize(2.5)}rem ${getSize(4)}rem`,
                    borderRadius: `${getSize(8)}rem`,
                    border: "none",
                    background: getColor("gray_4").back,
                    color: getColor("gray_4").front,
                    outline: "none",
                    fontSize: `${getSize(4)}rem`,
                    appearance: "none",
                    cursor: "pointer"
                  }
                },
                chatLists.map(list => m("option", { value: list.id }, `${list.name || '主会话'} (ID: ${list.id})`))
              )
            ]
          ),

          // 标题与说明问号按钮栏
          m("",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                margin: `0 ${getSize(1)}rem`
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: `${getSize(4)}rem`,
                    color: getColor("gray_1").front
                  }
                },
                trs("输入栏/标签/可用模式列表", { cn: "选择工作模式", en: "Select Work Mode" })
              ),
              m(IconTag,
                {
                  iconName: "Help",
                  bgColor: getColor("gray_4").back,
                  fgColor: getColor("gray_4").front,
                  ext: {
                    onclick: () => {
                      Notice.launch({
                        tip: trs("输入栏/模式/模式对比指南", { cn: "模式特性与详细对比", en: "Mode Comparison Guide" }),
                        content: HelpMenu
                      })
                    }
                  }
                },
                trs("输入栏/按钮/模式说明", { cn: "模式说明", en: "Help" })
              )
            ]
          ),

          // 模式列表卡片
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: `${getSize(2)}rem`
              }
            },
            modes.map(mode => {
              const isSelected = currentToolsMode === mode.id
              return m(Box,
                {
                  key: mode.id,
                  isBtn: true,
                  color: isSelected ? "main" : "gray_4",
                  style: {
                    borderRadius: `${getSize(8)}rem`,
                    margin: "0",
                    padding: `${getSize(2.5)}rem ${getSize(4)}rem`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  },
                  onclick: async () => {
                    if (updateListSession) {
                      await updateListSession(selectedChatListId, { toolsMode: mode.id })
                    }
                    m.redraw()
                  }
                },
                [
                  m("",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: `${getSize(1/2)}rem`,
                        textAlign: "left"
                      }
                    },
                    [
                      m("span",
                        {
                          style: {
                            fontSize: `${getSize(4)}rem`
                          }
                        },
                        mode.name
                      ),
                      m("span",
                        {
                          style: {
                            fontSize: `${getSize(3)}rem`,
                            opacity: 0.6
                          }
                        },
                        mode.desc
                      )
                    ]
                  ),
                  isSelected ?
                    m.trust(window.iconPark.getIcon("CheckOne", {
                      size: `${getSize(4.5)}rem`,
                      fill: getColor("main").front
                    })) : null
                ]
              )
            })
          )
        ]
      )
    }
  }
}
