
import data from "./chatData.js"
import Tag from "../common/tag.js"
import comData from '../../comData/comData.js'
import ioSocket from '../../comData/ioSocket.js'
import format from "../common/format.js"
import Box from "../common/box.js"
import IconTag from '../common/iconTag.js'
import Notice from "../common/notice.js"
import AutoForm from "../common/autoForm.js"
import ChatTerm from "./ChatTerm.js"
import settingData from "../setting/settingData.js"
import ChatList from "./ChatList.js"
import AgentWindow from "./AgentWindow.js"
import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"

const ReasoningBlock = () => {
  let show = false;
  return {
    view({ attrs }) {
      const { reasoning, isPreparing } = attrs;
      if (!reasoning) return null;

      let ref = null


      return m("", {
        style: {
          marginTop: "0.5rem",
          marginBottom: "0.8rem",
          background: getColor('gray_9').back + '26',
          borderRadius: "0.4rem",
          fontSize: "0.8rem",
          borderLeft: `2px solid ${getColor('gray_8').front + '1a'}`,
          color: getColor('gray_4').front,

          maxWidth: "50rem",
          overflowX: "hidden",
          position: "relative",

        },

      }, [
        m("", {
          style: {
            cursor: "pointer",
            margin: "0.6rem",
          },
          onclick: () => show = !show
        }, [
          m("span", trs("聊天/回复/深度思考", { cn: "深度思考", en: "Deep Thinking" })),

          m("span", {
            style: {
              position: "absolute",
              right: "0.5rem",
              top: "0.2rem",
              cursor: "pointer",
              zIndex: 5,

            },
            onclick: (e) => {
              e.stopPropagation();
              show = !show
            }
          }, [
            m.trust(window.iconPark.getIcon(show ? "Up" : "Down", {
              fill: getColor('gray_4').front,
              size: "1rem"
            }))
          ]),


          m("", {
            style: {
              float: "right",
              whiteSpace: show ? "wrap" : "nowrap",
              fontSize: "1rem",
              margin: "0.5rem",
              maxHeight: "10rem",
              overflowY: "auto",

            },
            onupdate(vnode) {
              if (isPreparing && vnode.dom && show) {
                vnode.dom.scrollTop = vnode.dom.scrollHeight;
              }
            }
          }, [
            show
              ? m(".article", m.trust(format(reasoning, "markdown", {})))
              : m(".article", reasoning)

          ]),
          m("", { style: { float: "clear" } }),


          show
            ? m("span", {
              style: {
                position: "absolute",
                right: "0.5rem",
                bottom: "0.2rem",
                cursor: "pointer",
                zIndex: 5,
              },
              onclick: (e) => {
                e.stopPropagation();
                show = !show
              }
            }, [
              m.trust(window.iconPark.getIcon(show ? "Down" : "Up", {
                fill: getColor('gray_4').front,
                size: "1rem"
              }))
            ])
            : null





        ]),
      ]);
    }
  };
};

let ChatItem = null
export default ChatItem = () => {
  let fullScreen = false
  let showMind = false
  let showRaw = false
  let showMore = false

  return {
    view({ attrs, children }) {
      let chat = attrs.chat

      let terms = data.xTerms[chat.tid]
      /*  if (terms) {
         terms.size ??= {
           cols:0,
           rows:0
         }
         terms.forEach((term) => {
           if (fullScreen) {
             if(terms.size.cols !== 75 || terms.size.rows !== 25){
               terms.size = {
                 cols:75,
                 rows:25
               }
               term.resize(terms.size.cols, terms.size.rows)
             }

           }
           else {
             if (chat.tid === comData.data.get()?.currentTid) {
               if(terms.size.cols !== 70|| terms.size.rows !== 10){

                 terms.size = {
                   cols:70,
                   rows:10
                 }
                 term.resize(terms.size.cols, terms.size.rows)
               }
             }
             else {
               if(terms.size.cols !== 70 || terms.size.rows !== 15){
                 terms.size = {
                   cols:70,
                   rows:10
                 }
                 term.resize(terms.size.cols, terms.size.rows)
               }
             }
           }

         })
       }
  */


      return m("", {
        id: !attrs.isChildren ? chat.uuid : "",
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          width: "100%",
          ...(/*chat.tid === comData.data.get()?.currentTid || */fullScreen ? {
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            ...(fullScreen ? {
              right: 9,
              bottom: 9,
              height: "100%",
            } : {}),
            zIndex: 10,
            alignItems: "unset"
          } : {}),
        }
      }, [

        m("", {
          style: {
            display: "flex",
            flexDirection: "column",
            borderRadius: "0.5rem 2rem 2rem 0.5rem",
            margin: "1rem",
            padding: "1rem",
            boxSizing: "border-box", // Fix typo
            boxShadow: "0.1rem 0.1rem 1rem rgba(0,0,0,0.3)",
            alignSelf: chat.group === "user" ? "flex-end" : "unset",
            background: getColor('brown_1').back + 'ee',
            color: getColor('gray_8').front + '55',

            zIndex: 1,
            //maxHeight: "30rem",
            maxWidth: "100%",
            overflow: "auto",

            ...(/*chat.tid === comData.data.get()?.currentTid || */fullScreen ? {
              maxWidth: "unset",
              maxHeight: "unset",
              width: "unset",
              height: "30rem",
              border: `0.2rem solid ${getColor('main').back}`,
              border: "unset",
              boxShadow: "unset",

              ...(fullScreen ? {
                height: "100%",
              } : {}),

            } : {}),

            ...(chat.group === "user" ? {
              borderRight: `0.4rem solid ${getColor('yellow_2').back}`,
              borderRadius: "2rem 0.5rem 0.5rem 2rem",
            } : {
              borderLeft: `0.4rem solid ${getColor('pink_1').back}`,
              borderRadius: "0.5rem 2rem 2rem 0.5rem",
              background: getColor('brown_5').back + "ee",
            }),


            ...(chat.group === "preparing" ? {
              background: getColor('blue_3').back,
              borderLeft: `0.4rem solid ${getColor('blue_2').back}`
            } : {}),


            ...(chat.group === "tip" ? {
              background: getColor('工具组成功背景'),
              borderLeft: `0.4rem solid ${getColor('工具组成功边框')}`
            } : {}),








          }
        }, [
          m("", [
            //用户名
            chat.group !== "tip"
              ? m("span", {
                style: {
                  fontWeight: "bold",
                  marginBottom: "1rem",
                  color: getColor('main').back
                }
              }, chat.name) : null,
            //call的内容
            chat.ask?.call ?
              m("", [
                (() => {
                  let _chat = null
                  const chatLists = comData.data.get().chatLists
                  if (chatLists) {
                    for (const list of chatLists) {
                      _chat = list.data.find(c => c.uuid == chat.ask.call)
                      if (_chat) break
                    }
                  }
                  if (_chat) {
                    return m(ChatItem, {
                      key: _chat.uuid,
                      chat: _chat,
                      isChildren: true
                    })
                  }
                  return null
                })()
              ]) : null,
            //quotes引用
            chat.ask?.quotes ?
              chat.ask.quotes.map((quote) => {
                return m(IconTag, {
                  iconName: "Quote",
                  ext: {
                    onclick: () => {
                      let dom = document.getElementById(quote)
                      dom.scrollIntoView({
                        behavior: "smooth"
                      })
                    }
                  }
                }, quote.slice(0, 7))
              }) : null,
            // 深度思考 (Reasoning) - 仅在非准备状态（非实时流）下显示在此处
            chat.group !== 'preparing' ? m(ReasoningBlock, { reasoning: chat.reasoning, isPreparing: false }) : null,

          ]),

          m("", {
            class: chat.group == "terminal" ? "" : "article",
            style: {
              flex: 1,
              marginBottom: "0.5rem",
              overflowWrap: "break-word",
              wordBreak: "break-all",
              whiteSpace: "wrap",
              //width:chat.group == "terminal" ? "500px" : "auto",
              //height:chat.group == "terminal" ? "500px" : "auto"
              boxSizing: "border-box",
            }
          }, [
            //正文内容
            (() => {
              switch (chat.group) {
                case "terminal":
                  return m(ChatTerm, {
                    chat: chat,
                    style: {
                      height: "15rem",
                    }
                  })

                case "childChatList":
                  // Find the specific list data
                  const childId = chat.ext?.targetSubListId;
                  const childListObj = comData.data.get().chatLists?.find(l => l.id == childId);
                  return m("", {
                    style: {
                      maxHeight: "30rem",
                      overflow: "auto",
                    }
                  }, [
                    m(ChatList, {
                      chatList: childListObj
                    })
                  ])

                case "preparing":
                  return [
                    m("", {
                      style: {
                        overflow: "hidden",
                        maxWidth: "50rem",
                      }
                    }, [
                      m(ReasoningBlock, { reasoning: chat.reasoning, isPreparing: true }),
                      m("", [
                        trs("聊天/状态/思考中", { cn: "思考中...", en: "Thinking..." }),
                        chat.content?.length > 0 ?
                          m("a", {
                            style: {
                              cursor: "pointer"
                            },
                            onclick() {
                              showMind = !showMind
                            },
                          }, `[${showMind ? trs("通用/折叠") : trs("通用/展开")}]`) : null,
                      ]),
                      m("", {
                        style: {
                          float: "right",
                          whiteSpace: showMind ? "wrap" : "nowrap",
                          fontSize: "0.8rem",
                        }
                      }, [
                        chat.content,
                      ]),
                      m("", { style: { float: "clear" } })
                    ])

                  ]

                default:
                  return [
                    chat.group === "tip"
                      ? [
                        showMore
                          ? m.trust(format((attrs.isChildren ? chat.content.slice(0, 30) + "..." : chat.content), "markdown", {}))
                          : chat.ask.title,
                        chat.ask.joi ? m("", [
                          m("", ["[joi]" + chat.ask.joi]),
                        ]) : null,
                        m(Tag, {
                          onclick() {
                            showMore = !showMore
                          }
                        }, showMore ? trs("通用/收起") : trs("通用/详情"))
                      ]
                      : m.trust(format((attrs.isChildren ? chat.content.slice(0, 21) + "..." : chat.content), "markdown", {})),
                  ]
              }
            })(),

          ]),
          chat.tid ?
            m("", [
              m("span", { style: { fontSize: "0.8rem" } }, "tid " + chat.tid)
            ]) : null,
          m("", [
            showRaw ?
              m(Box, {
                tagName: "pre",
                isBlock: true,
                style: {
                  borderRadius: "0.5rem",
                  margin: "1rem 0"
                },
              }, [
                m(AutoForm, {
                  dataObj: { ask: chat.ask },
                  dataName: "ask"
                }),
                JSON.stringify(chat, null, "\t\t")
              ]) : null,
            m("", { style: { fontSize: "0.8rem" } }, [
              m("a", {
                style: {
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  color: getColor('pink_2').back,
                },
                onclick: (e) => {
                  e.preventDefault()
                  showRaw = !showRaw
                }
              }, "[raw]"),
              chat.uuid,
              m("br"),
              new Date(chat.timestamp).toISOString(),
              m("br"),
              chat?.ask?.totalTokens ?
                `${trs("chatItem/token消耗", { cn: "token消耗", en: "token consumption" })}
                ${trs("chatItem/输入", { cn: "输入", en: "input" })}:${chat?.ask?.promptTokens}
                ${trs("chatItem/缓存", { cn: "缓存", en: "cached" })}:${chat?.ask?.cachedTokens || 0}
                ${trs("chatItem/输出", { cn: "输出", en: "output" })}:${chat?.ask?.completionTokens}
                ${trs("chatItem/合计", { cn: "合计", en: "total" })}:${chat?.ask?.totalTokens}
                `: null
            ])
          ]),



          chat.group !== "preparing" ?
            m("", {
              style: {
                marginTop: "auto",
                paddingTop: "1rem",
                width: "100%", // Force full width
                display: "flex",
                flexWrap: "wrap",
              }
            }, [
              chat.group === "childChatList" ?
                m(Tag, {
                  styleExt: {
                    background: comData.data.get()?.targetChatListId === chat.ext?.targetSubListId ? getColor('pink_1').back : getColor('purple_2').back,
                    color: getColor('gray_9').front,
                    display: "inline-flex",
                    alignItems: "center",
                    marginLeft: "0",
                    marginRight: "0.5rem",
                  },
                  isBtn: true,
                  onclick: async () => {
                    const targetId = chat.ext?.targetSubListId;
                    await comData.data.edit(d => {
                      if (d.targetChatListId === targetId) {
                        d.targetChatListId = 0; // Unlock
                      } else {
                        d.targetChatListId = targetId;
                      }
                    })
                  },
                }, [
                  m.trust(window.iconPark.getIcon(comData.data.get()?.targetChatListId === chat.ext?.targetSubListId ? "Lock" : "Unlock", {
                    fill: getColor('gray_6').front
                  })),
                  comData.data.get()?.targetChatListId === chat.ext?.targetSubListId ? trs("聊天/队列/解锁", { cn: "解锁队列", en: "Unlock Queue" }) : trs("聊天/队列/锁定", { cn: "锁定队列", en: "Lock Queue" })
                ]) : null,

              chat.group === "childChatList" ?
                m(Tag, {
                  styleExt: {
                    background: getColor('blue_1').back,
                    color: getColor('gray_9').front,
                    display: "inline-flex",
                    alignItems: "center",
                    marginLeft: "0",
                    marginRight: "0.5rem",
                  },
                  isBtn: true,
                  onclick: () => {
                    const targetId = chat.ext?.targetSubListId;
                    const name = chat.ext?.agentName || trs("智能体窗口/标题", { cn: `智能体 ${targetId}`, en: `Agent ${targetId}` });
                    Notice.launch({
                      sign: "agent_" + targetId,
                      tip: "🤖 " + name,
                      width: 600,
                      height: 800,
                      content: AgentWindow({ listId: targetId, agentName: name }),
                    })
                  },
                }, [
                  m.trust(window.iconPark.getIcon("Browser", {
                    fill: getColor('gray_6').front
                  })),
                  trs("聊天/窗口/按钮", { cn: "窗口", en: "Window" })
                ]) : null,

              m(Tag, {
                styleExt: {
                  background: getColor('purple_2').back,
                  color: getColor('purple_2').front,
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                },
                isBtn: true,
                onclick: async () => {
                  Notice.launch({
                    tip: trs("聊天/撤销/提示标题", { cn: "是否撤销", en: "Undo Check" }),
                    msg: trs("聊天/撤销/提示内容", { cn: "是否撤销本条消息?（若为提问消息本条消息将重新加入到输入框）", en: "Undo this message? (User questions will return to the input box)" }),
                    async confirm() {

                      await settingData.fnCall("undoChat", [chat.uuid])

                      if (chat.group === "user") {
                        data.inputText += chat.content
                        await comData.data.edit((_data) => {
                          _data.inputText = data.inputText
                        })
                      }
                    }

                  })

                },
              }, [
                m.trust(window.iconPark.getIcon("Undo", {
                  fill: getColor('purple_2').front
                })),
                trs("聊天界面/词汇/撤销")
              ]),
              m(Tag, {
                styleExt: {
                  background: getColor('purple_2').back,
                  color: getColor('purple_2').front,
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                  display: attrs.isChildren ? "none" : "inline-flex"
                },
                isBtn: true,
                onclick: async () => {
                  Notice.launch({
                    tip: trs("聊天/撤到此处/提示标题", { cn: "是否撤到本条？", en: "Undo to here?" }),
                    msg: trs("聊天/撤到此处/提示内容", { cn: "是否撤销到本条消息？（这将清空包括本条和本条以后的所有消息，若为提问消息本条消息将重新加入到输入框）", en: "Undo all messages from this point? (This clears everything after, and returns user questions to input)" }),
                    async confirm() {

                      await settingData.fnCall("undoToChat", [chat.uuid])

                      if (chat.group === "user") {
                        data.inputText += chat.content
                        const listId = chat.chatListId || 0
                        data.attachmentsMap[listId] = chat.attachments || []
                        await comData.data.edit((_data) => {
                          _data.inputText = data.inputText
                        })
                      }
                    }
                  })

                },
              }, [
                m.trust(window.iconPark.getIcon("Return", {
                  fill: getColor('purple_2').front
                })),
                trs("聊天/撤到此处/按钮", { cn: "撤到本条", en: "Undo to here" })
              ]),

              m(Tag, {
                styleExt: {
                  background: getColor('purple_2').back,
                  color: getColor('purple_2').front,
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                  display: attrs.isChildren ? "none" : "inline-flex"
                },
                isBtn: true,
                onclick: async () => {
                  Notice.launch({
                    tip: trs("聊天/清除之前/提示标题", { cn: "是否清除本条之前所有消息？", en: "Clear all before this?" }),
                    msg: trs("聊天/清除之前/提示内容", { cn: "是否清除本条之前所有消息（不包括本条消息）？", en: "Clear all messages before this one (not including this message)?" }),
                    async confirm() {
                      await settingData.fnCall("clearBeforeChat", [chat.uuid])
                    }
                  })
                }
              }, trs("聊天/清除之前/按钮", { cn: "清除本条之前", en: "Clear before" })),


              m(Tag, {
                styleExt: {
                  background: getColor('yellow_1').back,
                  color: getColor('yellow_1').front,
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                },
                isBtn: true,
                onclick: async () => {
                  await comData.data.edit((data) => {
                    data.call = {
                      ...chat
                    }
                  })


                },
              }, [
                m.trust(window.iconPark.getIcon("Message", {
                  fill: getColor('yellow_1').front
                })),
                trs("聊天界面/词汇/回复")
              ]),

              m(Tag, {
                styleExt: {
                  background: getColor('yellow_1').back,
                  color: getColor('yellow_1').front,
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                },
                isBtn: true,
                onclick: async () => {
                  await comData.data.edit((data) => {
                    data.quotes = data.quotes.filter((quote2) => { return quote2.uuid !== chat.uuid })
                    data.quotes.push({
                      ...chat
                    })
                  })
                },
              }, [
                m.trust(window.iconPark.getIcon("Quote", {
                  fill: getColor('yellow_1').front
                })),
                trs("聊天界面/词汇/引用")
              ]),

              attrs.isChildren ?
                m(IconTag, {
                  iconName: "Back",
                  ext: {
                    onclick: () => {
                      let dom = document.getElementById(chat.uuid)
                      dom.scrollIntoView({
                        behavior: "smooth"
                      })
                    }
                  }

                }, trs("聊天/跳转/按钮", { cn: "转到", en: "Go to" })) : null,

              chat.tid
                ? m(IconTag, {
                  iconName: "Pin",
                  ext: {
                    onclick: async () => {
                      await comData.data.edit(data => {
                        if (data.currentTid === chat.tid) {
                          data.currentTid = ""
                        }
                        else {
                          data.currentTid = chat.tid
                        }
                      })
                    }
                  }

                }, [
                  comData.data.get()?.currentTid === chat.tid ?
                    trs("聊天/悬挂/取消", { cn: "取消悬挂", en: "Unpin" }) :
                    trs("聊天/悬挂/悬挂", { cn: "悬挂", en: "Pin" })

                ])
                : null,

              chat.tid
                ? m(IconTag, {
                  iconName: "Browser",
                  ext: {
                    onclick: async () => {
                      Notice.launch({
                        tip: trs("聊天/终端/提示", { cn: "终端：", en: "Terminal: " }) + chat.tid,
                        sign: chat.tid,
                        content: {
                          view() {
                            return m(ChatTerm, {
                              chat
                            })
                          }
                        }
                      })
                    }
                  }

                }, [
                  trs("聊天/窗口/按钮", { cn: "窗口", en: "Window" })
                ])
                : null,

              m(Tag, {
                styleExt: {
                  background: getColor('main').back,
                  color: getColor('main').front,
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                  display: chat.group === "terminal" ? "inline-flex" : "none",
                },
                isBtn: true,
                onclick: async () => {
                  fullScreen = !fullScreen
                  if (fullScreen) {

                    await comData.data.edit((data) => {
                      data.call = {
                        ...chat
                      }
                      delete data.call.xTerm
                    })

                    //data.xTerms[chat.tid].resize(75,25)
                    //chat.xTerm.FitAddon.fit()
                  } else {
                    //data.xTerms[chat.tid].resize(75,15)
                    //chat.xTerm.FitAddon.fit()
                  }

                }
              }, [
                fullScreen ?
                  m.trust(window.iconPark.getIcon("OffScreenOne", {
                    fill: getColor('gray_6').front
                  }))
                  : m.trust(window.iconPark.getIcon("FullScreenOne", {
                    fill: getColor('gray_6').front
                  })),
                fullScreen ? trs("通用/收起") : trs("通用/全屏")
              ]),


            ]) : null



        ])


      ])
    }
  }
}