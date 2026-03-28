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
import ChatInputEditor from "./ChatInputEditor.js"
import HelpMenu from "../common/HelpMenu.js"
import getColor from "../common/getColor.js"

export default () => {
  let _forcedListId = null // 若非 null，则锁定发送目标（用于子智能体独立窗口）
  const submitFn = async (e) => {
    e.preventDefault()
    data.preparing = true

    // Retrieve routing context (forcedListId 优先于全局)
    const targetChatListId = _forcedListId !== null ? _forcedListId : comData.data.get()?.targetChatListId

    await comData.data.edit((data_) => {
      data_.inputText = data.inputText
    })

    // Send with routing info
    ioSocket.socket.emit("chat", {
      targetChatListId: targetChatListId,
      attachments: data.attachmentsMap[targetChatListId] || [] // 加入附件元数据
    })

    await comData.data.edit((data_) => {
      data_.inputText = ""
    })
    data.inputText = ""
    data.attachmentsMap[targetChatListId] = [] // 发送后清空预览
  }

  // 上传附件逻辑
  const uploadAttachment = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const targetChatListId = _forcedListId !== null ? _forcedListId : (comData.data.get()?.targetChatListId || 0);
    if (!data.attachmentsMap[targetChatListId]) data.attachmentsMap[targetChatListId] = [];

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

      data.attachmentsMap[targetChatListId].push(attachObj);
      const index = data.attachmentsMap[targetChatListId].length - 1;

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

          xhr.open('POST', `${window.location.protocol}//${window.location.hostname}:9501/api/attachments/set`);
          xhr.send(formData);
        });

        const res = await uploadPromise;

        if (res && res.id) {
          // 上传成功，更新正式数据
          attachObj.id = res.id;
          attachObj.url = res.url;
          attachObj.status = 'done';
          attachObj.progress = 100;
          data.quoteAttachId(res.id);
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



  return {
    async oninit() {
      try {
        await settingData.options.pull()
      }
      catch (err) {
        throw err
      }
    },
    view({ attrs }) {
      // 更新强制 listId（来自子智能体窗口等外部调用方）
      _forcedListId = attrs?.forcedListId !== undefined ? attrs.forcedListId : null
      const targetChatListId = _forcedListId !== null ? _forcedListId : (comData.data.get()?.targetChatListId || 0)
      const attachments = data.attachmentsMap[targetChatListId] || []

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
            bgColor: comData.data.get()?.sendMode === "terminal" ? getColor('yellow_1').back : getColor('main').back,
            //fgColor: comData.data.get()?.sendMode === "terminal" ? getColor('yellow_1').front : getColor('main').front,

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
            bgColor: comData.data.get()?.sendMode === "agent" ? getColor('yellow_1').back : getColor('main').back,
            //fgColor: comData.data.get()?.sendMode === "agent" ? getColor('yellow_1').front : getColor('main').front,

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

          m(IconTag, {
            iconName: "Brain",
            bgColor: comData.data.get()?.enableThinking ? getColor('yellow_1').back : getColor('gray_2').back,
            fgColor: comData.data.get()?.enableThinking ? getColor('gray_8').front : getColor('gray_2').front,
            ext: {
              onclick: async () => {
                await comData.data.edit((data) => {
                  data.enableThinking = !data.enableThinking
                })
              }
            }
          }, trs("输入栏/按钮/深度思考", { cn: "深度思考", en: "Thinking" })),



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
                { id: 3, label: trs("输入栏/模式/宅喵工具/名称", { cn: "宅喵工具模式", en: "OwO Tools" }) }
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
                      data.inputDom.focus()
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
            const targetId = comData.data.get()?.targetChatListId || 0;
            const targetList = comData.data.get().chatLists?.find(l => l.id === targetId);
            return targetList?.replying ?
              m(IconTag, {
                iconName: "PauseOne",
                bgColor: getColor('gray_2').back,
                fgColor: getColor('gray_2').front,
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
              onclick: () => data.quoteAttachId(attach.id)
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
                    color: "#eee",
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
                        url: `${window.location.protocol}//${window.location.hostname}:9501/api/attachments/del`,
                        method: "POST",
                        body: { id: attach.id }
                      });
                    } catch (err) {
                      console.error("物理删除附件失败:", err);
                    }
                  }

                  // 从文本框中移除对应的引用标签
                  const quoteTxt = ` [attachid:${attach.id}] `;
                  if (data.inputText.includes(quoteTxt)) {
                    data.inputText = data.inputText.replace(quoteTxt, "");
                  } else {
                    // 兼容可能没有空格的情况
                    data.inputText = data.inputText.replace(`[attachid:${attach.id}]`, "");
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
              marginRight: "1rem",
              background: comData.data.get()?.targetChatListId ? getColor('pink_2').back + '99' : getColor('brown_4').back + '99',
              border: `0.1rem solid ${getColor('main').back}`,
              color: getColor('gray_8').front, // 保持 getColor 修复，但使用原结构
              borderRadius: "3rem",
              padding: "1rem 2rem",
            }
          }),
          m("input[type=submit]", {
            value: trs("输入栏/按钮/发送", { cn: "发送", en: "Send" }),
            style: {
              padding: "1rem 2rem",
              background: getColor('pink_1').back,
              border: "unset",
              color: getColor('pink_1').front,
              fontSize: "1.8rem",
              zIndex: 1,
              borderRadius: "3rem",
              cursor: "pointer",
            },
            onclick: submitFn
          }),



        ])
      ])
    }
  }
}