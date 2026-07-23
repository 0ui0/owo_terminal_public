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
import HelpMenu from "../common/HelpMenu.js"
import getColor from "../common/getColor.js"

export default () => {
  let _forcedListId = null // 若非 null，则锁定发送目标（用于子智能体独立窗口）


  const submitFn = async (e) => {
    e.preventDefault()

    const currentData = comData.data.get()
    const sendMode = currentData?.sendMode
    const targetChatListId = _forcedListId !== null ? _forcedListId : (currentData?.targetChatListId)

    // 如果不是发给子智能体，且未选择任何有效 AI 模型，拦截并给出提示
    if (!targetChatListId) {
      const enabledModels = settingData.options.get("ai_aiList")?.filter(m => m.switch)
      const hasValidModel = enabledModels.some(m => m.name === currentData?.currentModel)
      if (!hasValidModel) {
        Notice.launch({
          msg: trs("输入栏/提示/请选择模型", { cn: "请在下拉菜单中选择一个模型喵！", en: "Please select a model from the dropdown menu!" }),
          type: "info"
        })
        return
      }
    }

    // 时光机预警：如果指定了目录但未开启备份
    if (currentData?.customCwd && !chatData.tmStatus.isReady) {
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

    chatData.preparing = true

    // Retrieve routing context (forcedListId 优先于全局)

    await comData.data.edit((data_) => {
      data_.inputText = chatData.inputText
    })

    // Send with routing info
    ioSocket.socket.emit("chat", {
      targetChatListId: targetChatListId,
      attachments: chatData.attachmentsMap[targetChatListId] || [] // 加入附件元数据
    })

    await comData.data.edit((data_) => {
      data_.inputText = ""
    })
    chatData.inputText = ""
    chatData.attachmentsMap[targetChatListId] = [] // 发送后清空预览
  }

  // 上传附件逻辑
  const uploadAttachment = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const targetChatListId = _forcedListId !== null ? _forcedListId : (comData.data.get()?.targetChatListId || 0);
    if (!chatData.attachmentsMap[targetChatListId]) chatData.attachmentsMap[targetChatListId] = [];

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

      chatData.attachmentsMap[targetChatListId].push(attachObj);
      const index = chatData.attachmentsMap[targetChatListId].length - 1;

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

  let showAiList = false
  let showToolsList = false
  let documentClickFn = null
  let documentClickFnTools = null

  let showThinkStrengthList = false
  let showThinkStrengthClickFn = null


  return {
    async oninit() {
      try {
        await settingData.options.pull()
        chatData.updateTmStatus() // 初始获取时光机状态
      }
      catch (err) {
        throw err
      }
    },
    view({ attrs }) {
      // 更新强制 listId（来自子智能体窗口等外部调用方）
      _forcedListId = attrs?.forcedListId !== undefined ? attrs.forcedListId : null
      const targetChatListId = _forcedListId !== null ? _forcedListId : (comData.data.get()?.targetChatListId || 0)
      const attachments = chatData.attachmentsMap[targetChatListId] || []

      let showThinkStrength = comData.data.get()?.thinkControl && comData.data.get()?.enableThinking


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
            gap: "0.5rem 0",
            alignItems: "center"
          }
        }, [
          m(IconTag, {
            iconName: "Send",
            bgColor: getColor('pink_1').back,
            fgColor: getColor('pink_1').front,
            styleExt: {
              marginRight: "0.5rem",
            },
            ext: {
              onclick: submitFn
            }
          }, trs("输入栏/按钮/发送", { cn: "发送", en: "Send" })),

          m(IconTag, {
            bgColor: comData.data.get()?.sendMode === "agent" ? getColor('yellow_1').back : getColor('main').back,
            //fgColor: comData.data.get()?.sendMode === "agent" ? getColor('yellow_1').front : getColor('main').front,

            iconName: "RobotOne",
            styleExt: {
              position: "relative",
              marginRight: 0,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
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
              comData.data.get()?.currentModel || "ai"
            ]),
            m.trust(window.iconPark.getIcon("Down")),

            showAiList ? m("", {
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
                maxHeight: "10rem",
                overflowY: "auto"
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
                      chatData.inputDom.focus()

                    },
                  },
                  styleExt: {
                    minWidth: "10rem",
                    padding: 0,
                    margin: 0,
                    background: "transparent",
                    color: getColor('gray_4').front,
                    borderBottom: `0.2rem solid ${getColor('main').back}`,
                    borderRadius: "0",
                    fontSize: "1.3rem"
                  }
                }, model.name.slice(0, 10))
              }),

            ]) : null,

          ]),

          m(IconTag, {
            iconName: "Terminal",
            bgColor: getColor('main').back,
            styleExt: {
              marginLeft: 0,
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
            },
            ext: {
              onclick: async () => {
                settingData.fnCall("appLaunch", ["terminal"])
              }
            }
          }, trs("输入栏/按钮/终端", { cn: "终端", en: "Terminal" })),






          m(IconTag, {
            iconName: "Setting",
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
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
              marginLeft: "0",
              justifyContent: "center",
              alignItems: "center",
              display: "flex"
            }
          }, [

            m(Box, {
              color: "main",
              isSwitch: true,
              value: comData.data.get()?.tokenCompressSwitch,
              style: {
                margin: "0",
                marginRight: "0.5rem"
              },
              onclick: async (el, e, v, box_this) => {
                await comData.data.edit((data) => {
                  data.tokenCompressSwitch = box_this.data.value
                })
              }
            }),


            trs("输入栏/按钮/压缩", { cn: "压缩", en: "Compress" })
          ]),


          // 单独美化复选框为小圆点，增加 flex 确保对齐
          m("div", {
            title: trs("输入栏/提示/思考控制", { cn: "思考控制: 只有勾选后，深度思考字段才会传给模型", en: "Think Control: Only when checked, enableThinking field will be sent to AI" }),
            style: {
              display: "inline-block",
              verticalAlign: "middle", // 垂直对齐核心
              width: "1.2rem",
              height: "1.2rem",
              borderRadius: "50%",
              background: comData.data.get()?.thinkControl ? getColor('yellow_1').back : getColor('gray_8').back,
              marginRight: "0.5rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: comData.data.get()?.thinkControl ? `0 0 0.5rem ${getColor('yellow_1').back}` : "none",
              border: `0.1rem solid ${getColor('gray_4').front}55`,
            },
            onclick: async (e) => {
              await comData.data.edit((data) => {
                data.thinkControl = !comData.data.get()?.thinkControl
              })
              m.redraw()
            }
          }),


          m(IconTag, {
            iconName: "Brain",
            bgColor: comData.data.get()?.thinkControl
              ? (comData.data.get()?.enableThinking ? getColor('yellow_1').back : getColor('gray_2').back)
              : getColor('gray_4').back,
            fgColor: comData.data.get()?.thinkControl
              ? (comData.data.get()?.enableThinking ? getColor('yellow_1').front : getColor('gray_2').front)
              : getColor('gray_4').front,
            styleExt: {
              opacity: comData.data.get()?.thinkControl ? 1 : 0.5,
              cursor: comData.data.get()?.thinkControl ? "pointer" : "not-allowed",

              ...(showThinkStrength ? {
                borderRadius: "10rem 0 0 10rem",
                marginRight: "0",
              } : null)
            },
            ext: {
              onclick: async () => {
                if (!comData.data.get()?.thinkControl) return
                await comData.data.edit((data) => {
                  data.enableThinking = !data.enableThinking
                })
              }
            }
          }, trs("输入栏/按钮/思考", { cn: "思考", en: "Thinking" })),

          showThinkStrength
            ? m(IconTag, {
              iconName: "SignalStrength",
              bgColor: getColor('gray_2').back,
              fgColor: getColor('gray_2').front,
              styleExt: {
                marginLeft: "0",
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
                }) + ({ low: 1, medium: 2, high: 3 }[comData.data.get()?.thinkStrength] || 2),
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
                    const isActive = (comData.data.get()?.thinkStrength || "medium") === v.level
                    return m(Tag, {
                      isBtn: true,
                      ext: {
                        onclick: async (e) => {
                          e.stopPropagation()
                          await comData.data.edit((data) => {
                            data.thinkStrength = v.level
                          })
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
            ]) : null,




          m(IconTag, {
            iconName: "MagicWand",
            bgColor: getColor('main').back,
            styleExt: {
              marginLeft: 0,
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
              comData.data.get()?.toolsMode === 1
                ? trs("输入栏/模式/提示词", { cn: "提示词模式", en: "Prompt" }) : null,
              comData.data.get()?.toolsMode === 2
                ? trs("输入栏/模式/标准工具", { cn: "标准工具模式", en: "Standard" }) : null,
              comData.data.get()?.toolsMode === 3
                ? trs("输入栏/模式/宅喵工具", { cn: "宅喵工具模式", en: "OwO Tools" }) : null,
              comData.data.get()?.toolsMode === 4
                ? trs("输入栏/模式/原生外壳", { cn: "原生外壳模式", en: "Native Wrapper" }) : null,
              comData.data.get()?.toolsMode === 5
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
                const isActive = comData.data.get()?.toolsMode === mode.id
                return m(Tag, {
                  isBtn: true,
                  ext: {
                    onclick: async (e) => {
                      e.stopPropagation()
                      await comData.data.edit((data) => {
                        data.toolsMode = mode.id
                      })
                      showToolsList = false
                    },
                  },
                  styleExt: {
                    minWidth: "10rem",
                    padding: 0,
                    margin: 0,
                    background: "transparent",
                    color: isActive ? getColor('gray_8').front : getColor('gray_4').front,
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
              marginLeft: 0,
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
          comData.data.get()?.call ?
            m(IconTag, {
              bgColor: getColor('yellow_2').back,
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
            const targetList = comData.data.get().chatLists?.find(l => l.id === targetChatListId);
            return targetList?.replying ?
              m(IconTag, {
                iconName: "PauseOne",
                bgColor: getColor('gray_2').back,
                fgColor: getColor('gray_2').front,
                ext: {
                  onclick: async () => {

                    try {
                      let tmp = await m.request({
                        url: `/api/aiAsk/stop`,
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
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
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
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
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
            bgColor: comData.data.get()?.customCwd ? getColor('yellow_1').back : getColor('gray_2').back,
            fgColor: comData.data.get()?.customCwd ? getColor('gray_8').front : getColor('gray_2').front,
            ext: {
              onclick: async () => {
                if (comData.data.get()?.customCwd) {
                  Notice.launch({
                    tip: "取消工作目录",
                    msg: "确定要取消当前的工作目录映射吗？取消后 AI 将无法直接操作您的本地文件喵。",
                    async confirm() {
                      await settingData.fnCall("setCustomCwd", [null]);
                      chatData.updateTmStatus();
                      return undefined
                    }
                  });
                } else {
                  try {
                    let res = await settingData.fnCall("appOpenDialog", [{
                      title: "选择目标工作目录",
                      properties: ["openDirectory"]
                    }])
                    if (res.ok && res.filePath) {
                      // 1. 检查 Git 和备份状态（传入选中的路径）
                      const status = await settingData.fnCall("tmGetProjectStatus", [res.filePath]);
                      const gitOk = (typeof status.gitOk === 'object') ? status.gitOk.ok : status.gitOk;
                      if (!gitOk) {
                        Notice.launch({
                          tip: "Git 环境异常",
                          type: "error",
                          msg: (typeof status.gitOk === 'object' ? status.gitOk.msg : status.msg) || "未检测到 Git 客户端，请先安装 Git 喵！"
                        });
                        return;
                      }

                      if (status.isReady) {
                        // 已有备份目录，直接设定
                        await settingData.fnCall("setCustomCwd", [res.filePath]);
                        Notice.launch({ msg: "已检测到备份目录，工作目录已就绪喵！🕒" });
                        chatData.updateTmStatus();
                      } else {
                        // 2. 询问并强制初始化
                        Notice.launch({
                          tip: "初始化时光机",
                          msg: "您选定了工作目录，是否立即为该目录初始化时光机（.owoTimeMachine）？为了数据安全，AI 强烈建议您开启备份喵！",
                          async confirm() {
                            await settingData.fnCall("setCustomCwd", [res.filePath]);
                            const initRes = await settingData.fnCall("tmInit", [res.filePath]);
                            Notice.launch({ msg: initRes.msg });
                            chatData.updateTmStatus();
                            return undefined
                          },
                          cancel() {
                            Notice.launch({ msg: "安全中止：未开启备份前禁止选定工作目录喵。" });
                            return undefined
                          }
                        });
                      }
                    }
                  } catch (err) {
                    console.error(err)
                  }
                }
              }
            }
          }, comData.data.get()?.customCwd ? (comData.data.get().customCwd.split(/[/\\]/).pop() || "/") : trs("聊天界面/词汇/工作目录")),

          // --- 备份状态指示器 ---
          comData.data.get()?.customCwd ? m(IconTag, {
            iconName: chatData.tmStatus.isReady ? "History" : "FileLock",
            bgColor: chatData.tmStatus.isReady ? getColor('green_1').back : getColor('red_1').back,
            fgColor: chatData.tmStatus.isReady ? getColor('green_1').front : getColor('red_1').front,
            ext: {
              onclick: async () => {
                if (!chatData.tmStatus.isReady) {
                  Notice.launch({
                    tip: "立即初始化备份",
                    msg: "该目录尚未初始化时光机备份，是否立即创建喵？",
                    async confirm() {
                      const initRes = await settingData.fnCall("tmInit", [comData.data.get().customCwd]);
                      Notice.launch({ msg: initRes.msg });
                      chatData.updateTmStatus();
                      return undefined
                    }
                  });
                } else {
                  Notice.launch({ msg: "时光机运行中：实时守护您的每一行代码喵！" });
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
              marginLeft: "0.5rem",
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
            onchange: uploadAttachment
          }),

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
          m(ChatInputEditor, {
            placeholder: comData.data.get()?.targetChatListId ? trs("输入栏/占位符/已锁定队列", { cn: `已锁定到队列 ${comData.data.get()?.targetChatListId} ...`, en: `Locked to queue ${comData.data.get()?.targetChatListId}...` }) : trs("输入栏/占位符/输入消息", { cn: "输入消息...", en: "Type a message..." }),
            onsubmit: submitFn,
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