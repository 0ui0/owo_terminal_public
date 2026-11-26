import chatData from "./chatData.js"
import Tag from "../common/tag.js"
import Box from "../common/box.js"
import IconTag from "../common/iconTag.js"
import Notice from "../common/notice.js"
import Tip from "../common/tip.js"
import Setting from "../setting/setting.js"
import settingData from "../setting/settingData.js"
import comData from "../../comData/comData.js"
import ioSocket from "../../comData/ioSocket.js"
import Browser from "../browser/Browser.js"
import { trs } from "../common/i18n.js"
import ChatInputEditor from "./ChatInputEditor.js"
import ChatCwdConfig from "./ChatCwdConfig.js"
import debugHistory from "../../historyPanel/historyPanelData.js"
import HelpMenu from "../common/HelpMenu.js"
import getColor from "../common/getColor.js"
import ChatModelSelector from "./ChatModelSelector.js"
import ChatSendParams from "./ChatSendParams.js"
import ChatToolModeModal from "./ChatToolModeModal.js"
import ChatSendQuickMenu from "./ChatSendQuickMenu.js"
import getSize from "../common/getSize.js"

const updateListSession = async (listId, updates) => {
  chatData.initSessionState(listId, updates);
  const res = await settingData.fnCall("updateListConfig", [listId, updates]);
  m.redraw();
  return res;
}

export default () => {
  let editorInstance = null // 本窗口编辑器实例（由 ChatInputEditor 的 onReady 回传）
  let attachInputDom = null // 本窗口自己的文件选择器 DOM（由 Mithril 的 oncreate 回传，替代重复的全局 id）

  const submitFn = async (e, listId) => {
    e.preventDefault()

    const currentData = comData.data.get()
    const session = chatData.getSessionState(listId);
    const targetChatListId = session.lockedListId || listId;
    const targetSession = chatData.getSessionState(targetChatListId);

    // 如果不是发给子智能体，且未选择任何有效 AI 模型，拦截并给出提示
    if (!targetChatListId) {
      const enabledModels = settingData.options.get("ai_aiList")?.filter(m => m.switch)
      const hasValidModel = enabledModels.some(m => m.id === targetSession?.currentModelId)
      if (!hasValidModel) {
        Notice.launch({
          msg: trs("输入栏/提示/请选择模型", { cn: "请在下拉菜单中选择一个模型喵！", en: "Please select a model from the dropdown menu!" }),
          type: "info"
        })
        return
      }
    }

    // 时光机预警：如果指定了目录但未开启备份
    if (targetSession.workDirs.find(item => item.type === "main")?.path && !targetSession.tmStatus.isReady) {
      const goOn = await new Promise(resolve => {
        Notice.launch({
          tip: "安全警告",
          msg: "当前项目未开启时光机备份。如果 AI 修改文件出错，将无法通过时光机一键撤回。确定要继续发送吗喵？",
          confirm() {
            resolve(true)
            return undefined //关闭窗口
          },
          cancel() {
            resolve(false)
            return undefined //关闭窗口
          }
        })
      });
      if (!goOn) return;
    }

    const trimmedInput = targetSession.inputText.trim()
    if (trimmedInput) {
      chatData.saveHistory(trimmedInput)
    }

    const hasStageExt = targetSession.workStage && targetSession.workStage !== '无附加';

    // 空消息拦截：无文本、无附件、无引用时，禁止发送 (如果有附带阶段指令则放行)
    if (!trimmedInput && !hasStageExt && targetSession.attachments.length === 0 && targetSession.quotes.length === 0) {
      return;
    }

    chatData.preparing = true

    // Retrieve routing context

    let currentInput = targetSession.inputText;

    // -------------------------------------------------------------
    // 【消息引用标签解包还原】
    // 编辑器内部为了防止换行符、右方括号 ] 破坏 Chip 正则，采用了 encodeURIComponent 编码。
    // 在最终发送给后端/AI以及存盘入库前，在此处统一将 [msg:uuid:encodedContent:encodedComment] 
    // 解包还原为人类和 AI 均完全可读的纯文本标签格式 [msg:uuid:content:comment]
    // -------------------------------------------------------------
    currentInput = currentInput.replace(/\[msg:([^\]]+)\]/gi, (match, val) => {
      const parts = val.split(":");
      const msgId = parts[0] || "";
      if (parts.length <= 1) return match; // 纯 uuid 标签不需解包
      const content = parts[1] ? decodeURIComponent(parts[1]).replace(/\]/g, "\\]").replace(/\n/g, "\\n") : "";
      const comment = parts[2] ? decodeURIComponent(parts[2]).replace(/\]/g, "\\]").replace(/\n/g, "\\n") : "";
      const restored = [msgId, content, comment].filter(Boolean).join(":");
      return `[msg:${restored}]`;
    });

    // 匹配类似 [xxx:yyy] 的标签结构，不过于限定特定的关键词白名单
    const quoteRegex = /\[[a-zA-Z0-9_]+:[^\]]+\]/ig;
    if (quoteRegex.test(currentInput)) {
      const quoteTip = trs("输入栏/提示/引用检测", {
        cn: "若用户在正文中引用了类似[appid:msg]格式的相关标记，请优先使用工具阅读引用内容。",
        en: "If the user quotes tags like [appid:msg] in the text, please use tools to read the cited content first."
      });
      if (currentInput.trim()) {
        currentInput += `\n\n[系统附加指令]：${quoteTip}`;
      } else {
        currentInput = `[系统附加指令]：${quoteTip}`;
      }
    }

    if (hasStageExt) {
      const currentStageOpt = chatData.getStageOptions().find(opt => opt.value === targetSession.workStage);
      if (currentStageOpt && currentStageOpt.text) {
        if (currentInput.trim()) {
          currentInput += `\n\n[系统附加指令]：当前处于${targetSession.workStage}模式，${currentStageOpt.text}`;
        } else {
          currentInput = `[系统附加指令]：当前处于${targetSession.workStage}模式，${currentStageOpt.text}`;
        }
      }
    }

    const payload = {
      ...targetSession,
      inputText: currentInput,
      targetChatListId: targetChatListId,
    };

    console.log("发送的payload", payload)

    targetSession.call = null;

    // 发送前立即清空前端状态并即时置底，提升响应速度
    if (editorInstance) editorInstance.clear()
    chatData.scrollChatListTobottom(targetChatListId) //滚动到底部

    targetSession.unreadCount = 0
    m.redraw()

    // 悄悄在后台编辑 comData，不必 await 阻塞主线程
    comData.data.edit((data_) => {
      data_.inputText = ""
    }).catch(err => console.error(err))

    // Send with HTTP RPC 
    try {
      debugHistory.log("发送消息", { payload });
      await settingData.fnCall("sendChatMessage", [payload]);
    } catch (err) {
      console.error(err)
      // 可选：如果发送彻底失败，可以考虑把字恢复到输入框
    }
  }

  const uploadAttachment = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!editorInstance) {
      Notice.launch({ msg: trs("输入框/提示/请先聚焦", { cn: "请先点击一个聊天输入框，再添加附件喵", en: "Please focus a chat input box first" }), type: "info" })
      return
    }
    editorInstance.addFiles(files)
    e.target.value = ""
  }






  return {
    async oninit({ attrs }) {
      try {
        const listId = attrs.listId || 0;

        await settingData.options.pull()
        chatData.updateTmStatus(listId) // 初始获取时光机状态

        const listConfig = comData.getChatList(listId);
        chatData.initSessionState(listId, listConfig);

      }
      catch (err) {
        throw err
      }
    },
    view({ attrs }) {
      // 更新原生 listId
      const listId = attrs.listId || 0;
      const session = chatData.getSessionState(listId);
      const targetChatListId = session.lockedListId || listId;
      const targetSession = chatData.getSessionState(targetChatListId);
      const attachments = targetSession.attachments



      return m("", {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      }, [
        // 顶部状态栏：左侧工作目录 + 时光机胶囊，右侧模式/阶段快捷菜单（手机端隐藏快捷菜单）
        m("",
          {
            style: {
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: `${getSize(2)}rem`,
              margin: `${getSize(3)}rem 0 0 0`,
              paddingTop: `${getSize(3)}rem`,
              borderTop: `${getSize(0.25)}rem solid ${getColor("main").back}`
            }
          },
          [
            m("",
              {
                style: {
                  display: "inline-flex",
                  alignItems: "center"
                }
              },
              [
                m(IconTag,
                  {
                    iconName: "FolderOpen",
                    bgColor: targetSession.workDirs.find((item) => item.type === "main") ? getColor("yellow_1").back : getColor("gray_2").back,
                    fgColor: targetSession.workDirs.find((item) => item.type === "main") ? getColor("yellow_1").front : getColor("gray_2").front,
                    styleExt: {
                      margin: 0,
                      marginLeft: 0,
                      marginRight: 0,
                      ...(targetSession.workDirs.find((item) => item.type === "main")
                        ? {
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0
                          }
                        : {})
                    },
                    ext: {
                      onclick: () => {
                        Notice.launch({
                          group: "chatCwdConfig",
                          hideBtn: 2,
                          tip: trs("工作目录/配置", {
                            cn: "工作目录配置",
                            en: "Working Directory"
                          }),
                          content: ChatCwdConfig,
                          contentAttrs: {
                            listId: targetChatListId
                          }
                        })
                      }
                    }
                  },
                  targetSession.workDirs.find((item) => item.type === "main")?.path.split(/[/\\]/).pop() || trs("聊天界面/词汇/工作目录", {
                    cn: "工作目录",
                    en: "Work Dir"
                  })
                ),

                targetSession.workDirs.find((item) => item.type === "main")
                  ? m(IconTag,
                      {
                        iconName: targetSession.tmStatus.isReady ? "History" : "FileLock",
                        bgColor: targetSession.tmStatus.isReady ? getColor("green_1").back : getColor("red_1").back,
                        fgColor: targetSession.tmStatus.isReady ? getColor("green_1").front : getColor("red_1").front,
                        styleExt: {
                          margin: 0,
                          marginLeft: 0,
                          marginRight: 0,
                          borderTopLeftRadius: 0,
                          borderBottomLeftRadius: 0,
                          justifyContent: "center"
                        },
                        ext: {
                          title: targetSession.tmStatus.isReady
                            ? trs("输入栏/按钮/打开时光机", {
                                cn: "打开时光机备份",
                                en: "Open Time Machine"
                              })
                            : trs("输入栏/按钮/初始化时光机", {
                                cn: "初始化时光机备份",
                                en: "Initialize Time Machine"
                              }),
                          onclick: async () => {
                            try {
                              const mainDir = targetSession.workDirs.find((item) => item.type === "main")?.path
                              if (!mainDir) return
                              if (!targetSession.tmStatus.isReady) {
                                Notice.launch({
                                  tip: trs("输入栏/时光机/初始化标题", {
                                    cn: "立即初始化备份",
                                    en: "Initialize Backup"
                                  }),
                                  msg: trs("输入栏/时光机/初始化提示", {
                                    cn: "该目录尚未初始化时光机备份，是否立即创建喵？",
                                    en: "Time Machine backup is not initialized for this directory. Create now?"
                                  }),
                                  async confirm() {
                                    try {
                                      const initRes = await settingData.fnCall("tmInit", [mainDir])
                                      Notice.launch({
                                        msg: initRes.msg
                                      })
                                      chatData.updateTmStatus(targetChatListId)
                                    } catch (err) {
                                      console.error("[ChatInputBar] 初始化时光机失败:", err)
                                    }
                                    return undefined
                                  }
                                })
                              } else {
                                await settingData.fnCall("appLaunch", [
                                  "owoTimeMachine",
                                  {
                                    data: {
                                      repoPath: `${mainDir}/.owoTimeMachine`
                                    }
                                  }
                                ])
                              }
                            } catch (err) {
                              console.error("[ChatInputBar] 时光机操作失败:", err)
                            }
                          }
                        }
                      }
                    )
                  : null
              ]
            ),

            // 发送模式与附加阶段快捷菜单（手机端依然保持隐藏）
            !window.Mob
              ? m(ChatSendQuickMenu, {
                  targetChatListId,
                  targetSession,
                  updateListSession,
                  style: {
                    marginLeft: "auto"
                  }
                })
              : null
          ]
        ),

        // 附件预览区域
        attachments.length > 0 ?
          m("",
            {
              style: {
                display: "flex",
                gap: `${getSize(2)}rem`,
                margin: `${getSize(3)}rem 0 0 0`,
                flexWrap: "wrap"
              }
            },
            attachments.map((attach, idx) => {
            return m("", {
              style: {
                position: "relative",
                width: /\.(jpg|jpeg|png|gif|webp)$/i.test(attach.url) ? `${getSize(16)}rem` : "auto",
                minWidth: `${getSize(16)}rem`,
                height: `${getSize(16)}rem`,
                display: "flex",
                alignItems: "center",
                padding: 0,
                background: getColor('gray_9').back + 'a0',
                borderRadius: `${getSize(8)}rem`,
                border: `${getSize(0.25)}rem solid ${getColor('main').back}`,
                cursor: "pointer"
              },
              onclick: () => chatData.quoteAttachId(attach.id)
            }, [
              /\.(jpg|jpeg|png|gif|webp)$/i.test(attach.url)
                ? m("img", {
                  src: attach.url,
                  title: trs("输入栏/提示/点击引用附件", { cn: "点击插入附件到光标位置", en: "Click to insert attachment at cursor" }),
                  style: {
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: `${getSize(8)}rem`,
                    display: "block"
                  }
                })
                : m("div", {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: `${getSize(1)}rem`,
                    margin: `0 ${getSize(2)}rem`,
                    color: getColor('gray_8').front,
                    maxWidth: `${getSize(38)}rem` // 限制下过长的文件名
                  }
                }, [
                  m.trust(window.iconPark.getIcon("Paperclip", { fill: getColor('gray_7').front, size: `${getSize(4)}rem` })),
                  m("span", {
                    style: {
                      fontSize: `${getSize(3)}rem`,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }
                  }, attach.id)
                ]),

              // 进度条叠加层
              attach.status === 'uploading' ? m("", {
                style: {
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  background: "rgba(0,0,0,0.6)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1
                }
              }, [
                m("", {
                  style: {
                    width: "80%",
                    height: `${getSize(1)}rem`,
                    background: getColor('gray_11').back,
                    borderRadius: `${getSize(1)}rem`,
                    overflow: "hidden",
                    marginBottom: `${getSize(1 / 2)}rem`
                  }
                }, [
                  m("", {
                    style: {
                      width: `${attach.progress || 0}%`,
                      height: "100%",
                      background: getColor('pink_1').back,
                      transition: "width 0.2s ease"
                    }
                  })
                ]),
                m("span", { style: { fontSize: `${getSize(3)}rem`, color: "#fff" } }, `${attach.progress || 0}%`)
              ]) : null,


              m("", {
                style: {
                  position: "absolute",
                  top: `-${getSize(2)}rem`,
                  right: `-${getSize(2)}rem`,
                  background: getColor('pink_1').back,
                  color: "#fff",
                  borderRadius: "50%",
                  width: `${getSize(3)}rem`,
                  height: `${getSize(3)}rem`,
                  fontSize: `${getSize(3)}rem`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0,0,0,0.5)`,
                  zIndex: 2
                },
                onclick: async (e) => {
                  e.stopPropagation(); // 阻止冒泡

                  // 如果正在上传，中止请求
                  if (attach.xhr && attach.status === 'uploading') {
                    attach.xhr.abort();
                  }

                  // 如果已经上传成功，调用后端接口物理删除
                  if (attach.status === 'done' || !attach.status) {
                    try {
                      await m.request({
                        url: `/api/attachments/del`,
                        method: "POST",
                        body: { id: attach.id }
                      });
                    } catch (err) {
                      console.error("物理删除附件失败:", err);
                    }
                  }

                  // 从文本框中移除对应的引用标签
                  const quoteTxt = ` [attachid:${attach.id}] `;
                  const newText = targetSession.inputText.includes(quoteTxt) ? targetSession.inputText.replace(quoteTxt, "") : targetSession.inputText.replace(`[attachid:${attach.id}]`, "");
                  if (editorInstance) editorInstance.setText(newText);

                  attachments.splice(idx, 1);
                  m.redraw();
                }
              }, "×")
            ])
          })) : null,
        //引用
        targetSession.quotes.length > 0 ?
          m(Box,
            {
              style: {
                margin: `${getSize(3)}rem 0 0 0`,
                padding: 0,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap"
              }
            },
            [
              targetSession.quotes.map((quote) => {
                return m(IconTag, {
                  iconName: "Quote",
                  bgColor: getColor('yellow_1').back,
                  fgColor: getColor('yellow_1').front,
                  ext: {
                    async onclick() {
                      targetSession.quotes = targetSession.quotes.filter((quote2) => { return quote2.uuid !== quote.uuid });
                    }
                  }
                }, (quote.uuid + "").slice(0, 7)) //引用
              })
            ]
          ) : null,
        m("form",
          {
            onsubmit: (e) => e.preventDefault(),
            style: {
              display: "flex",
              marginTop: `${getSize(3)}rem`
            }
          },
          [
          m(ChatInputEditor, {
            listId: targetChatListId,
            onReady: (inst) => { editorInstance = inst },
            placeholder: session.lockedListId ? trs("输入栏/占位符/已锁定队列", { cn: `已锁定到队列 ${session.lockedListId} ...`, en: `Locked to queue ${session.lockedListId}...` }) : trs("输入栏/占位符/输入消息", { cn: "输入消息...", en: "Type a message..." }),
            onsubmit: (e) => submitFn(e, listId),
            style: {
              width: "100%",
              flex: 1,
              minHeight: `${getSize(20)}rem`,
              maxHeight: `${getSize(50)}rem`,
              boxSizing: "border-box",
              background: session.lockedListId ? getColor('pink_2').back + '99' : getColor('brown_4').back + '99',
              //border: `${getSize(0.25)}rem solid ${getColor('main').back}`,
              color: session.lockedListId ? getColor('pink_2').front : getColor('brown_4').front,
              borderRadius: `${getSize(8)}rem`,
              padding: `${getSize(2)}rem ${getSize(5)}rem`,
            }
          })
        ]),

        // 工具栏（位于文本框下方）
        m("",
          {
            style: {
              display: "flex",
              margin: `${getSize(3)}rem 0 0 0`,
              flexWrap: "wrap",
              gap: `${getSize(1)}rem`,
              alignItems: "center"
            }
          },
          [
            // 1. 最左侧：+ 号快捷命令按钮（纯图标、正圆形）
            m(IconTag,
              {
                iconName: "Plus",
                bgColor: getColor("main").back,
                fgColor: getColor("main").front,
                iconConfig: { size: `${getSize(5)}rem` },
                styleExt: {
                  margin: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  padding: `${getSize(2)}rem`,
                  borderRadius: "50%",
                  justifyContent: "center",
                  aspectRatio: "1 / 1"
                },
                ext: {
                  title: trs("输入栏/按钮/快捷命令", {
                    cn: "快捷命令与附件",
                    en: "Commands & Attachments"
                  }),
                  onpointerdown: (e) => {
                    if (e.pointerType !== "touch") {
                      e.preventDefault()
                    }
                  },
                  onclick: () => {
                    if (editorInstance && typeof editorInstance.openSlashMenu === "function") {
                      editorInstance.openSlashMenu()
                    }
                  }
                }
              }
            ),

            // 2. 智能体（模型）选择 + 终端连体胶囊
            m("",
              {
                style: {
                  display: "inline-flex",
                  alignItems: "center"
                }
              },
              [
                m(IconTag,
                  {
                    bgColor: getColor("gray_2").back,
                    fgColor: getColor("gray_2").front,
                    iconName: "RobotOne",
                    styleExt: {
                      position: "relative",
                      margin: 0,
                      marginLeft: 0,
                      marginRight: 0,
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0
                    },
                    ext: {
                      onclick: () => {
                        Notice.launch({
                          sign: "switch_model_dialog_" + targetChatListId,
                          tip: trs("输入栏/提示/选择与管理模型", {
                            cn: "选择与切换模型",
                            en: "Select & Switch Model"
                          }),
                          content: ChatModelSelector,
                          contentAttrs: {
                            targetChatListId,
                            targetSession,
                            updateListSession
                          }
                        })
                      }
                    }
                  },
                  [
                    m("span",
                      {
                        style: {
                          marginRight: `${getSize(1 / 2)}rem`,
                          maxWidth: `${getSize(20)}rem`,
                          display: "inline-block",
                          verticalAlign: "bottom",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: `${getSize(3)}rem`
                        }
                      },
                      [
                        (settingData.options.get("ai_aiList")?.find((item) => item.id === targetSession.currentModelId)?.name) || trs("输入栏/占位符/请选择模型", {
                          cn: "请选择模型",
                          en: "Select Model"
                        })
                      ]
                    ),
                    m.trust(window.iconPark.getIcon("Down", {
                      fill: getColor("yellow_1").front,
                      size: `${getSize(4)}rem`
                    }))
                  ]
                ),

                m(IconTag,
                  {
                    iconName: "Terminal",
                    bgColor: getColor("gray_2").back,
                    fgColor: getColor("gray_2").front,
                    styleExt: {
                      margin: 0,
                      marginLeft: 0,
                      marginRight: 0,
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      justifyContent: "center"
                    },
                    ext: {
                      title: trs("输入栏/按钮/终端", {
                        cn: "终端",
                        en: "Terminal"
                      }),
                      onclick: async () => {
                        try {
                          await settingData.fnCall("appLaunch", ["terminal"])
                        } catch (err) {
                          console.error("[ChatInputBar] 打开终端失败:", err)
                        }
                      }
                    }
                  }
                )
              ]
            ),

            // 3. 设置按钮（纯图标、正圆形）
            m(IconTag,
              {
                iconName: "Setting",
                bgColor: getColor("gray_2").back,
                fgColor: getColor("gray_2").front,
                styleExt: {
                  margin: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  padding: `${getSize(1)}rem`,
                  borderRadius: "50%",
                  justifyContent: "center",
                  aspectRatio: "1 / 1"
                },
                ext: {
                  title: trs("输入栏/按钮/设置", {
                    cn: "设置",
                    en: "Settings"
                  }),
                  onclick: () => {
                    Notice.launch({
                      tip: trs("输入栏/提示/设置中心", {
                        cn: "设置中心",
                        en: "Settings"
                      }),
                      content: Setting
                    })
                  }
                }
              }
            ),

            // 4. 更多按钮（纯图标、正圆形）
            m(IconTag,
              {
                iconName: "More",
                bgColor: targetSession.thinkControl ? getColor("yellow_1").back : getColor("gray_2").back,
                fgColor: targetSession.thinkControl ? getColor("yellow_1").front : getColor("gray_2").front,
                styleExt: {
                  margin: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  padding: `${getSize(1)}rem`,
                  borderRadius: "50%",
                  justifyContent: "center",
                  aspectRatio: "1 / 1"
                },
                ext: {
                  title: trs("输入栏/按钮/更多", {
                    cn: "更多",
                    en: "More"
                  }),
                  onclick: () => {
                    Notice.launch({
                      sign: "chat_send_params_modal_" + targetChatListId,
                      tip: trs("输入栏/提示/更多参数配置", {
                        cn: "更多参数配置",
                        en: "More Parameters"
                      }),
                      content: ChatSendParams,
                      contentAttrs: {
                        targetChatListId,
                        targetSession,
                        updateListSession
                      }
                    })
                  }
                }
              }
            ),

            /* 压缩按钮（暂注释）
            m(Tag, {
              color: "gray_2",
              styleExt: {
                margin: 0,
                marginLeft: 0,
                marginRight: 0,
                padding: `${getSize(1 / 2)}rem ${getSize(2)}rem`,
                justifyContent: "center",
                alignItems: "center",
                display: "flex"
              }
            }, [
              m(Box, {
                color: "main",
                isSwitch: true,
                value: targetSession.tokenCompressSwitch,
                style: {
                  margin: "0",
                  marginRight: `${getSize(1)}rem`
                },
                onbeforeupdate(vnode) {
                  vnode.state.data.value = targetSession.tokenCompressSwitch
                },
                onclick: async (el, e, v, box_this) => {
                  await updateListSession(targetChatListId, { tokenCompressSwitch: !targetSession.tokenCompressSwitch })
                }
              }),
              trs("输入栏/按钮/压缩", { cn: "压缩", en: "Compress" })
            ]),
            */

            /* 模式切换按钮（暂注释）
            m(IconTag, {
              iconName: "MagicWand",
              bgColor: getColor('main').back,
              fgColor: getColor('main').front,
              styleExt: {
                margin: 0,
                marginLeft: 0,
                marginRight: 0,
                position: "relative",
              },
              ext: {
                onclick: async (e) => {
                  e.stopPropagation()
                  Notice.launch({
                    tip: trs("输入栏/模式/配置标题", { cn: "工作模式配置", en: "Work Mode Settings" }),
                    content: ChatToolModeModal,
                    contentAttrs: {
                      targetChatListId,
                      targetSession,
                      updateListSession
                    }
                  })
                }
              }

            }, [
              m("span", {
                style: {
                  marginRight: `${getSize(1 / 2)}rem`,
                  display: "inline-block",
                  verticalAlign: "bottom",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: `${getSize(3)}rem`
                }
              }, [
                targetSession.toolsMode === 1
                  ? trs("输入栏/模式/提示词", { cn: "提示词模式", en: "Prompt" }) : null,
                targetSession.toolsMode === 2
                  ? trs("输入栏/模式/标准工具", { cn: "标准工具模式", en: "Standard" }) : null,
                targetSession.toolsMode === 3
                  ? trs("输入栏/模式/宅喵工具", { cn: "宅喵工具模式", en: "OwO Tools" }) : null,
                targetSession.toolsMode === 4
                  ? trs("输入栏/模式/原生外壳", { cn: "原生外壳模式", en: "Native Wrapper" }) : null,
                targetSession.toolsMode === 5
                  ? trs("输入栏/模式/编程模式", { cn: "编程模式", en: "Coding Mode" }) : null,
              ]),
              m.trust(window.iconPark.getIcon("Down", { size: `${getSize(4)}rem` }))
            ]),
            */

            // 回复
            session.call
              ? m(IconTag,
                  {
                    iconName: "Message",
                    bgColor: getColor("yellow_1").back,
                    fgColor: getColor("yellow_1").front,
                    styleExt: {
                      margin: 0,
                      marginLeft: 0,
                      marginRight: 0
                    },
                    ext: {
                      onclick: async () => {
                        session.call = null
                      }
                    }
                  },
                  [
                    (session.call.uuid + "").slice(0, 7)
                  ]
                )
              : null,

            m("input", {
              type: "file",
              multiple: true,
              style: {
                display: "none"
              },
              oncreate: (v) => {
                attachInputDom = v.dom
              },
              onremove: () => {
                attachInputDom = null
              },
              onchange: (e) => uploadAttachment(e)
            }),

            // 6. 最右侧：灰色大胶囊三段式（下拉箭头 | 回复中黄色正圆暂停 | 粉色正圆发送）
            m("",
              {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: `${getSize(1 / 2)}rem`,
                  marginLeft: "auto",
                  padding: `${getSize(1)}rem`,
                  background: getColor("gray_2").back,
                  borderRadius: `${getSize(8)}rem`
                }
              },
              [
                m(IconTag,
                  {
                    iconName: "Down",
                    bgColor: "transparent",
                    fgColor: getColor("gray_2").front,
                    iconConfig: {
                      size: `${getSize(4)}rem`
                    },
                    styleExt: {
                      margin: 0,
                      marginLeft: 0,
                      marginRight: 0,
                      padding: `${getSize(1)}rem`,
                      borderRadius: "50%",
                      justifyContent: "center",
                      aspectRatio: "1 / 1"
                    },
                    ext: {
                      title: trs("输入栏/提示/发送设置", {
                        cn: "发送模式设置",
                        en: "Send Settings"
                      }),
                      onclick: async () => {
                        try {
                          const ChatSendMenu = (await import("./ChatSendMenu.js")).default
                          Notice.launch({
                            sign: "send_menu_dialog_" + targetChatListId,
                            tip: trs("输入栏/提示/发送设置", {
                              cn: "发送模式设置",
                              en: "Send Settings"
                            }),
                            content: ChatSendMenu,
                            contentAttrs: {
                              targetChatListId,
                              targetSession,
                              updateListSession
                            }
                          })
                        } catch (err) {
                          console.error("[ChatInputBar] 打开发送设置失败:", err)
                        }
                      }
                    }
                  }
                ),

                (() => {
                  const targetList = comData.getChatList(targetChatListId)
                  return targetList?.replying
                    ? m(IconTag,
                        {
                          iconName: "PauseOne",
                          bgColor: getColor("yellow_1").back,
                          fgColor: getColor("yellow_1").front,
                          iconConfig: {
                            size: `${getSize(5)}rem`
                          },
                          styleExt: {
                            margin: 0,
                            marginLeft: 0,
                            marginRight: 0,
                            padding: `${getSize(2)}rem`,
                            borderRadius: "50%",
                            justifyContent: "center",
                            aspectRatio: "1 / 1"
                          },
                          ext: {
                            title: trs("聊天界面/词汇/暂停", {
                              cn: "暂停",
                              en: "Pause"
                            }),
                            onclick: async () => {
                              try {
                                const tmp = await settingData.fnCall("stopAiAsk", [targetChatListId])
                                Tip.launch(tmp.msg, 1500)
                              } catch (err) {
                                console.error("[ChatInputBar] 暂停 AI 回复失败:", err)
                              }
                            }
                          }
                        }
                      )
                    : null
                })(),

                m(IconTag,
                  {
                    iconName: "Send",
                    bgColor: getColor("pink_1").back,
                    fgColor: getColor("pink_1").front,
                    iconConfig: {
                      size: `${getSize(5)}rem`
                    },
                    styleExt: {
                      margin: 0,
                      marginLeft: 0,
                      marginRight: 0,
                      padding: `${getSize(2)}rem`,
                      borderRadius: "50%",
                      justifyContent: "center",
                      aspectRatio: "1 / 1"
                    },
                    ext: {
                      title: trs("输入栏/按钮/发送", {
                        cn: "发送",
                        en: "Send"
                      }),
                      onclick: (e) => submitFn(e, listId)
                    }
                  }
                )
              ]
            )
          ]
        )
      ])
    }
  }
}