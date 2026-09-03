import chatData from "./chatData.js"
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
import ChatInputEditor from "./ChatInputEditor.js"
import ChatCwdConfig from "./ChatCwdConfig.js"
import debugHistory from "../../historyPanel/historyPanelData.js"
import HelpMenu from "../common/HelpMenu.js"
import getColor from "../common/getColor.js"
import ChatModelSelector from "./ChatModelSelector.js"
import ChatSendParams from "./ChatSendParams.js"

const updateListSession = async (listId, updates) => {
  chatData.initSessionState(listId, updates);
  const res = await settingData.fnCall("updateListConfig", [listId, updates]);
  m.redraw();
  return res;
}

export default () => {
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

    const trimmedInput = chatData.inputText.trim()
    if (trimmedInput) {
      chatData.saveHistory(trimmedInput)
    }

    const hasStageExt = targetSession.workStage && targetSession.workStage !== '无附加';

    // 空消息拦截：无文本、无附件、无引用时，禁止发送 (如果有附带阶段指令则放行)
    if (!trimmedInput && !hasStageExt && (!session.attachments || session.attachments.length === 0) && (!session.quotes || session.quotes.length === 0)) {
      return;
    }

    chatData.preparing = true

    // Retrieve routing context

    let currentInput = chatData.inputText;

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
      ...session,
      inputText: currentInput,
      targetChatListId: targetChatListId,
    };

    console.log("发送的payload", payload)

    session.call = null;
    session.quotes = [];

    // 发送前立即清空前端状态并即时置底，提升响应速度
    chatData.inputText = ""
    session.attachments = [] // 发送后清空预览
    chatData.scrollChatListTobottom(targetChatListId) //滚动到底部

    session.unreadCount = 0
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

  const uploadAttachment = async (e, listId) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const session = chatData.getSessionState(listId);
    if (!session.attachments) session.attachments = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      // 创建一个带进度的占位对象
      const isImage = file.type.startsWith('image/');
      const attachObj = {
        id: file.name, // 临时使用文件名作为预览显示的 ID
        url: URL.createObjectURL(file), // 临时预览图
        type: isImage ? 'image' : 'file',
        progress: 0,
        status: 'uploading'
      };

      session.attachments.push(attachObj);
      const index = session.attachments.length - 1;

      try {
        const xhr = new XMLHttpRequest();
        attachObj.xhr = xhr; // 保存引用以便中止
        const uploadPromise = new Promise((resolve, reject) => {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              attachObj.progress = percent;
              m.redraw();
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error('Upload failed with status ' + xhr.status));
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));

          xhr.open('POST', `/api/attachments/set`);
          xhr.send(formData);
        });

        const res = await uploadPromise;

        if (res && res.id) {
          // 上传成功，更新正式数据
          attachObj.id = res.id;
          attachObj.url = res.url;
          attachObj.status = 'done';
          attachObj.progress = 100;
          chatData.quoteAttachId(res.id);
          m.redraw();
        }
      } catch (err) {
        console.error("上传附件失败:", err);
        attachObj.status = 'error';
        Notice.launch({ msg: "上传失败: " + err.message });
        m.redraw();
      }
    }
    // 清空 input 以便下次选择同一文件
    e.target.value = "";
  }

  let showToolsList = false
  let documentClickFn = null
  let documentClickFnTools = null

  let showThinkStrengthList = false
  let showThinkStrengthClickFn = null


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
      const attachments = session.attachments || []

      let showThinkStrength = targetSession.thinkControl && targetSession.enableThinking

      return m("", {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      }, [
        m("", {
          style: {
            display: "flex",
            margin: "1rem",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center"
          }
        }, [
          // 发送按钮胶囊组合
          m("div", {
            style: {
              display: "inline-flex",
              alignItems: "stretch"
            }
          }, [
            m(IconTag, {
              iconName: "Send",
              bgColor: getColor('pink_1').back,
              fgColor: getColor('pink_1').front,
              styleExt: {
                margin: 0,
                marginLeft: 0,
                marginRight: 0,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              },
              ext: {
                onclick: (e) => submitFn(e, listId)
              }
            }, trs("输入栏/按钮/发送", { cn: "发送", en: "Send" })),

            m(IconTag, {
              iconName: "Down",
              bgColor: getColor('pink_1').back,
              fgColor: getColor('pink_1').front,
              styleExt: {
                margin: 0,
                marginLeft: 0,
                marginRight: 0,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                paddingLeft: "0.5rem",
                paddingRight: "0.5rem",
                borderLeft: `1px solid ${getColor('pink_1').front}33`
              },
              ext: {
                onclick: async () => {
                  const ChatSendMenu = (await import("./ChatSendMenu.js")).default;
                  Notice.launch({
                    sign: "send_menu_dialog_" + targetChatListId,
                    tip: trs("输入栏/提示/发送设置", { cn: "发送模式设置", en: "Send Settings" }),
                    content: ChatSendMenu,
                    contentAttrs: {
                      targetChatListId,
                      targetSession,
                      updateListSession
                    }
                  })
                }
              }
            })
          ]),

          // 模型选择 + 终端 连体组合
          m("div", {
            style: {
              display: "inline-flex",
              alignItems: "center"
            }
          }, [
            m(IconTag, {
              bgColor: getColor('yellow_1').back,
              iconName: "RobotOne",
              styleExt: {
                position: "relative",
                margin: 0,
                marginLeft: 0,
                marginRight: 0,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              },
              ext: {
                onclick: () => {
                  Notice.launch({
                    sign: "switch_model_dialog_" + targetChatListId,
                    tip: trs("输入栏/提示/选择与管理模型", { cn: "选择与切换模型", en: "Select & Switch Model" }),
                    content: ChatModelSelector,
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
                  marginRight: "0.2rem",
                  maxWidth: "8rem",
                  display: "inline-block",
                  verticalAlign: "bottom",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }
              }, [
                (settingData.options.get("ai_aiList")?.find(m => m.id === targetSession.currentModelId)?.name) || "请选择模型"
              ]),
              m.trust(window.iconPark.getIcon("Down"))
            ]),

            m(IconTag, {
              iconName: "Terminal",
              bgColor: getColor('main').back,
              styleExt: {
                margin: 0,
                marginLeft: 0,
                marginRight: 0,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
              },
              ext: {
                onclick: async () => {
                  settingData.fnCall("appLaunch", ["terminal"])
                }
              }
            }, trs("输入栏/按钮/终端", { cn: "终端", en: "Terminal" }))
          ]),

          m(IconTag, {
            iconName: "Setting",
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
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
            color: "gray_2",
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0,
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
                marginRight: "0.5rem"
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

          // 思考控制与强度组合
          m("div", {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem"
            }
          }, [
            // 单独美化复选框为小圆点
            m("div", {
              title: trs("输入栏/提示/思考控制", { cn: "思考控制: 只有勾选后，深度思考字段才会传给模型", en: "Think Control: Only when checked, enableThinking field will be sent to AI" }),
              style: {
                display: "inline-block",
                verticalAlign: "middle",
                width: "1.2rem",
                height: "1.2rem",
                borderRadius: "50%",
                background: targetSession.thinkControl ? getColor('yellow_1').back : getColor('gray_8').back,
                margin: 0,
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: targetSession.thinkControl ? `0 0 0.5rem ${getColor('yellow_1').back}` : "none",
                border: `0.1rem solid ${getColor('gray_4').front}55`,
              },
              onclick: async (e) => {
                await updateListSession(targetChatListId, { thinkControl: !targetSession.thinkControl })
              }
            }),

            m("div", {
              style: {
                display: "inline-flex",
                alignItems: "center"
              }
            }, [
              m(IconTag, {
                iconName: "Brain",
                bgColor: targetSession.thinkControl
                  ? (targetSession.enableThinking ? getColor('yellow_1').back : getColor('gray_2').back)
                  : getColor('gray_4').back,
                fgColor: targetSession.thinkControl
                  ? (targetSession.enableThinking ? getColor('yellow_1').front : getColor('gray_2').front)
                  : getColor('gray_4').front,
                styleExt: {
                  margin: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  opacity: targetSession.thinkControl ? 1 : 0.5,
                  cursor: targetSession.thinkControl ? "pointer" : "not-allowed",
                  ...(showThinkStrength ? {
                    borderRadius: "10rem 0 0 10rem"
                  } : null)
                },
                ext: {
                  onclick: async () => {
                    if (!targetSession.thinkControl) return
                    await updateListSession(targetChatListId, { enableThinking: !targetSession.enableThinking })
                  }
                }
              }, trs("输入栏/按钮/思考", { cn: "思考", en: "Thinking" })),

              showThinkStrength
                ? m(IconTag, {
                  iconName: "SignalStrength",
                  bgColor: getColor('gray_2').back,
                  fgColor: getColor('gray_2').front,
                  styleExt: {
                    margin: 0,
                    marginLeft: 0,
                    marginRight: 0,
                    borderRadius: "0 10rem 10rem 0",
                    position: "relative",
                  },
                  ext: {
                    onclick: (e) => {
                      e.stopPropagation()
                      showThinkStrengthList = !showThinkStrengthList
                      if (showThinkStrengthList) {
                        showThinkStrengthClickFn = function () {
                          showThinkStrengthList = false
                          m.redraw()
                          document.removeEventListener("click", showThinkStrengthClickFn)
                        }
                        document.addEventListener("click", showThinkStrengthClickFn, {
                          passive: false,
                        })
                      }
                    },
                  }
                }, [
                  m("span", {
                    style: {
                      marginLeft: "0.2rem",
                      marginRight: "0.2rem",
                      fontSize: "1.2rem",
                      verticalAlign: "middle"
                    }
                  }, [
                    trs("输入栏/配置/强度", {
                      cn: "强度",
                      en: "Strength"
                    }) + ({ low: 1, medium: 2, high: 3 }[targetSession.thinkStrength] || 2),
                  ]),
                  m.trust(window.iconPark.getIcon("Down")),

                  showThinkStrengthList
                    ? m("", {
                      style: {
                        position: "absolute",
                        top: "1.5rem",
                        right: "-0.5rem",
                        background: getColor('gray_4').back,
                        color: getColor('gray_4').front,
                        padding: "0.2rem 1rem",
                        borderRadius: "0.5rem",
                        display: "flex",
                        flexDirection: "column",
                        zIndex: 10,
                      }
                    }, [
                      [{ level: "low", num: 1 }, { level: "medium", num: 2 }, { level: "high", num: 3 }].map((v) => {
                        const isActive = (targetSession.thinkStrength || "medium") === v.level
                        return m(Tag, {
                          isBtn: true,
                          ext: {
                            onclick: async (e) => {
                              e.stopPropagation()
                              await updateListSession(targetChatListId, { thinkStrength: v.level })
                              chatData.inputDom.focus()
                              showThinkStrengthList = false
                            },
                          },
                          styleExt: {
                            minWidth: "10rem",
                            padding: 0,
                            margin: 0,
                            background: "transparent",
                            color: isActive ? getColor('main').back : getColor('gray_4').front,
                            borderBottom: `0.2rem solid ${getColor('main').back}`,
                            borderRadius: "0",
                            textAlign: "left"
                          }
                        }, trs("输入栏/配置/强度", {
                          cn: "强度",
                          en: "Strength"
                        }) + v.num)
                      }),
                    ])
                    : null
                ]) : null
            ])
          ]),

          m(IconTag, {
            iconName: "MagicWand",
            bgColor: getColor('main').back,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0,
              position: "relative",
            },
            ext: {
              onclick: async (e) => {
                e.stopPropagation()
                showToolsList = !showToolsList
                if (showToolsList) {
                  document.addEventListener("click", documentClickFnTools = () => {
                    showToolsList = false
                    m.redraw()
                    document.removeEventListener("click", documentClickFnTools)
                  })
                }
              }
            }

          }, [
            m("span", {
              style: {
                marginRight: "0.2rem",
                display: "inline-block",
                verticalAlign: "bottom",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "1.3rem"
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
            m.trust(window.iconPark.getIcon("Down")),

            showToolsList ? m("", {
              style: {
                position: "absolute",
                top: "1.5rem",
                left: "0",
                background: getColor('gray_4').back,
                color: getColor('gray_4').front,
                padding: "0.2rem 1rem",
                borderRadius: "0.5rem",
                display: "flex",
                flexDirection: "column",
                zIndex: 10,
              }
            }, [
              [
                { id: 1, label: trs("输入栏/模式/提示词/名称", { cn: "提示词模式", en: "Prompt" }) },
                { id: 2, label: trs("输入栏/模式/标准工具/名称", { cn: "标准工具模式", en: "Standard" }) },
                { id: 3, label: trs("输入栏/模式/宅喵工具/名称", { cn: "宅喵工具模式", en: "OwO Tools" }) },
                { id: 4, label: trs("输入栏/模式/原生外壳/名称", { cn: "原生外壳模式", en: "Native Wrapper" }) },
                { id: 5, label: trs("输入栏/模式/编程模式/名称", { cn: "编程模式", en: "Coding Mode" }) }
              ].map((mode) => {
                const isActive = targetSession.toolsMode === mode.id
                return m(Tag, {
                  isBtn: true,
                  ext: {
                    onclick: async (e) => {
                      e.stopPropagation()
                      await updateListSession(targetChatListId, { toolsMode: mode.id })
                      showToolsList = false
                    },
                  },
                  styleExt: {
                    minWidth: "10rem",
                    padding: 0,
                    margin: 0,
                    background: "transparent",
                    color: isActive ? getColor('main').back : getColor('gray_4').front,
                    borderBottom: `0.2rem solid ${getColor('main').back}`,
                    borderRadius: "0",
                  }
                }, mode.label)
              }),

            ]) : null,
          ]),

          m(IconTag, {
            iconName: "Help",
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
            ext: {
              onclick: async () => {
                Notice.launch({
                  content: HelpMenu
                })
              }
            }
          }, ""),

          //回复
          session.call ?
            m(IconTag, {
              iconName: "Message",
              bgColor: getColor('yellow_1').back,
              fgColor: getColor('yellow_1').front,
              styleExt: {
                margin: 0,
                marginLeft: 0,
                marginRight: 0
              },
              ext: {
                onclick: async () => {
                  session.call = null;
                },
              },
            }, [
              (session.call.uuid + "").slice(0, 7) //回复
            ]) : null,

          (() => {
            const targetList = comData.getChatList(targetChatListId);
            return targetList?.replying ?
              m(IconTag, {
                iconName: "PauseOne",
                bgColor: getColor('gray_2').back,
                fgColor: getColor('gray_2').front,
                styleExt: {
                  margin: 0,
                  marginLeft: 0,
                  marginRight: 0
                },
                ext: {
                  onclick: async () => {
                    try {
                      let tmp = await settingData.fnCall("stopAiAsk", [targetChatListId])


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
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
            ext: {
              onclick: async () => {
                settingData.fnCall("appLaunch", ["browser", { data: { url: "https://iw-i.com" } }])
              }
            }
          }, trs("聊天界面/词汇/反馈")),

          m(IconTag, {
            iconName: "ApplicationMenu",
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
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

          m(IconTag, {
            iconName: "FolderOpen",
            bgColor: targetSession.workDirs.find(item => item.type === "main") ? getColor('yellow_1').back : getColor('gray_2').back,
            fgColor: targetSession.workDirs.find(item => item.type === "main") ? getColor('gray_8').front : getColor('gray_2').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
            ext: {
              onclick: () => {
                Notice.launch({
                  group: "chatCwdConfig",
                  hideBtn: 2,
                  tip: trs("工作目录/配置", { cn: "工作目录配置", en: "Working Directory" }),
                  content: ChatCwdConfig,
                  contentAttrs: { listId: targetChatListId }
                })
              }
            }
          }, targetSession.workDirs.find(item => item.type === "main")?.path.split(/[/\\]/).pop() || trs("聊天界面/词汇/工作目录")),

          // --- 备份状态指示器 ---
          targetSession.workDirs.find(item => item.type === "main") ? m(IconTag, {
            iconName: targetSession.tmStatus.isReady ? "History" : "FileLock",
            bgColor: targetSession.tmStatus.isReady ? getColor('green_1').back : getColor('red_1').back,
            fgColor: targetSession.tmStatus.isReady ? getColor('green_1').front : getColor('red_1').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
            ext: {
              onclick: async () => {
                const mainDir = targetSession.workDirs.find(item => item.type === "main")?.path
                if (!mainDir) return;
                if (!targetSession.tmStatus.isReady) {
                  Notice.launch({
                    tip: "立即初始化备份",
                    msg: "该目录尚未初始化时光机备份，是否立即创建喵？",
                    async confirm() {
                      const initRes = await settingData.fnCall("tmInit", [mainDir]);
                      Notice.launch({ msg: initRes.msg });
                      chatData.updateTmStatus(targetChatListId);
                      return undefined
                    }
                  });
                } else {
                  // 立即用当前队列主工作目录打开时光机备份
                  await settingData.fnCall("appLaunch", ["owoTimeMachine", { data: { repoPath: `${mainDir}/.owoTimeMachine` } }]);
                }
              }
            }
          }, "") : null,

          // 附件上传按钮
          m(IconTag, {
            iconName: "Paperclip",
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
            ext: {
              onclick: () => {
                document.getElementById('attachInput').click()
              }
            }
          }, trs("输入栏/按钮/附件", { cn: "附件", en: "Attach" })),

          m("input#attachInput", {
            type: "file",
            multiple: true,
            // accept: "image/*", // 解除限制，允许所有类型
            style: { display: "none" },
            onchange: (e) => uploadAttachment(e, listId)
          }),

          m(IconTag, {
            iconName: "More",
            bgColor: targetSession.thinkControl ? getColor('yellow_1').back : getColor('gray_2').back,
            fgColor: targetSession.thinkControl ? getColor('yellow_1').front : getColor('gray_2').front,
            styleExt: {
              margin: 0,
              marginLeft: 0,
              marginRight: 0
            },
            ext: {
              onclick: () => {
                Notice.launch({
                  sign: "chat_send_params_modal_" + targetChatListId,
                  tip: trs("输入栏/提示/更多参数配置", { cn: "更多参数配置", en: "More Parameters" }),
                  content: ChatSendParams,
                  contentAttrs: {
                    targetChatListId,
                    targetSession,
                    updateListSession
                  }
                })
              }
            }
          }, trs("输入栏/按钮/更多", { cn: "更多", en: "More" })),

        ]),

        // 附件预览区域
        attachments?.length > 0 ?
          m("", {
            style: {
              display: "flex",
              gap: "0.5rem",
              padding: "0.5rem",
              background: getColor('gray_8').back + '0a',
              borderRadius: "2rem",
              marginBottom: "0.5rem",
              flexWrap: "wrap"
            }
          }, attachments.map((attach, idx) => {
            return m("", {
              style: {
                position: "relative",
                // 让非图片可以横向拉伸一点，或者保持固定宽高？
                // 用户要求横排显示 icon + 文件名，所以宽度不应定死 4rem
                minWidth: "4rem",
                height: "4rem",
                display: "flex",
                alignItems: "center",
                padding: "0 0.5rem",
                background: getColor('gray_9').back + 'a0',
                borderRadius: "1rem",
                border: `0.1rem solid ${getColor('main').back}`,
                cursor: "pointer",
                // 暂时不 overflow hidden，防止叉叉被遮挡
                // overflow: "hidden"
              },
              onclick: () => chatData.quoteAttachId(attach.id)
            }, [
              /\.(jpg|jpeg|png|gif|webp)$/i.test(attach.url)
                ? m("img", {
                  src: attach.url,
                  title: trs("输入栏/提示/点击引用附件", { cn: "点击插入附件到光标位置", en: "Click to insert attachment at cursor" }),
                  style: {
                    width: "3rem",
                    height: "3rem",
                    objectFit: "cover",
                    borderRadius: "0.2rem",
                  }
                })
                : m("div", {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: getColor('gray_8').front,
                    maxWidth: "15rem" // 限制下过长的文件名
                  }
                }, [
                  m.trust(window.iconPark.getIcon("Paperclip", { fill: getColor('gray_7').front })),
                  m("span", {
                    style: {
                      fontSize: "0.8rem",
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
                    height: "0.4rem",
                    background: getColor('gray_11').back,
                    borderRadius: "0.2rem",
                    overflow: "hidden",
                    marginBottom: "0.2rem"
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
                m("span", { style: { fontSize: "0.6rem", color: "#fff" } }, `${attach.progress || 0}%`)
              ]) : null,


              m("", {
                style: {
                  position: "absolute",
                  top: "-0.6rem",
                  right: "-0.6rem",
                  background: getColor('pink_1').back,
                  color: "#fff",
                  borderRadius: "50%",
                  width: "1.2rem",
                  height: "1.2rem",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 0.1rem 0.3rem rgba(0,0,0,0.5)",
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
                  if (chatData.inputText.includes(quoteTxt)) {
                    chatData.inputText = chatData.inputText.replace(quoteTxt, "");
                  } else {
                    // 兼容可能没有空格的情况
                    chatData.inputText = chatData.inputText.replace(`[attachid:${attach.id}]`, "");
                  }

                  attachments.splice(idx, 1);
                  m.redraw();
                }
              }, "×")
            ])
          })) : null,
        //引用
        session.quotes?.length > 0 ?
          m(Box, {
            style: {
              margin: "1rem 0",
              padding: 0,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "0",
            }
          }, [
            session.quotes.map((quote) => {
              return m(IconTag, {
                iconName: "Quote",
                bgColor: getColor('yellow_1').back,
                fgColor: getColor('yellow_1').front,
                ext: {
                  async onclick() {
                    if (session.quotes) {
                      session.quotes = session.quotes.filter((quote2) => { return quote2.uuid !== quote.uuid });
                    }
                  }
                }
              }, (quote.uuid + "").slice(0, 7)) //引用
            })
          ]) : null,
        m("form", {
          onsubmit: (e) => e.preventDefault(),
          style: {
            display: "flex"
          }
        }, [
          m(ChatInputEditor, {
            placeholder: comData.data.get()?.targetChatListId ? trs("输入栏/占位符/已锁定队列", { cn: `已锁定到队列 ${comData.data.get()?.targetChatListId} ...`, en: `Locked to queue ${comData.data.get()?.targetChatListId}...` }) : trs("输入栏/占位符/输入消息", { cn: "输入消息...", en: "Type a message..." }),
            onsubmit: (e) => submitFn(e, listId),
            style: {
              width: "100%",
              flex: 1,
              minHeight: "8rem",
              maxHeight: "20rem",
              boxSizing: "border-box",
              background: comData.data.get()?.targetChatListId ? getColor('pink_2').back + '99' : getColor('brown_4').back + '99',
              border: `0.1rem solid ${getColor('main').back}`,
              color: comData.data.get()?.targetChatListId ? getColor('pink_2').front : getColor('brown_4').front,
              borderRadius: "3rem",
              padding: "1rem 2rem",
            }
          })
        ])
      ])
    }
  }
}