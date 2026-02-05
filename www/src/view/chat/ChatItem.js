
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
            boxShadow: "0.1rem 0.1rem 1rem #333",
            alignSelf: chat.group === "user" ? "flex-end" : "unset",
            background: "#332f2cee",
            color: "#eeeeee55",

            zIndex: 1,
            //maxHeight: "30rem",
            maxWidth: "100%",
            overflow: "auto",

            ...(/*chat.tid === comData.data.get()?.currentTid || */fullScreen ? {
              maxWidth: "unset",
              maxHeight: "unset",
              width: "unset",
              height: "30rem",
              border: "0.2rem solid #755d5c",
              border: "unset",
              boxShadow: "unset",

              ...(fullScreen ? {
                height: "100%",
              } : {}),

            } : {}),

            ...(chat.group === "user" ? {
              borderRight: "0.4rem solid #7a5d00",
              borderRadius: "2rem 0.5rem 0.5rem 2rem",
            } : {
              borderLeft: "0.4rem solid #a75e5e",
              borderRadius: "0.5rem 2rem 2rem 0.5rem",
              background: "#3a3535ee"
            }),


            ...(chat.group === "preparing" ? {
              background: "#34343d",
              borderLeft: "0.4rem solid #374e79"
            } : {}),


            ...(chat.group === "tip" ? {
              background: "#343d38ff",
              borderLeft: "0.4rem solid #50815bff"
            } : {}),








          }
        }, [
          m("", [
            //用户名
            chat.group !== "tip"
              ? m("span", {
                style: {
                  fontWeight: "bold",
                  color: "#333",
                  marginBottom: "1rem",
                  color: "#755d5c"
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
                      m("", [
                        "思考中...",
                        chat.content?.length > 0 ?
                          m("a", {
                            style: {
                              cursor: "pointer"
                            },
                            onclick() {
                              showMind = !showMind
                            },
                          }, `[${showMind ? "折叠" : "展开"}]`) : null,
                      ]),
                      m("", {
                        style: {
                          float: "right",
                          whiteSpace: showMind ? "wrap" : "nowrap",
                          fontSize: "0.5rem",
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
                          ? m.trust(format((attrs.isChildren ? chat.content.slice(0, 21) + "..." : chat.content), "markdown", {}))
                          : chat.ask.title,
                        m(Tag, {
                          onclick() {
                            showMore = !showMore
                          }
                        }, showMore ? "收起" : "详情")
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
                  cursor: "pointer"
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
                `token消耗
                输入:${chat?.ask?.promptTokens}
                输出:${chat?.ask?.completionTokens}
                合计:${chat?.ask?.totalTokens}
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
                    background: comData.data.get()?.targetChatListId === chat.ext?.targetSubListId ? "#a75e5e" : "#6c607a",
                    color: "#111",
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
                    fill: "#333"
                  })),
                  comData.data.get()?.targetChatListId === chat.ext?.targetSubListId ? "解锁队列" : "锁定队列"
                ]) : null,

              m(Tag, {
                styleExt: {
                  background: "#6c607a",//#7c5d01
                  color: "#111",
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                },
                isBtn: true,
                onclick: async () => {
                  Notice.launch({
                    tip: "是否撤销",
                    msg: "是否撤销本条消息?（若为提问消息本条消息将重新加入到输入框）",
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
                  fill: "#333"
                })),
                "撤销"
              ]),
              m(Tag, {
                styleExt: {
                  background: "#6c607a",//#7c5d01
                  color: "#111",
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                  display: attrs.isChildren ? "none" : "inline-flex"
                },
                isBtn: true,
                onclick: async () => {
                  Notice.launch({
                    tip: "是否撤到本条？",
                    msg: "是否撤销到本条消息？（这将清空包括本条和本条以后的所有消息，若为提问消息本条消息将重新加入到输入框）",
                    async confirm() {

                      await settingData.fnCall("undoToChat", [chat.uuid])

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
                m.trust(window.iconPark.getIcon("Return", {
                  fill: "#333"
                })),
                "撤到本条"
              ]),

              m(Tag, {
                styleExt: {
                  background: "#6c607a",//#7c5d01
                  color: "#111",
                  display: "inline-flex",
                  alignItems: "center",
                  marginLeft: "0",
                  marginRight: "0.5rem",
                  display: attrs.isChildren ? "none" : "inline-flex"
                },
                isBtn: true,
                onclick: async () => {
                  Notice.launch({
                    tip: "是否清除本条之前所有消息？",
                    msg: "是否清除本条之前所有消息（不包括本条消息）？",
                    async confirm() {
                      await settingData.fnCall("clearBeforeChat", [chat.uuid])
                    }
                  })
                }
              }, "清除本条之前"),


              m(Tag, {
                styleExt: {
                  background: "#7c5d01",//#6c607a
                  color: "#111",
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
                  fill: "#333"
                })),
                "回复"
              ]),

              m(Tag, {
                styleExt: {
                  background: "#7c5d01",//#6c607a
                  color: "#111",
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
                  fill: "#333"
                })),
                "引用"
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

                }, "转到") : null,

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
                    "取消悬挂" :
                    "悬挂"

                ])
                : null,

              chat.tid
                ? m(IconTag, {
                  iconName: "Browser",
                  ext: {
                    onclick: async () => {
                      Notice.launch({
                        tip: "终端：" + chat.tid,
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
                  "窗口"
                ])
                : null,

              m(Tag, {
                styleExt: {
                  background: "#755d5c",
                  color: "#111",
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
                    fill: "#333"
                  }))
                  : m.trust(window.iconPark.getIcon("FullScreenOne", {
                    fill: "#333"
                  })),
                fullScreen ? "收起" : "全屏"
              ]),


            ]) : null



        ])
      ])
    }
  }
}