
import data from "./chatData.js"
import debugHistory from "../../historyPanel/historyPanelData.js"
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
import getSize from "../common/getSize.js"
import getBlurBg from "../common/getBlurBg.js"
import Avatar from "./Avatar.js"
import ChatiTmRestoreDialog from "./ChatiTmRestoreDialog.js"
import Row from "../../class/row.js"
import sysMenu from "../common/sysMenu.js"

const ReasoningBlock = () => {
  let show = true; //默认展开深度思考
  let scrollThrottleTimer = null;
  let isAtBottom = true;
  return {
    view({ attrs }) {
      const { reasoning, isPreparing } = attrs;
      if (!reasoning) return null;

      let ref = null


      return m("", {
        //深度思考框
        style: {
          marginTop: `${getSize(3)}rem`,
          marginBottom: `${getSize(3)}rem`,
          background: getColor('gray_9').back + '26',

          borderRadius: `${getSize(8)}rem`,
          borderLeft: `${getSize(0.5)}rem solid ${getColor('gray_8').front + '1a'}`,
          color: getColor('gray_4').front,

          maxWidth: `${getSize(175)}rem`,
          overflowX: "hidden",
          position: "relative",

        },

      }, [
        m("", {
          style: {
            cursor: "pointer",
            margin: `${getSize(3)}rem ${getSize(3)}rem 0`,
          },
          onclick: () => show = !show
        }, [
          m("span", trs("聊天/回复/深度思考", { cn: "深度思考", en: "Deep Thinking" })),

          m("span", {
            style: {
              position: "absolute",
              right: `${getSize(2)}rem`,
              top: `${getSize(2)}rem`,
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
              size: `${getSize(3)}rem`
            }))
          ]),


          m("", {
            // 外层负责留白与裁切：overflow hidden 既包裹内部浮动，又把向左溢出的旧内容裁掉
            style: {
              overflow: "hidden",
              margin: `${getSize(2)}rem ${getSize(3)}rem ${getSize(3)}rem`
            }
          }, [
            m("", {
              style: {
                // 收缩态靠 float 收缩成内容宽度，流式输出才有单行打字机效果；展开后取消浮动，正文占满整行左对齐
                float: show ? "none" : "right",
                whiteSpace: show ? "normal" : "nowrap",
                fontSize: `${getSize(4)}rem`,
                maxHeight: `${getSize(25)}rem`,
                overflowY: "auto",
              },
            onscroll(e) {
              const dom = e.target;
              isAtBottom = dom.scrollHeight <= dom.clientHeight
                ? true
                : dom.scrollHeight - dom.scrollTop - dom.clientHeight <= 30;
            },
            onupdate({ dom }) {
              if (isPreparing) {
                if (!scrollThrottleTimer) {
                  scrollThrottleTimer = setTimeout(() => {
                    scrollThrottleTimer = null;
                    if (isAtBottom) {
                      dom.scrollTop = dom.scrollHeight;
                    }
                  }, 200);
                }
              }
            }
          }, [
            show
              ? m(".article", m.trust(format(reasoning, "markdown", { noCache: isPreparing, isThinking: isPreparing })))
              : m(".article", reasoning ? (reasoning.length > 20000 ? "..." + reasoning.slice(-20000) : reasoning) : "")

            ])
          ]),
          m("", { style: { float: "clear" } }),


          show
            ? m("span", {
              style: {
                position: "absolute",
                right: `${getSize(2)}rem`,
                bottom: `${getSize(2)}rem`,
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
                size: `${getSize(3)}rem`
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
  let showMind = true
  // 子会话(childChatList)预览的展开状态：与 ChatNote 的 expandedStates 同款 —— 组件实例闭包 + 唯一键存储
  let expandedChildLists = {}
  let showRaw = false
  let showMore = false
  let _chat = null
  let contentScrollTimer = null
  let isContentAtBottom = true

  return {
    async oninit({ attrs }) {
      //回复时候前端加载被回复的消息
      const callUuid = attrs.chat?.ask?.call || attrs.chat?.ask?.content?.call
      if (callUuid) {
        try {
          const res = await m.request({
            method: "GET",
            url: "/api/chatMessages/get",
            params: { uuid: callUuid }
          })
          if (res?.ok && res.data?.[0]) {
            _chat = new Row(res.data[0], {
              apiName: "chatMessages",
              idName: "id",
              parent: data.chatLists[attrs.chat.chatListId]
            })
            m.redraw()
          }
        } catch (e) {
          console.error("[ChatItem] fetch call chat failed:", e)
        }
      }
    },
    view({ attrs, children }) {
      let chat = attrs.chat

      if (chat.group === "tmDiff") {
        const snapshotUuid = chat.ext?.snapshotUuid || chat.uuid
        return m(
          "",
          {
            id: !attrs.isChildren ? chat.uuid : "",
            style: {
              display: "flex",
              alignItems: "center",
              gap: `${getSize(3)}rem`,
              padding: `${getSize(2)}rem ${getSize(6)}rem`
            }
          },
          [
            m(
              "",
              {
                style: {
                  width: `${getSize(10)}rem`,
                  height: `${getSize(0.25)}rem`,
                  background: `linear-gradient(90deg, transparent, ${getColor("main").back})`,
                  flexShrink: 0
                }
              }
            ),
            m(
              IconTag,
              {
                iconName: "History",
                bgColor: getColor("gray_4").back,
                fgColor: getColor("gray_4").front,
                styleExt: {
                  margin: 0,
                  flexShrink: 0,
                  borderRadius: `${getSize(8)}rem`,
                  border: `${getSize(0.25)}rem solid ${getColor("main").back}`
                },
                ext: {
                  title: trs("时光机/查看文件变动", { cn: "查看文件变动", en: "View File Changes" }),
                  onclick: async () => {
                    try {
                      const listId = attrs.listId ?? chat.chatListId ?? 0
                      const diffRes = await settingData.fnCall("restoreChatFile", [{ uuid: snapshotUuid, listId }])
                      if (!diffRes.ok) {
                        Notice.launch({ msg: diffRes.msg, type: "error" })
                        return
                      }
                      const diffList = diffRes.data
                      Notice.launch({
                        tip: trs("时光机/还原", { cn: "时光机还原", en: "Time Machine Restore" }),
                        content: ChatiTmRestoreDialog,
                        contentAttrs: {
                          diffList,
                          uuid: snapshotUuid,
                          listId
                        }
                      })
                    } catch (err) {
                      console.error("[ChatItem] 时光机还原出错:", err)
                      Notice.launch({ msg: "时光机还原出错: " + (err.message || err), type: "error" })
                    }
                  }
                }
              },
              [
                trs("时光机/查看文件变动", { cn: "查看文件变动", en: "View File Changes" }),
                m("", {
                  style: {
                    display: "inline-flex",
                    alignItems: "center"
                  }
                }, m.trust(window.iconPark.getIcon("Up", {
                  size: `${getSize(4)}rem`,
                  fill: getColor("gray_4").front
                })))
              ]
            ),
            m(
              "",
              {
                style: {
                  flex: 1,
                  height: `${getSize(0.25)}rem`,
                  background: `linear-gradient(90deg, ${getColor("main").back}, transparent)`
                }
              }
            )
          ]
        )
      }

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
        // 选中文本松手后 200ms 弹悬浮菜单（避开系统原生长按菜单）
        onpointerup(e) {
          const dom = e.currentTarget
          setTimeout(() => {
            const sel = window.getSelection()
            if (!sel || sel.isCollapsed || !sel.rangeCount) return
            const range = sel.getRangeAt(0)
            if (!dom.contains(range.commonAncestorContainer)) return
            const selectedStr = sel.toString()
            Notice.closeTab("chatItemSelMenu")
            const rect = range.getBoundingClientRect()
            Notice.launch({
              sign: "chatItemSelMenu",
              tip: trs("聊天界面/词汇/引用"),
              width: 0,
              useMinus: false,
              isMini: true,
              closeOnClickOutside: true,
              win: { x: rect.left, y: rect.bottom + 8 },
              content: {
                view: () => m("", {
                  style: {
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: `${getSize(1)}rem`,
                    gap: `${getSize(1)}rem`
                  }
                }, [
                  // 复制
                  m(Tag, {
                    isBtn: true,
                    color: "gray_2",
                    styleExt: { margin: "0" },
                    onclick: async () => {
                      try {
                        await navigator.clipboard.writeText(selectedStr)
                        //Notice.launch({ msg: trs("聊天界面/提示/已复制", { cn: "已复制到剪贴板", en: "Copied to clipboard" }), type: "success" })
                      } catch (err) {
                        Notice.launch({ msg: trs("聊天界面/提示/复制失败", { cn: "复制失败: ", en: "Copy failed: " }) + err.message, type: "error" })
                      }
                      Notice.closeTab("chatItemSelMenu")
                    }
                  }, trs("聊天界面/词汇/复制", { cn: "复制", en: "Copy" })),

                  // 引用
                  m(Tag, {
                    isBtn: true,
                    color: "blue_1",
                    styleExt: { margin: "0" },
                    onclick: () => {
                      if (!data.focusEditor) {
                        Notice.launch({ msg: trs("输入框/提示/请先聚焦", { cn: "请先点击一个聊天输入框，再引用喵", en: "Please focus a chat input box first" }), type: "info" })
                        return
                      }
                      data.quoteMessage(chat.uuid, selectedStr)
                      Notice.closeTab("chatItemSelMenu")
                    }
                  }, trs("聊天界面/词汇/引用按钮", { cn: "引用", en: "Quote" })),

                  // 批注引用
                  m(Tag, {
                    isBtn: true,
                    color: "pink_1",
                    styleExt: { margin: "0" },
                    onclick: () => {
                      if (!data.focusEditor) {
                        Notice.launch({ msg: trs("输入框/提示/请先聚焦", { cn: "请先点击一个聊天输入框，再引用喵", en: "Please focus a chat input box first" }), type: "info" })
                        return
                      }
                      Notice.closeTab("chatItemSelMenu")

                      let inputComment = ""
                      Notice.launch({
                        sign: "quote_comment_" + Date.now(),
                        tip: trs("聊天界面/词汇/批注引用", { cn: "添加批注", en: "Add Note" }),
                        useMinus: false,
                        content: {
                          view: () => [
                            // 引用原文预览：Box 容器配合 format 与 .article 渲染富文本内容
                            m(Box, {
                              isBlock: true,
                              color: "brown_3",
                              style: {
                                margin: `${getSize(1)}rem ${getSize(1)}rem ${getSize(0.5)}rem ${getSize(1)}rem`,
                                padding: `${getSize(3)}rem`,
                                maxHeight: `${getSize(38)}rem`,
                                overflowY: "auto"
                              }
                            }, [
                              m(".article", m.trust(format(selectedStr, "markdown", {})))
                            ]),
                            // 批注输入框：使用系统标准 Box 表单与高对比标准主题色 gray_3
                            m(Box, {
                              tagName: "textarea",
                              isBlock: true,
                              noValue: true,
                              color: "gray_3",
                              style: {
                                margin: `${getSize(0.5)}rem ${getSize(1)}rem ${getSize(1)}rem ${getSize(1)}rem`,
                                padding: `${getSize(3)}rem`,
                                minHeight: `${getSize(20)}rem`,
                                resize: "none",
                                outline: "none"
                              },
                              ext: {
                                placeholder: trs("聊天界面/词汇/批注占位符", { cn: "输入批注内容...", en: "Enter note..." }),
                                rows: 4
                              },
                              oninput: (dom, e) => { inputComment = e.target.value }
                            })
                          ]
                        },
                        confirm: () => {
                          data.quoteMessage(chat.uuid, selectedStr, inputComment)
                        }
                      })
                    }
                  }, trs("聊天界面/词汇/批注引用按钮", { cn: "批注引用", en: "Note Quote" }))
                ])
              }
            })
          }, 200)
        },
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
            justifyContent: chat.group === "user" ? "flex-end" : "flex-start",
            flexDirection: chat.group === "user" ? "row-reverse" : "row",
            marginLeft: chat.group === "user" ? "auto" : "none",
            maxWidth: "100%",
          }
        }, [
          //头像
          m(Avatar, {
            chat: chat
          }),


          //气泡
          m("", {
            style: {


              borderRadius: `${getSize(1)}rem ${getSize(8)}rem ${getSize(8)}rem ${getSize(1)}rem`,
              margin: `${getSize(3)}rem`,
              padding: `${getSize(3)}rem`,
              boxSizing: "border-box", // Fix typo
              alignSelf: chat.group === "user" ? "flex-end" : "unset",
              color: getColor('gray_8').front + '55',


              zIndex: 1,
              //maxHeight: "30rem",
              maxWidth: window.Mob ? `calc(100% - ${getSize(13)}rem)` : `calc(100% - ${getSize(23)}rem)`,
              overflow: "auto",

              boxShadow: `0 0 ${getSize(3)}rem rgba(0,0,0,0.05)`,

              ...(/*chat.tid === comData.data.get()?.currentTid || */fullScreen ? {
                maxWidth: "unset",
                maxHeight: "unset",
                width: "unset",
                height: `${getSize(75)}rem`,
                border: `${getSize(0.5)}rem solid ${getColor('main').back}`,
                border: "unset",
                boxShadow: "unset",

                ...(fullScreen ? {
                  height: "100%",
                } : {}),

              } : {}),



              ...(chat.group === "user" ? {
                border: `${getSize(0.25)}rem solid ${getColor("我方气泡高亮边框色")}30`,
                borderRight: `${getSize(1)}rem solid ${getColor('我方气泡高亮边框色')}`,
                borderRadius: `${getSize(8)}rem ${getSize(1)}rem ${getSize(1)}rem ${getSize(8)}rem`,
                background: getBlurBg("我方气泡高亮边框色", "我方气泡背景色"),
                
                //boxShadow: `0rem 0rem 2rem ${getColor("我方气泡高亮边框色") + "33"}`,

              } : {
                border: `${getSize(0.25)}rem solid ${getColor("对方气泡高亮边框色")}30`,
                borderLeft: `${getSize(1)}rem solid ${getColor('对方气泡高亮边框色')}`,

                borderRadius: `${getSize(1)}rem ${getSize(8)}rem ${getSize(8)}rem ${getSize(1)}rem`,
                background: getBlurBg("对方气泡高亮边框色", "对方气泡背景色"),
                //boxShadow: `0rem 0rem 2rem ${getColor("对方气泡高亮边框色") + "33"}`,
              }),


              ...(chat.group === "preparing" ? {
                border: `${getSize(0.25)}rem solid ${getColor('思考中气泡高亮边框色')}30`,
                borderLeft: `${getSize(1)}rem solid ${getColor('思考中气泡高亮边框色')}`,

                background: getBlurBg("思考中气泡高亮边框色", "思考中气泡背景色"),
                //boxShadow: `0rem 0rem 2rem ${getColor('思考中气泡高亮边框色') + '33'}`,

              } : {}),


              ...(chat.group === "tip" ? {
                border: `${getSize(0.25)}rem solid ${getColor('工具组成功边框')}30`,
                borderLeft: `${getSize(1)}rem solid ${getColor('工具组成功边框')}`,

                background: getBlurBg("工具组成功边框", "工具组成功背景"),
                //boxShadow: `0rem 0rem 2rem ${getColor('工具组成功边框') + '33'}`,

              } : {}),








            }
          }, [
            m("", [
              //用户名
              chat.group !== "tip"
                ? m("span", {
                  style: {
                    fontWeight: "bold",
                    marginBottom: `${getSize(3)}rem`,
                    color: getColor('main').back
                  }
                }, chat.name) : null,
              //call的内容
              _chat ?
                m("", [
                  m(ChatItem, {
                    key: _chat.uuid,
                    chat: _chat,
                    isChildren: true
                  })
                ]) : null,
              //quotes引用
              (chat.ask?.content?.quotes || chat.ask?.quotes) ?
                (chat.ask?.content?.quotes || chat.ask?.quotes).map((quote) => {
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
                marginBottom: `${getSize(1)}rem`,
                overflowWrap: "anywhere",
                wordBreak: "break-all",
                whiteSpace: "normal",
                //width:chat.group == "terminal" ? "500px" : "auto",
                //height:chat.group == "terminal" ? "500px" : "auto"
                boxSizing: "border-box",
                maxHeight: chat.group == "user" ? `${getSize(50)}rem` : "unset",
                overflow:"auto",
              }
            }, [
              //正文内容
              (() => {
                switch (chat.group) {
                  case "terminal":
                    return m(ChatTerm, {
                      chat: chat,
                      style: {
                        height: `${getSize(38)}rem`,
                      }
                    })

                  case "childChatList":
                    // Find the specific list data
                    const childId = chat.ext?.targetSubListId;
                    const childListObj = comData.getChatList(childId);
                    // 防御：子会话已被删除时不再渲染 ChatList，避免 undefined 串台渲染主列表
                    if (!childListObj) {
                      return m("", {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: `${getSize(2)}rem`,
                          padding: `${getSize(3)}rem`,
                          borderRadius: `${getSize(3)}rem`,
                          background: getColor("gray_12").back,
                          color: getColor("gray_4").front,
                          fontSize: `${getSize(3)}rem`,
                          opacity: 0.8
                        }
                      }, "🗑️ 该子会话已被删除")
                    }
                    // 子会话预览默认折叠：内嵌的子 ChatList 会带来一整套虚拟滚动/测高/100ms 贴底定时器/流式重排开销，
                    // 改为按需展开。展开状态存储方式与 ChatNote 的 expandedStates 一致（实例闭包 + 唯一键）
                    const isChildExpanded = !!expandedChildLists[chat.uuid];
                    const childToggle = m(Tag, {
                      styleExt: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: `${getSize(1)}rem`,
                        margin: `${getSize(1)}rem 0`,
                        background: isChildExpanded ? getColor("gray_2").back : getColor("purple_2").back,
                        color: getColor("gray_9").front
                      },
                      isBtn: true,
                      onclick: () => {
                        expandedChildLists[chat.uuid] = !isChildExpanded;
                        m.redraw();
                      }
                    }, [
                      m.trust(window.iconPark.getIcon(isChildExpanded ? "ExpandUp" : "ExpandDown", {
                        fill: getColor("gray_9").front,
                        size: `${getSize(3)}rem`
                      })),
                      isChildExpanded
                        ? trs("聊天/子会话/收起预览", { cn: "收起子会话预览", en: "Collapse sub-session preview" })
                        : trs("聊天/子会话/展开预览", { cn: "展开子会话预览", en: "Expand sub-session preview" })
                    ]);
                    if (!isChildExpanded) return m("", [childToggle]);
                    return m("", [
                      childToggle,
                      m("", {
                        style: {
                          maxHeight: `${getSize(75)}rem`,
                          overflow: "auto",
                        }
                      }, [
                        m(ChatList, {
                          chatList: childListObj
                        })
                      ])
                    ])

                  case "preparing":
                    return [
                      m("", {
                        style: {
                          overflow: "hidden",
                          maxWidth: `${getSize(200)}rem`,
                        }
                      }, [
                        m(ReasoningBlock, { reasoning: chat.reasoning, isPreparing: true }),
                        m("", [
                          trs("聊天/状态/思考中", { cn: "思考中...", en: "Thinking..." }),

                          chat.content?.length > 0 ?
                            m("a", {
                              style: {
                                cursor: "pointer",
                                color: getColor('main').front
                              },
                              onclick() {
                                showMind = !showMind
                              },
                            }, `[${showMind ? trs("通用/折叠") : trs("通用/展开")}]`) : null,
                        ]),
                        m("", {
                          style: {
                            float: showMind ? "unset" : "right",
                            whiteSpace: showMind ? "normal" : "nowrap",
                            fontSize: `${getSize(2)}rem`,
                            maxHeight: `${getSize(50)}rem`,
                            overflow: "auto",
                          },
                          onscroll(e) {
                            const dom = e.target;
                            isContentAtBottom = dom.scrollHeight <= dom.clientHeight
                              ? true
                              : dom.scrollHeight - dom.scrollTop - dom.clientHeight <= 30;
                          },
                          onupdate({ dom }) {
                            if (!contentScrollTimer) {
                              contentScrollTimer = setTimeout(() => {
                                contentScrollTimer = null;
                                if (isContentAtBottom) {
                                  dom.scrollTop = dom.scrollHeight;
                                }
                              }, 200);
                            }
                          },
                        }, [
                          showMind
                            ? m.trust(format(chat.content, "markdown", { noCache: true, isThinking: true }))
                            : (chat.content ? (chat.content.length > 20000 ? "..." + chat.content.slice(-20000) : chat.content) : "")
                          ,
                        ]),
                        m("", { style: { float: "clear" } })
                      ])

                    ]

                  default:
                    return m("", {
                      oncreate({ dom }) {
                        dom.addEventListener("owo-open-editor", (e) => {
                          e.stopPropagation(); // 阻断冒泡，防止触发全局兜底
                          if (settingData && settingData.fnCall) {
                            let textToOpen = chat.content;
                            if (e.detail && window.__owoFormatCache && window.__owoFormatCache.has(e.detail)) {
                              textToOpen = window.__owoFormatCache.get(e.detail);
                            }
                            settingData.fnCall("appLaunch", ["editor", { data: { content: textToOpen, readOnly: true } }]);
                          }
                        });
                      }
                    }, chat.group === "tip"
                      ? [
                        showMore
                          ? m("", {
                            style: {
                              maxHeight: `${getSize(50)}rem`,
                              overflow: "auto"
                            }
                          }, [
                            m.trust(format((attrs.isChildren ? chat.content.slice(0, 30) + "..." : chat.content), "markdown", {}))
                          ])
                          : chat.ask.title,
                        //标题
                        chat.ask.joi
                          ? m("", [
                            m("", ["[joi]" + chat.ask.joi]),
                          ])
                          : m("", ""),
                        m(Tag, {
                          onclick() {
                            showMore = !showMore
                          }
                        }, showMore ? trs("通用/收起") : trs("通用/详情"))
                      ]
                      : m.trust(format((attrs.isChildren ? chat.content.slice(0, 21) + "..." : chat.content), "markdown", {})),

                    )
                }
              })(),

            ]),
            chat.tid ?
              m("", [
                m("span", { style: { fontSize: `${getSize(2)}rem` } }, "tid " + chat.tid)
              ]) : null,
            m("", [
              showRaw ?
                m(Box, {
                  tagName: "pre",
                  isBlock: true,
                  style: {
                    borderRadius: `${getSize(2)}rem`,
                    margin: `${getSize(3)}rem 0`,
                    overflow: "auto",
                    maxHeight: `${getSize(75)}rem`
                  },
                }, [
                  m(AutoForm, {
                    dataObj: { ask: chat.ask },
                    dataName: "ask"
                  }),
                  JSON.stringify(chat, null, "\t\t").length > 10000
                    ? JSON.stringify(chat, null, "\t\t").slice(0, 10000) + "\n\n... (Raw JSON too large, truncated for performance)"
                    : JSON.stringify(chat, null, "\t\t")
                ]) : null,
              m("", {
                style: {
                  fontSize: `${getSize(2)}rem`,
                  color: getColor("brown_1").front
                }
              }, [
                m("a", {
                  style: {
                    cursor: "pointer",
                    fontSize: `${getSize(2)}rem`,
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
                chat?.ask?.totalTokens ? [
                  `${trs("chatItem/token消耗", { cn: "token消耗", en: "token consumption" })}
                ${trs("chatItem/输入", { cn: "输入", en: "input" })}:${chat?.ask?.promptTokens}
                ${trs("chatItem/缓存", { cn: "缓存", en: "cached" })}:${chat?.ask?.cachedTokens || 0}
                ${trs("chatItem/输出", { cn: "输出", en: "output" })}:${chat?.ask?.completionTokens}
                ${trs("chatItem/合计", { cn: "合计", en: "total" })}:${chat?.ask?.totalTokens}
                `,
                  m("span", {
                    style: {
                      fontWeight: "bold",
                      color: getColor('pink_1').back,
                      fontSize: `${getSize(2)}rem`,
                    }
                  }, `${trs("chatItem/实际消耗", { cn: "实际消耗", en: "actual cost" })}:${chat.ask.totalTokens - chat.ask.cachedTokens}`)
                ] : null
              ])
            ]),



            chat.group !== "preparing" ?
              (() => {
                const actionBtnStyle = {
                  margin: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  padding: `${getSize(1)}rem`,
                  borderRadius: "50%",
                  justifyContent: "center",
                  aspectRatio: "1 / 1"
                }
                const hasMsgWindow = chat.group !== "childChatList" && !chat.tid && chat.group !== "preparing"
                const hasTermWindow = Boolean(chat.tid)
                const hasSavePlan = Boolean(chat.group === "agent" && chat.content)
                const hasClearBefore = !attrs.isChildren
                const hasMoreMenu = hasMsgWindow || hasTermWindow || hasSavePlan || hasClearBefore
                return m("",
                  {
                    style: {
                      marginTop: "auto",
                      paddingTop: `${getSize(3)}rem`,
                      width: "max-content",
                      maxWidth: "100%",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: `${getSize(1)}rem`
                    }
                  },
                  [
                    chat.group === "childChatList"
                      ? m(IconTag,
                          {
                            iconName: data.getSessionState(attrs.listId || 0).lockedListId === chat.ext?.targetSubListId ? "Lock" : "Unlock",
                            bgColor: data.getSessionState(attrs.listId || 0).lockedListId === chat.ext?.targetSubListId ? getColor("pink_1").back : getColor("purple_2").back,
                            fgColor: data.getSessionState(attrs.listId || 0).lockedListId === chat.ext?.targetSubListId ? getColor("pink_1").front : getColor("purple_2").front,
                            styleExt: actionBtnStyle,
                            ext: {
                              title: data.getSessionState(attrs.listId || 0).lockedListId === chat.ext?.targetSubListId
                                ? trs("聊天/队列/解锁", { cn: "解锁队列", en: "Unlock Queue" })
                                : trs("聊天/队列/锁定", { cn: "锁定队列", en: "Lock Queue" }),
                              onclick: async () => {
                                try {
                                  const hostListId = attrs.listId || 0
                                  const targetId = chat.ext?.targetSubListId
                                  const session = data.getSessionState(hostListId)
                                  const newLockedId = session.lockedListId === targetId ? null : targetId
                                  session.lockedListId = newLockedId
                                  await settingData.fnCall("updateListConfig", [hostListId, { lockedListId: newLockedId }])
                                  if (newLockedId !== null) {
                                    data.updateTmStatus(newLockedId)
                                  }
                                  m.redraw()
                                } catch (err) {
                                  console.error("[ChatItem] 切换队列锁定状态失败:", err)
                                }
                              }
                            }
                          }
                        )
                      : null,

                    chat.group === "childChatList"
                      ? m(IconTag,
                          {
                            iconName: "Browser",
                            bgColor: getColor("blue_1").back,
                            fgColor: getColor("blue_1").front,
                            styleExt: actionBtnStyle,
                            ext: {
                              title: trs("聊天/子会话/打开窗口按钮", { cn: "打开子会话", en: "Open Sub-session" }),
                              onclick: () => {
                                const targetId = chat.ext?.targetSubListId
                                const name = chat.ext?.agentName || trs("智能体窗口/标题", { cn: `智能体 ${targetId}`, en: `Agent ${targetId}` })
                                Notice.launch({
                                  sign: "agent_" + targetId,
                                  tip: "🤖 " + name,
                                  width: 600,
                                  height: 800,
                                  content: AgentWindow({ listId: targetId, agentName: name })
                                })
                              }
                            }
                          }
                        )
                      : null,

                    m(IconTag,
                      {
                        iconName: "Undo",
                        bgColor: getColor("purple_2").back,
                        fgColor: getColor("purple_2").front,
                        styleExt: {
                          margin: 0,
                          marginLeft: 0,
                          marginRight: 0
                        },
                        ext: {
                          title: trs("聊天界面/词汇/撤销"),
                          onclick: async () => {
                            Notice.launch({
                              tip: trs("聊天/撤销/提示标题", { cn: "是否撤销", en: "Undo Check" }),
                              msg: trs("聊天/撤销/提示内容", { cn: "是否撤销本条消息?（若为提问消息本条消息将重新加入到输入框）", en: "Undo this message? (User questions will return to the input box)" }),
                              async confirm() {
                                try {
                                  if (chat.group === "user") {
                                    if (!data.focusEditor) {
                                      Notice.launch({ msg: "请先点击一个聊天输入框，再撤回喵", type: "info" })
                                      return
                                    }
                                    if (data.focusEditor.getListId() !== chat.chatListId) {
                                      Notice.launch({ msg: "请先切换到该会话的输入框，再撤回喵", type: "info" })
                                      return
                                    }
                                  }
                                  debugHistory.log("撤销", { uuid: chat.uuid, chatListId: chat.chatListId })
                                  await settingData.fnCall("undoChat", [chat.uuid, chat.chatListId])
                                  data.getSessionState(chat.chatListId).isAtBottom = true
                                  if (chat.group === "user") {
                                    data.focusEditor.appendText(chat.content)
                                  }
                                } catch (err) {
                                  console.error("[ChatItem] 撤销消息失败:", err)
                                }
                              }
                            })
                          }
                        }
                      },
                      trs("聊天界面/词汇/撤销")
                    ),

                    // 1. 撤到此处按钮 (Undo)
                    m(IconTag,
                      {
                        iconName: "Return",
                        bgColor: getColor("purple_2").back,
                        fgColor: getColor("purple_2").front,
                        styleExt: {
                          margin: 0,
                          marginLeft: 0,
                          marginRight: 0,
                          display: attrs.isChildren ? "none" : "inline-flex"
                        },
                        ext: {
                          title: trs("聊天/撤到此处/按钮", { cn: "撤到本条", en: "Undo to here" }),
                          onclick: async () => {
                            Notice.launch({
                              tip: trs("聊天/撤到此处/提示标题", { cn: "是否撤到本条？", en: "Undo to here?" }),
                              msg: trs("聊天/撤到此处/提示内容", { cn: "是否撤销到本条消息？（这将清空包括本条和本条以后的所有消息，若为提问消息本条消息将重新加入到输入框）", en: "Undo all messages from this point? (This clears everything after, and returns user questions to input)" }),
                              async confirm() {
                                try {
                                  if (chat.group === "user") {
                                    if (!data.focusEditor) {
                                      Notice.launch({ msg: "请先点击一个聊天输入框，再撤到本条喵", type: "info" })
                                      return
                                    }
                                    if (data.focusEditor.getListId() !== chat.chatListId) {
                                      Notice.launch({ msg: "请先切换到该会话的输入框，再撤到本条喵", type: "info" })
                                      return
                                    }
                                  }
                                  debugHistory.log("撤到本条", { uuid: chat.uuid, chatListId: chat.chatListId })
                                  await settingData.fnCall("undoToChat", [chat.uuid, chat.chatListId])
                                  data.getSessionState(chat.chatListId).isAtBottom = true
                                  if (chat.group === "user") {
                                    data.getSessionState(chat.chatListId).attachments = chat.attachments || []
                                    data.focusEditor.appendText(chat.content)
                                  }
                                } catch (err) {
                                  console.error("[ChatItem] 撤到本条失败:", err)
                                }
                              }
                            })
                          }
                        }
                      },
                      trs("聊天/撤到此处/短按钮", { cn: "撤到…", en: "Undo…" })
                    ),

                    // 2. 时光机还原按钮
                    (chat.uuid && chat.group !== "preparing" && chat.snapshotId)
                      ? m(IconTag,
                          {
                            iconName: "History",
                            bgColor: getColor("green_1").back,
                            fgColor: getColor("green_1").front,
                            styleExt: actionBtnStyle,
                            ext: {
                              title: trs("时光机/还原文件变动", { cn: "还原文件变动", en: "Restore File Changes" }),
                              onclick: async () => {
                                try {
                                  const listId = attrs.listId || 0
                                  const diffRes = await settingData.fnCall("restoreChatFile", [{ uuid: chat.uuid, listId }])
                                  if (!diffRes.ok) {
                                    Notice.launch({ msg: diffRes.msg, type: "error" })
                                    return
                                  }
                                  const diffList = diffRes.data
                                  Notice.launch({
                                    tip: trs("时光机/还原", { cn: "时光机还原", en: "Time Machine Restore" }),
                                    content: ChatiTmRestoreDialog,
                                    contentAttrs: {
                                      diffList,
                                      uuid: chat.uuid,
                                      listId
                                    }
                                  })
                                } catch (err) {
                                  console.error("[ChatItem] 时光机还原出错:", err)
                                  Notice.launch({ msg: "时光机还原出错: " + (err.message || err), type: "error" })
                                }
                              }
                            }
                          }
                        )
                      : null,


                    m(IconTag,
                      {
                        iconName: "Message",
                        bgColor: getColor("yellow_1").back,
                        fgColor: getColor("yellow_1").front,
                        styleExt: actionBtnStyle,
                        ext: {
                          title: trs("聊天界面/词汇/回复"),
                          onclick: async () => {
                            data.getSessionState(chat.chatListId).call = {
                              uuid: chat.uuid
                            }
                          }
                        }
                      }
                    ),

                    m(IconTag,
                      {
                        iconName: "Quote",
                        bgColor: getColor("yellow_1").back,
                        fgColor: getColor("yellow_1").front,
                        styleExt: actionBtnStyle,
                        ext: {
                          title: trs("聊天界面/词汇/引用"),
                          onclick: async () => {
                            if (!data.focusEditor) {
                              Notice.launch({ msg: "请先点击一个聊天输入框，再引用喵", type: "info" })
                              return
                            }
                            const session = data.getSessionState(data.focusEditor.getListId())
                            session.quotes = session.quotes.filter((q) => q.uuid !== chat.uuid)
                            session.quotes.push({ ...chat })
                          }
                        }
                      }
                    ),

                    // 更多操作（通过 NoticeMini 弹出/隐藏：窗口、保存计划书）
                    hasMoreMenu
                      ? m(IconTag,
                          {
                            iconName: "More",
                            bgColor: getColor("gray_2").back,
                            fgColor: getColor("gray_2").front,
                            styleExt: actionBtnStyle,
                            ext: {
                              title: trs("聊天/更多/按钮", { cn: "更多", en: "More" }),
                              onpointerdown: (e) => {
                                e.stopPropagation()
                              },
                              onclick: (e) => {
                                e.stopPropagation()
                                const moreSign = `chatItemMoreMenu_${chat.uuid}`
                                const isAlreadyOpen = Notice.data.dataArr.some((item) => item.sign === moreSign)
                                if (isAlreadyOpen) {
                                  Notice.closeTab(moreSign)
                                  return
                                }
                                Notice.data.dataArr
                                  .filter((item) => typeof item.sign === "string" && item.sign.startsWith("chatItemMoreMenu_"))
                                  .forEach((item) => Notice.closeTab(item.sign))
                                const rect = e.currentTarget.getBoundingClientRect()
                                Notice.launch({
                                  sign: moreSign,
                                  tip: trs("聊天/更多/按钮", { cn: "更多", en: "More" }),
                                  width: 0,
                                  hideBtn: 1,
                                  useMinus: false,
                                  isMini: true,
                                  closeOnClickOutside: true,
                                  win: {
                                    x: rect.left,
                                    y: rect.bottom + 8
                                  },
                                  content: {
                                    view: () => m("",
                                      {
                                        style: {
                                          display: "flex",
                                          flexDirection: "column",
                                          alignItems: "flex-start",
                                          padding: `${getSize(3)}rem`,
                                          gap: `${getSize(3)}rem`
                                        }
                                      },
                                      [
                                        hasMsgWindow
                                          ? m(IconTag,
                                              {
                                                iconName: "Browser",
                                                bgColor: getColor("blue_1").back,
                                                fgColor: getColor("blue_1").front,
                                                styleExt: {
                                                  margin: 0,
                                                  marginLeft: 0,
                                                  marginRight: 0
                                                },
                                                ext: {
                                                  onclick: () => {
                                                    Notice.closeTab(moreSign)
                                                    Notice.launch({
                                                      sign: "msg_" + chat.uuid,
                                                      tip: chat.ask.title || trs("聊天/窗口/按钮", { cn: "单消息窗口", en: "Window" }),
                                                      content: {
                                                        view: () => m(ChatItem, { chat })
                                                      }
                                                    })
                                                  }
                                                }
                                              },
                                              trs("聊天/窗口/按钮", { cn: "窗口", en: "Window" })
                                            )
                                          : null,

                                        hasTermWindow
                                          ? m(IconTag,
                                              {
                                                iconName: "Browser",
                                                bgColor: getColor("blue_1").back,
                                                fgColor: getColor("blue_1").front,
                                                styleExt: {
                                                  margin: 0,
                                                  marginLeft: 0,
                                                  marginRight: 0
                                                },
                                                ext: {
                                                  onclick: () => {
                                                    Notice.closeTab(moreSign)
                                                    Notice.launch({
                                                      tip: trs("聊天/终端/提示", { cn: "终端：", en: "Terminal: " }) + chat.tid,
                                                      sign: chat.tid,
                                                      content: {
                                                        view() {
                                                          return m(ChatTerm, { chat })
                                                        }
                                                      }
                                                    })
                                                  }
                                                }
                                              },
                                              trs("聊天/窗口/按钮", { cn: "窗口", en: "Window" })
                                            )
                                          : null,

                                        hasSavePlan
                                          ? m(IconTag,
                                              {
                                                iconName: "DocDetail",
                                                bgColor: getColor("green_1").back,
                                                fgColor: getColor("green_1").front,
                                                styleExt: {
                                                  margin: 0,
                                                  marginLeft: 0,
                                                  marginRight: 0
                                                },
                                                ext: {
                                                  onclick: async () => {
                                                    Notice.closeTab(moreSign)
                                                    try {
                                                      const res = await settingData.fnCall("savePlan", [{
                                                        chatUuid: chat.uuid,
                                                        content: chat.content,
                                                        title: chat.ask?.title || "",
                                                        listId: chat.chatListId
                                                      }])
                                                      if (!res.ok) {
                                                        Notice.launch({ msg: res.msg })
                                                        return
                                                      }
                                                      await settingData.fnCall("appLaunch", ["editor", {
                                                        data: {
                                                          filePath: res.data.filePath,
                                                          singleInstance: true
                                                        }
                                                      }])
                                                    } catch (err) {
                                                      console.error("[ChatItem] 保存计划书出错:", err)
                                                    }
                                                  }
                                                }
                                              },
                                              trs("聊天/保存计划书/按钮", { cn: "保存计划书", en: "Save Plan" })
                                            )
                                          : null,

                                        hasClearBefore
                                          ? m(IconTag,
                                              {
                                                iconName: "Clear",
                                                bgColor: getColor("purple_2").back,
                                                fgColor: getColor("purple_2").front,
                                                styleExt: {
                                                  margin: 0,
                                                  marginLeft: 0,
                                                  marginRight: 0
                                                },
                                                ext: {
                                                  onclick: async () => {
                                                    Notice.closeTab(moreSign)
                                                    Notice.launch({
                                                      tip: trs("聊天/清除之前/提示标题", { cn: "是否清除本条之前所有消息？", en: "Clear all before this?" }),
                                                      msg: trs("聊天/清除之前/提示内容", { cn: "是否清除本条之前所有消息（不包括本条消息）？", en: "Clear all messages before this one (not including this message)?" }),
                                                      async confirm() {
                                                        try {
                                                          debugHistory.log("清除本条之前", { uuid: chat.uuid, chatListId: chat.chatListId })
                                                          await settingData.fnCall("clearBeforeChat", [chat.uuid, chat.chatListId])
                                                        } catch (err) {
                                                          console.error("[ChatItem] 清除本条之前失败:", err)
                                                        }
                                                      }
                                                    })
                                                  }
                                                }
                                              },
                                              trs("聊天/清除之前/按钮", { cn: "清除本条之前", en: "Clear before" })
                                            )
                                          : null
                                      ]
                                    )
                                  }
                                })
                              }
                            }
                          }
                        )
                      : null,

                    attrs.isChildren
                      ? m(IconTag,
                          {
                            iconName: "Back",
                            bgColor: getColor("gray_2").back,
                            fgColor: getColor("gray_2").front,
                            styleExt: actionBtnStyle,
                            ext: {
                              title: trs("聊天/跳转/按钮", { cn: "转到", en: "Go to" }),
                              onclick: () => {
                                let dom = document.getElementById(chat.uuid)
                                dom.scrollIntoView({
                                  behavior: "smooth"
                                })
                              }
                            }
                          }
                        )
                      : null,

                    chat.tid
                      ? m(IconTag,
                          {
                            iconName: "Pin",
                            bgColor: getColor("gray_2").back,
                            fgColor: getColor("gray_2").front,
                            styleExt: actionBtnStyle,
                            ext: {
                              title: comData.data.get()?.currentTid === chat.tid
                                ? trs("聊天/悬挂/取消", { cn: "取消悬挂", en: "Unpin" })
                                : trs("聊天/悬挂/悬挂", { cn: "悬挂", en: "Pin" }),
                              onclick: async () => {
                                try {
                                  await comData.data.edit((data) => {
                                    if (data.currentTid === chat.tid) {
                                      data.currentTid = ""
                                    } else {
                                      data.currentTid = chat.tid
                                    }
                                  })
                                } catch (err) {
                                  console.error("[ChatItem] 切换终端悬挂失败:", err)
                                }
                              }
                            }
                          }
                        )
                      : null,



                    m(IconTag,
                      {
                        iconName: fullScreen ? "OffScreenOne" : "FullScreenOne",
                        bgColor: getColor("main").back,
                        fgColor: getColor("main").front,
                        styleExt: {
                          ...actionBtnStyle,
                          display: chat.group === "terminal" ? "inline-flex" : "none"
                        },
                        ext: {
                          title: fullScreen ? trs("通用/收起") : trs("通用/全屏"),
                          onclick: async () => {
                            try {
                              fullScreen = !fullScreen
                              if (fullScreen) {
                                await comData.data.edit((data) => {
                                  data.call = {
                                    ...chat
                                  }
                                  delete data.call.xTerm
                                })
                              }
                            } catch (err) {
                              console.error("[ChatItem] 切换终端全屏失败:", err)
                            }
                          }
                        }
                      }
                    )
                  ]
                )
              })()
              : null



          ])


        ]),



      ])
    }
  }
}