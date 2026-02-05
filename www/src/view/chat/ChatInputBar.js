import data from "./chatData.js"
import Tag from "../common/tag.js"
import Box from "../common/box.js"
import IconTag from "../common/iconTag.js"
import Notice from "../common/notice.js"
import Setting from "../setting/setting.js"
import settingData from "../setting/settingData.js"
import comData from "../../comData/comData.js"
import ioSocket from "../../comData/ioSocket.js"
import Browser from "../browser/Browser.js"
import DesktopMini from "../desktopMini/desktopMini.js"
import { trs } from "../common/i18n.js"

export default () => {
  const submitFn = async (e) => {
    e.preventDefault()
    data.preparing = true

    // Retrieve routing context
    const targetChatListId = comData.data.get()?.targetChatListId || 0;

    await comData.data.edit((data_) => {
      data_.inputText = data.inputText
    })

    // Send with routing info
    ioSocket.socket.emit("chat", {
      chatListId: targetChatListId
    })

    await comData.data.edit((data) => { data.inputText = "" })
    data.inputText = ""

  }

  let showAiList = false
  let documentClickFn = null



  return {
    async oninit() {
      try {
        await settingData.options.pull()
      }
      catch (err) {
        throw err
      }
    },
    view() {
      return m("", {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      }, [
        m("", {
          style: {
            display: "flex",
            marginBottom: "0.5rem",
            flexWrap: "wrap",
            gap: "0.5rem 0"
          }
        }, [

          m(IconTag, {
            iconName: "Terminal",
            bgColor: comData.data.get()?.sendMode === "terminal" ? "#7c5d01" : "#755d5c",
            styleExt: {
              marginRight: 0,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            },
            ext: {
              onclick: async () => {
                /* if(!data.inputText.match(/^> /g) && !data.currentTalk){
                  data.inputText = "> "+data.inputText
                } */
                await comData.data.edit((data) => data.sendMode = "terminal")
                data.inputDom.focus()
              }
            }
          }, trs("输入栏/按钮/终端", { cn: "终端", en: "Terminal" })),

          m(IconTag, {
            bgColor: comData.data.get()?.sendMode === "agent" ? "#7c5d01" : "#755d5c",
            iconName: "RobotOne",
            styleExt: {
              position: "relative",
              marginLeft: 0,
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
            },
            ext: {
              onclick: (e) => {
                e.stopPropagation()
                showAiList = !showAiList
                if (showAiList) {
                  document.addEventListener("click", documentClickFn = () => {
                    showAiList = false
                    m.redraw()
                    document.removeEventListener("click", documentClickFn)
                  })
                }
              }
            },

          }, [
            m("span", { style: { marginRight: "0.2rem" } }, [
              comData.data.get()?.currentModel || "ai"
            ]),
            m.trust(window.iconPark.getIcon("Down")),

            showAiList ? m("", {
              style: {
                position: "absolute",
                top: "1.5rem",
                right: "-0.5rem",
                background: "#47464f",
                color: "#999",
                padding: "0.2rem 1rem",
                borderRadius: "0.5rem",
                display: "flex",
                flexDirection: "column"
              }
            }, [
              settingData.options.get("ai_aiList")?.filter(m => m.switch).map((model) => {
                return m(Tag, {
                  isBtn: true,
                  ext: {
                    onclick: async (e) => {
                      e.stopPropagation()

                      try {
                        let res = await settingData.fnCall("switchModel", [model.name])
                        if (!res.ok) {
                          Notice.launch({
                            msg: res.msg
                          })
                        }
                      } catch (err) {
                        console.error(err)
                      }

                      showAiList = false
                      data.inputDom.focus()

                    },
                  },
                  styleExt: {
                    minWidth: "10rem",
                    padding: 0,
                    margin: 0,
                    background: "transparent",
                    color: "#999",
                    borderBottom: "0.2rem solid #755d5c",
                    borderRadius: "0"
                  }
                }, model.name.slice(0, 10))
              }),

            ]) : null,

          ]),

          m(IconTag, {
            iconName: "Setting",
            bgColor: "#636363",
            fgColor: "#333",
            ext: {
              onclick: () => {
                Notice.launch({
                  tip: trs("输入栏/提示/设置中心", { cn: "设置中心", en: "Settings" }),
                  content: Setting,
                })
              }
            }

          }, trs("输入栏/按钮/设置", { cn: "设置", en: "Settings" })),



          m(Tag, {
            isBtn: true,
            styleExt: {
              marginLeft: 0,
            },
            ext: {
              onclick: async () => {
                await comData.data.edit((data) => {
                  if (data.toolsMode === 1) {
                    data.toolsMode = 2
                  }
                  else if (data.toolsMode === 2) {
                    data.toolsMode = 3
                  }
                  else if (data.toolsMode === 3) {
                    data.toolsMode = 1
                  }
                  console.log(data)
                })
              }
            }

          }, [
            comData.data.get()?.toolsMode === 1
              ? trs("输入栏/模式/提示词", { cn: "当前：提示词模式", en: "Mode: Prompt" }) : null,
            comData.data.get()?.toolsMode === 2
              ? trs("输入栏/模式/标准工具", { cn: "当前：标准工具模式", en: "Mode: Standard" }) : null,
            comData.data.get()?.toolsMode === 3
              ? trs("输入栏/模式/宅喵工具", { cn: "当前：宅喵工具模式", en: "Mode: OwO Tools" }) : null
          ]),

          m(IconTag, {
            iconName: "Help",
            bgColor: "#636363",
            fgColor: "#333",
            styleExt: {
              marginLeft: 0,
            },
            ext: {
              onclick: async () => {
                Notice.launch({
                  content: {
                    view() {
                      return m(Box, {
                        style: {
                          overflowWrap: "break-word",
                          wordBreak: "break-all",
                          whiteSpace: "wrap",
                        }
                      }, m.trust(trs("输入栏/帮助/模式说明", {
                        cn: `
                        <b>工具调用模式说明</b>
                        <br><br>
                        <b>1. 提示词模式</b>：所有工具说明以提示词形式发送给 AI，AI 自行决定是否调用工具。
                        适合简单对话场景，响应速度快，但 JSON 格式化可能不稳定。
                        <br><br>
                        <b>2. 标准工具模式</b>：使用 OpenAI 兼容的标准 Tool Calling 接口。
                        AI 会正确解析工具定义并返回结构化的工具调用请求，JSON 格式稳定可靠。
                        <br><br>
                        <b>3. 宅喵工具模式</b>：使用宅喵终端自研的工具调用协议。
                        支持更灵活的工具链和嵌套调用，适合复杂多步骤任务。
                        `,
                        en: `
                        <b>Tool Mode Guide</b>
                        <br><br>
                        <b>1. Prompt Mode</b>: Tool descriptions are sent as prompts. AI decides whether to call tools.
                        Best for simple chats. Fast but JSON formatting may be unstable.
                        <br><br>
                        <b>2. Standard Tools</b>: Uses OpenAI-compatible Tool Calling API.
                        AI parses tool definitions and returns structured calls. Reliable JSON output.
                        <br><br>
                        <b>3. OwO Tools</b>: Uses OwO Terminal's custom tool protocol.
                        Supports flexible tool chains and nested calls for complex multi-step tasks.
                        `
                      }).trim()))
                    }
                  }
                })
              }
            }

          }, ""),



          //回复
          comData.data.get()?.call ?
            m(IconTag, {
              bgColor: "#7b5d00",
              iconName: "Message",
              ext: {
                onclick: async () => {
                  //清除当前锁定回复
                  await comData.data.edit((data) => {
                    data.call = null
                  })
                }
              },
            }, [
              trs("聊天界面/词汇/回复") + ":" + (comData.data.get().call.uuid + "").slice(0, 7)
            ]) : null,


          (() => {
            const targetId = comData.data.get()?.targetChatListId || 0;
            const targetList = comData.data.get().chatLists?.find(l => l.id === targetId);
            return targetList?.replying ?
              m(IconTag, {
                iconName: "PauseOne",
                bgColor: "#636363",
                fgColor: "#333",
                ext: {
                  onclick: async () => {

                    try {
                      let tmp = await m.request({
                        url: `${window.location.protocol}//${window.location.hostname}:9501/api/aiAsk/stop`,
                        method: "get"
                      })
                      await comData.data?.edit((data) => {
                        data.chatLists.forEach(l => {
                          l.stop = true;
                          l.replying = false;
                        });
                        data.stop = true;
                      })
                      Notice.launch({
                        msg: tmp.msg
                      })
                    }
                    catch (err) {
                      throw err
                    }
                  }
                }
              }, trs("聊天界面/词汇/暂停")) : null
          })(),

          m(IconTag, {
            iconName: "SoapBubble",
            bgColor: "#636363",
            fgColor: "#333",
            ext: {
              onclick: async () => {
                Notice.launch({
                  tip: "喵宅苑",
                  content() {
                    return {
                      view() {
                        return m("iframe", {
                          style: {
                            width: "30rem",
                            height: "53rem"
                          },
                          src: "https://iw-i.com",
                          frameborder: 0,
                          allowFullscreen: true,
                        })
                      }
                    }
                  }
                })
              }
            }
          }, trs("聊天界面/词汇/反馈")),


          m(IconTag, {
            iconName: "ApplicationMenu",
            bgColor: "#636363",
            fgColor: "#333",
            ext: {
              onclick: async () => {
                Notice.launch({
                  sign: "desktopMini",
                  tip: "迷你桌面",
                  content: DesktopMini
                })
              }
            }
          }, trs("聊天界面/词汇/应用")),

          /* m(IconTag, {
            iconName: "Planet",
            bgColor: "#636363",
            fgColor: "#333",
            ext: {
              onclick: async () => {
                Notice.launch({
                  tip: "浏览器",
                  content: Browser
                })
              }
            }
          }, "浏览器"), */




          m(IconTag, {
            iconName: "FolderOpen",
            bgColor: comData.data.get()?.customCwd ? "#7c5d01" : "#636363",
            fgColor: comData.data.get()?.customCwd ? "#eee" : "#333",
            ext: {
              onclick: async () => {
                try {
                  let res = await settingData.fnCall("appOpenDialog", [{
                    title: "选择目标工作目录",
                    properties: ["openDirectory"]
                  }])
                  if (res.ok && res.filePath) {
                    await settingData.fnCall("setCustomCwd", [res.filePath])
                  }
                } catch (err) {
                  console.error(err)
                }
              }
            }
          }, comData.data.get()?.customCwd ? (comData.data.get().customCwd.split("/").pop() || "/") : trs("聊天界面/词汇/工作目录")),

        ]),
        //引用
        comData.data.get()?.quotes > [0] ?
          m(Box, {
            style: {
              margin: "1rem 0",
              padding: 0,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "0",
              //border:"0.2rem solid #755d5c"
            }
          }, [
            comData.data.get().quotes.map((quote) => {
              return m(IconTag, {
                iconName: "Quote",
                ext: {
                  async onclick() {
                    await comData.data.edit((data) => {
                      data.quotes = data.quotes.filter((quote2) => { return quote2.uuid !== quote.uuid })
                    })
                  }
                }
              }, quote.uuid.slice(0, 7))
            })

          ]) : null,
        m("form", {
          onsubmit: (e) => e.preventDefault(),
          style: {
            display: "flex"
          }
        }, [
          m("textarea#inputText", {
            oncreate: ({ dom }) => {
              data.inputDom = dom
              dom.style.height = "auto"
              dom.style.height = dom.scrollHeight + "px"
            },
            value: data.inputText,
            placeholder: comData.data.get()?.targetChatListId ? trs("输入栏/占位符/已锁定队列", { cn: `已锁定到队列 ${comData.data.get()?.targetChatListId} ...`, en: `Locked to queue ${comData.data.get()?.targetChatListId}...` }) : trs("输入栏/占位符/输入消息", { cn: "输入消息...", en: "Type a message..." }),
            autocomplete: "off",
            oninput: async (e) => {
              data.inputText = e.target.value
              e.target.style.height = "auto"
              e.target.style.height = e.target.scrollHeight + "px"
            },
            onkeydown: (e) => {
              // 处理输入法组字状态，避免在选词时触发提交
              if (e.isComposing) return;

              if (e.key === "Enter") {
                // 如果有修饰键 (Cmd, Ctrl, Shift)，则手动插入换行
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                  e.preventDefault();
                  const dom = e.target;
                  const start = dom.selectionStart;
                  const end = dom.selectionEnd;
                  const val = dom.value;

                  data.inputText = val.substring(0, start) + "\n" + val.substring(end);

                  // 强制重新渲染并恢复光标位置
                  m.redraw();
                  setTimeout(() => {
                    dom.selectionStart = dom.selectionEnd = start + 1;
                    dom.style.height = "auto";
                    dom.style.height = dom.scrollHeight + "px";
                  }, 0);
                  return;
                }

                // 仅纯 Enter 触发发送，并拦截默认提交行为
                e.preventDefault();
                submitFn(e);
              }
            },
            onfocus: (e) => {
              e.target.style.outline = "0.1rem solid #b99493"
            },
            onblur: (e) => {
              e.target.style.outline = "none"
            },
            style: {
              width: "100%",
              flex: 1,
              minHeight: "8rem",
              maxHeight: "20rem",
              boxSizing: "border-box",
              marginRight: "1rem",
              background: comData.data.get()?.targetChatListId ? "#5e4a5e99" : "#4a443f99",
              border: "0.1rem solid #755d5c",
              color: "#eeeeee88",
              resize: "none",
              padding: "1rem",
              lineHeight: "1.5",
              fontFamily: "inherit",
              overflowY: "auto"
            }
          }),
          m("input[type=submit]", {
            value: trs("输入栏/按钮/发送", { cn: "发送", en: "Send" }),
            style: {
              padding: "1rem 2rem",
              background: "#a75e5e",
              border: "unset",
              color: "#463838",
              fontSize: "1.8rem",
              zIndex: 1,

            },
            onclick: submitFn
          }),



        ])
      ])
    }
  }
}