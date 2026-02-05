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
          }, "终端"),

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
                  tip: "设置中心",
                  content: Setting,
                })
              }
            }

          }, "设置"),



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
              ? "当前：提示词模式" : null,
            comData.data.get()?.toolsMode === 2
              ? "当前：标准工具模式" : null,
            comData.data.get()?.toolsMode === 3
              ? "当前：宅喵工具模式" : null
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
                      }, m.trust(`
                        由于不同平台之间的工具调用接口存在新旧版本不统一的问题，宅喵终端的函数调用使用自己的实现
                        模式切换仅用于是否强制格式化json输出避免大量出现joi校验
                        <br><br>
                        若切换到提示词模式，所有说明都将使用提示词发送给ai（此为默认模式，同时开启format_json）
                        这种模式下ai回复的json可能存在字段错误导致joi校验失败，需要反复重试
                        <br><br>
                        若切换到标准工具模式，将尝试使用符合兼容标准的工具调用功能，强制让ai调用【发送模板】函数
                        以获取json格式化后的参数列表（只用于格式化json）
                        但是由于使用了指定工具（tool_choice），将不能再调用其它工具
                        <br><br>
                        所以函数调用相关说明和工具说明依然使用提示词，且使用宅喵终端自有的字段实现而不是Openai的标准实现
                        `.trim()))
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
              "回复:" + (comData.data.get().call.uuid + "").slice(0, 7)
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
              }, "暂停") : null
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
          }, "反馈"),


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
          }, "应用"),

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
          }, comData.data.get()?.customCwd ? (comData.data.get().customCwd.split("/").pop() || "/") : "工作目录"),

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
            placeholder: comData.data.get()?.targetChatListId ? `已锁定到队列 ${comData.data.get()?.targetChatListId} ...` : "输入消息...",
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
            value: "发送",
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