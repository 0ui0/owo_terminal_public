import Box from "../common/box.js"
import Tag from "../common/tag.js"
import data from "./settingData.js"
import Notice from "../common/notice.js"
import m from "mithril"
import { trs } from "../common/i18n.js"
import commonData from "../common/commonData.js"
import getColor from "../common/getColor.js"
import comData from "../../comData/comData.js"
import { launchModelWizard } from "./settingModelWizard.js"
import chatData from "../chat/chatData.js"
import ChatModelSelector from "../chat/ChatModelSelector.js"

export default () => {
  let activeGroup1 = ""
  let activeGroup2 = ""
  let activeGroup3 = ""
  let menuShow = false
  let containerWidth = 0

  let petPkgList = []

  const PetPkgSelector = {
    async oninit() {
      try {
        const res = await data.fnCall("petPkgList", [])
        if (res.ok) {
          petPkgList = res.data
          m.redraw()
        }
      } catch (e) {
        console.error("Failed to load pet packages:", e)
      }
    },
    async handleDelete(name) {
      if (name === "default") return
      Notice.launch({
        tip: trs("通用/确认删除"),
        msg: `确定要物理删除角色包 "${name}" 吗？此操作不可恢复。`,
        confirm: async () => {
          const res = await data.fnCall("petPkgDelete", [{ name }])
          if (res.ok) {
            const resLit = await data.fnCall("petPkgList", [])
            if (resLit.ok) petPkgList = resLit.data
            Notice.launch({
              msg: res.msg,
              color: "green"
            })
            m.redraw()
          } else {
            Notice.launch({
              msg: res.msg,
              color: "pink"
            })
          }
        }
      })
    },
    view: () => {
      const currentPet = comData.data.get()?.defaultPet || "default"

      return m("",
        {
          style: {
            marginBottom: "1.5rem",
            display: "flex",
            flexDirection: "column"
          }
        },
        [
          m("label",
            {
              style: {
                fontSize: "1.5rem",
                color: getColor("gray_1").front,
                marginBottom: "0.8rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }
            },
            trs("设置界面/字段/默认角色包", { cn: "默认角色包", en: "Default Pet Package" })
          ),

          m("",
            {
              style: {
                display: "flex",
                gap: "1rem",
                alignItems: "center"
              }
            },
            [
              m("select",
                {
                  value: currentPet,
                  onchange: async (e) => {
                    const val = e.target.value
                    const res = await data.fnCall("petPkgSetDefault", [{ name: val }])
                    if (res.ok) {
                      Notice.launch({
                        msg: trs("设置/消息/角色已切换", { cn: "角色已切换", en: "Character switched" }),
                      })
                      m.redraw()
                    }
                  },
                  style: {
                    flex: 1,
                    background: getColor("gray_4").back,
                    color: getColor("gray_4").front,
                    padding: "0.8rem 1.2rem",
                    borderRadius: "3rem",
                    border: "none",
                    outline: "none",
                    fontSize: "1.5rem",
                    cursor: "pointer"
                  }
                },
                petPkgList.map(pkg =>
                  m("option",
                    {
                      value: pkg,
                      style: {
                        background: getColor("gray_3").back,
                        color: getColor("gray_3").front
                      }
                    },
                    pkg
                  )
                )
              ),

              currentPet !== "default" ?
                m(Box,
                  {
                    isBtn: true,
                    color: "pink_1",
                    style: {
                      margin: "0",
                      padding: "0",
                      width: "3.2rem",
                      height: "3.2rem",
                      borderRadius: "50%",
                      display: "inline-flex",
                      justifyContent: "center",
                      alignItems: "center",
                      flexShrink: 0
                    },
                    onclick: () => PetPkgSelector.handleDelete(currentPet)
                  },
                  [
                    m.trust(window.iconPark.getIcon("Close", {
                      size: "1.5rem",
                      fill: getColor("pink_1").front
                    }))
                  ]
                ) : null
            ]
          ),

          m("",
            {
              style: {
                fontSize: "1.2rem",
                color: getColor("gray_4").front,
                opacity: 0.6,
                marginTop: "0.5rem"
              }
            },
            trs("设置/角色/切换说明", { cn: "切换后 AI 角色形象及可用动作将立即更新。", en: "Switching will update the AI avatar and actions immediately." })
          )
        ]
      )
    }
  }

  let availableActions = []
  const IdleActionConfigurator = {
    _currentPet: "",
    async refreshActions() {
      try {
        const res = await data.fnCall("petPkgGetAvailableActions", [])
        if (res.ok) {
          availableActions = res.data
          m.redraw()
        }
      } catch (e) {
        console.error("Failed to load actions:", e)
      }
    },
    async oninit() {
      this._currentPet = comData.data.get()?.defaultPet
      await this.refreshActions()
    },
    onupdate() {
      const pet = comData.data.get()?.defaultPet
      if (pet !== this._currentPet) {
        this._currentPet = pet
        this.refreshActions()
      }
    },
    view: () => {
      const currentList = comData.data.get()?.playFaces?.list || ["待机状态"]

      const updateList = async (newList) => {
        if (newList.length === 0) {
          Notice.launch({
            msg: "列表不能为空，至少需包含一个动作。",
            color: "yellow"
          })
          return
        }
        await comData.data.edit(d => {
          d.playFaces.list = [...newList]
          d.playFaces.index = 0
        })
        m.redraw()
      }

      return m("",
        {
          style: {
            marginBottom: "1.5rem",
            display: "flex",
            flexDirection: "column"
          }
        },
        [
          m("label",
            {
              style: {
                fontSize: "1.5rem",
                color: getColor("gray_1").front,
                marginBottom: "0.8rem"
              }
            },
            trs("设置界面/字段/闲暇动作配置", { cn: "闲暇轮播动作配置", en: "Idle Action Rotation" })
          ),

          // 列表项容器
          m("",
            {
              style: {
                background: getColor("gray_4").back,
                borderRadius: "3rem",
                overflow: "hidden",
                marginBottom: "0.8rem",
                padding: "0.5rem"
              }
            },
            currentList.map((item, idx) => {
              const isPlaying = idx === (comData.data.get()?.playFaces?.index)
              return m("",
                {
                  key: `act-${idx}-${item}`,
                  style: {
                    padding: "0.8rem 1.2rem",
                    borderRadius: "3rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: isPlaying ? `${getColor("main").back}22` : "transparent"
                  }
                },
                [
                  m("",
                    {
                      style: {
                        flex: 1,
                        color: getColor("gray_4").front,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.8rem"
                      }
                    },
                    [
                      m("span",
                        {
                          style: {
                            fontSize: "1.2rem",
                            opacity: 0.6
                          }
                        },
                        idx + 1
                      ),
                      m("span",
                        item
                      )
                    ]
                  ),
                  m("",
                    {
                      style: {
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center"
                      }
                    },
                    [
                      // 上移
                      idx > 0 ?
                        m(Box,
                          {
                            isBtn: true,
                            color: "gray_3",
                            style: {
                              margin: "0",
                              padding: "0",
                              width: "2.8rem",
                              height: "2.8rem",
                              borderRadius: "50%",
                              display: "inline-flex",
                              justifyContent: "center",
                              alignItems: "center",
                              flexShrink: 0
                            },
                            onclick: () => {
                              const newList = [...currentList]
                              const temp = newList[idx - 1]
                              newList[idx - 1] = newList[idx]
                              newList[idx] = temp
                              updateList(newList)
                            }
                          },
                          [
                            m.trust(window.iconPark.getIcon("UpOne", {
                              size: "1.4rem",
                              fill: getColor("gray_3").front
                            }))
                          ]
                        ) : null,

                      // 下移
                      idx < currentList.length - 1 ?
                        m(Box,
                          {
                            isBtn: true,
                            color: "gray_3",
                            style: {
                              margin: "0",
                              padding: "0",
                              width: "2.8rem",
                              height: "2.8rem",
                              borderRadius: "50%",
                              display: "inline-flex",
                              justifyContent: "center",
                              alignItems: "center",
                              flexShrink: 0
                            },
                            onclick: () => {
                              const newList = [...currentList]
                              const temp = newList[idx + 1]
                              newList[idx + 1] = newList[idx]
                              newList[idx] = temp
                              updateList(newList)
                            }
                          },
                          [
                            m.trust(window.iconPark.getIcon("DownOne", {
                              size: "1.4rem",
                              fill: getColor("gray_3").front
                            }))
                          ]
                        ) : null,

                      // 删除
                      m(Box,
                        {
                          isBtn: true,
                          color: "pink_1",
                          style: {
                            margin: "0",
                            padding: "0",
                            width: "2.8rem",
                            height: "2.8rem",
                            borderRadius: "50%",
                            display: "inline-flex",
                            justifyContent: "center",
                            alignItems: "center",
                            flexShrink: 0
                          },
                          onclick: () => {
                            const newList = currentList.filter((_, i) => i !== idx)
                            updateList(newList)
                          }
                        },
                        [
                          m.trust(window.iconPark.getIcon("Close", {
                            size: "1.4rem",
                            fill: getColor("pink_1").front
                          }))
                        ]
                      )
                    ]
                  )
                ]
              )
            })
          ),

          // 下拉添加动作
          m("",
            {
              style: {
                display: "flex",
                gap: "1rem"
              }
            },
            [
              m("select",
                {
                  style: {
                    flex: 1,
                    padding: "0.8rem 1.2rem",
                    borderRadius: "3rem",
                    background: getColor("gray_4").back,
                    color: getColor("gray_4").front,
                    border: "none",
                    outline: "none",
                    fontSize: "1.5rem",
                    cursor: "pointer"
                  },
                  onchange: (e) => {
                    const val = e.target.value
                    if (val) {
                      updateList([...currentList, val])
                      e.target.value = ""
                    }
                  }
                },
                [
                  m("option",
                    {
                      value: ""
                    },
                    trs("设置/选项/添加新动作", { cn: "--- 选择并添加动作 ---", en: "--- Select to Add Action ---" })
                  ),
                  availableActions.map(act =>
                    m("option",
                      {
                        value: act,
                        style: {
                          background: getColor("gray_3").back,
                          color: getColor("gray_3").front
                        }
                      },
                      act
                    )
                  )
                ]
              )
            ]
          )
        ]
      )
    }
  }

  const getModelFieldLabel = (key) => {
    const map = {
      name: trs("设置界面/模型列表/配置别名"),
      model: trs("设置界面/模型列表/模型ID"),
      apiKey: trs("设置界面/模型列表/APIKey"),
      url: trs("设置界面/模型列表/接口地址"),
      prompt: trs("设置界面/模型列表/预设提示词"),
      price: trs("设置界面/模型列表/价格权重"),
      tokenRate: trs("设置界面/模型列表/消耗倍率"),
      preTokens: trs("设置界面/模型列表/余额"),
      switch: trs("设置界面/模型列表/启用状态"),
      system: trs("设置界面/模型列表/系统内置")
    }
    return map[key] || key
  }

  const getStructure = () => {
    let groups = {}
    if (data.options.data && data.options.data.length > 0) {
      for (let i = 0; i < data.options.data.length; i++) {
        let option = data.options.data[i]
        if (!option.group1) option.group1 = "其他"
        if (!option.group2) option.group2 = "通用"
        if (!option.group3) option.group3 = "基本"

        groups[option.group1] ??= {}
        groups[option.group1][option.group2] ??= {}
        groups[option.group1][option.group2][option.group3] ??= []

        if (!groups[option.group1][option.group2][option.group3].find((item) => item.optionId == option.optionId)) {
          groups[option.group1][option.group2][option.group3].push(option)
        }
      }
    }
    return groups
  }

  let clipboardModel = null

  // --- 大模型列表编辑器 ---
  const ModelListEditor = {
    view: ({ attrs }) => {
      const { value, onchange } = attrs

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }
        },
        [
          value.map((model, index) => {
            const isExpanded = model._expanded || false
            const isEnabled = (model.switch === 1 || model.switch === true)

            return m("",
              {
                style: {
                  background: getColor("gray_4").back,
                  borderRadius: "3rem",
                  overflow: "hidden"
                }
              },
              [
                // 卡片头部
                m("",
                  {
                    style: {
                      padding: "1rem 1.5rem",
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                      background: isExpanded ? `${getColor("main").back}15` : "transparent"
                    },
                    onclick: () => model._expanded = !model._expanded
                  },
                  [
                    // 状态圆点
                    m("",
                      {
                        style: {
                          width: "1rem",
                          height: "1rem",
                          borderRadius: "50%",
                          background: isEnabled ? getColor("main").back : getColor("gray_3").back,
                          marginRight: "1rem",
                          flexShrink: 0
                        }
                      }
                    ),
                    // 名称
                    m("",
                      {
                        style: {
                          color: getColor("gray_4").front,
                          flex: 1
                        }
                      },
                      model.name || trs("设置界面/模型列表/未命名")
                    ),
                    // 模型 ID
                    m("",
                      {
                        style: {
                          fontSize: "1.2rem",
                          color: getColor("gray_4").front,
                          opacity: 0.6,
                          marginRight: "1rem"
                        }
                      },
                      model.model
                    ),
                    // 复制按钮
                    m(Tag,
                      {
                        isBtn: true,
                        color: "gray_3",
                        styleExt: { marginRight: "0.5rem" },
                        onclick: (dom, e) => {
                          if (e && e.stopPropagation) e.stopPropagation()
                          clipboardModel = JSON.parse(JSON.stringify(model))
                          delete clipboardModel._expanded
                        }
                      },
                      trs("通用/复制", { cn: "复制", en: "Copy" })
                    ),
                    // 删除按钮
                    m(Tag,
                      {
                        isBtn: true,
                        color: "pink_1",
                        onclick: (dom, e) => {
                          if (e && e.stopPropagation) e.stopPropagation()
                          Notice.launch({
                            tip: trs("通用/确认删除"),
                            msg: `确定要删除模型 "${model.name}" 吗？`,
                            confirm: async () => {
                              value.splice(index, 1)
                              if (onchange) onchange(value)
                              return undefined
                            }
                          })
                        }
                      },
                      trs("通用/删除")
                    )
                  ]
                ),

                // 展开详情
                isExpanded ?
                  m("",
                    {
                      style: {
                        padding: "1.5rem",
                        borderTop: `0.1rem solid ${getColor("gray_4").front}11`,
                        display: "flex",
                        flexDirection: "column",
                        gap: "1.2rem"
                      }
                    },
                    Object.keys(model).filter(k => k !== "_expanded" && k !== "_showKey" && k !== "id" && k !== "system" && k !== "price" && k !== "tokenRate").map(key => {
                      const label = getModelFieldLabel(key)
                      const val = model[key]
                      const isBool = key === "switch" || key === "system" || typeof val === "boolean" || (key === "switch" && (val === 0 || val === 1))
                      const isLongText = key === "prompt"
                      const isPassword = key === "apiKey"
                      const isFieldEnabled = (val === 1 || val === true)

                      return m("",
                        {
                          style: {
                            display: "flex",
                            flexDirection: "column"
                          }
                        },
                        [
                          m("label",
                            {
                              style: {
                                fontSize: "1.2rem",
                                color: getColor("gray_4").front,
                                opacity: 0.8,
                                marginBottom: "0.5rem"
                              }
                            },
                            label
                          ),

                          isBool ?
                            m("",
                              {
                                style: {
                                  width: "3.6rem",
                                  height: "2rem",
                                  borderRadius: "3rem",
                                  background: isFieldEnabled ? getColor("main").back : getColor("gray_3").back,
                                  position: "relative",
                                  cursor: "pointer",
                                  transition: "background 0.3s"
                                },
                                onclick: () => {
                                  model[key] = isFieldEnabled ? 0 : 1
                                  if (onchange) onchange(value)
                                }
                              },
                              m("",
                                {
                                  style: {
                                    width: "1.6rem",
                                    height: "1.6rem",
                                    borderRadius: "50%",
                                    background: getColor("gray_1").back,
                                    position: "absolute",
                                    top: "0.2rem",
                                    left: isFieldEnabled ? "1.8rem" : "0.2rem",
                                    transition: "left 0.3s"
                                  }
                                }
                              )
                            ) :
                            (isLongText ?
                              m("textarea",
                                {
                                  value: val,
                                  rows: 4,
                                  style: {
                                    background: getColor("gray_3").back,
                                    color: getColor("gray_3").front,
                                    padding: "0.8rem 1.2rem",
                                    borderRadius: "1.5rem",
                                    border: "none",
                                    outline: "none",
                                    resize: "vertical",
                                    fontSize: "1.5rem",
                                    lineHeight: "1.5"
                                  },
                                  oninput: (e) => {
                                    model[key] = e.target.value
                                    if (onchange) onchange(value)
                                  }
                                }
                              ) :
                              m("",
                                {
                                  style: {
                                    position: "relative",
                                    display: "flex",
                                    alignItems: "center"
                                  }
                                },
                                [
                                  m("input",
                                    {
                                      type: isPassword ? (model._showKey ? "text" : "password") : ((typeof val === "number") ? "number" : "text"),
                                      value: val,
                                      style: {
                                        background: getColor("gray_3").back,
                                        color: getColor("gray_3").front,
                                        padding: "0.8rem 1.2rem",
                                        borderRadius: "3rem",
                                        border: "none",
                                        outline: "none",
                                        width: "100%",
                                        fontSize: "1.5rem",
                                        paddingRight: isPassword ? "3rem" : "1.2rem"
                                      },
                                      oninput: (e) => {
                                        let v = e.target.value
                                        if (typeof val === "number") v = Number(v)
                                        model[key] = v
                                        if (onchange) onchange(value)
                                      }
                                    }
                                  ),
                                  isPassword ?
                                    m("",
                                      {
                                        style: {
                                          position: "absolute",
                                          right: "1rem",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center"
                                        },
                                        onclick: () => model._showKey = !model._showKey
                                      },
                                      [
                                        m.trust(model._showKey ?
                                          window.iconPark.getIcon("PreviewOpen", { size: "1.6rem", fill: getColor("gray_3").front }) :
                                          window.iconPark.getIcon("PreviewClose", { size: "1.6rem", fill: getColor("gray_3").front })
                                        )
                                      ]
                                    ) : null
                                ]
                              )
                            ),

                          (key === "preTokens") ?
                            m("",
                              {
                                style: {
                                  fontSize: "1.2rem",
                                  color: getColor("gray_4").front,
                                  opacity: 0.6,
                                  marginTop: "0.4rem"
                                }
                              },
                              trs("设置/模型/余额说明", { cn: "允许使用的Token余额，系统会在对话时自动扣除。归零或为负数时模型将不可用。", en: "Allowed token balance. System deducts during chat. Model disabled when zero or negative." })
                            ) : null
                        ]
                      )
                    })
                  ) : null
              ]
            )
          }),

          // 底部控制按钮组
          m("",
            {
              style: {
                display: "flex",
                gap: "1rem",
                flexWrap: "wrap"
              }
            },
            [
              m(Box,
                {
                  isBtn: true,
                  color: "main",
                  style: {
                    flex: 1,
                    margin: "0",
                    borderRadius: "3rem"
                  },
                  onclick: () => {
                    launchModelWizard({
                      onSuccess: async () => {
                        await data.options.pull()
                        m.redraw()
                      }
                    })
                  }
                },
                [
                  m.trust(window.iconPark.getIcon("Plus", { size: "1.5rem", fill: getColor("main").front })),
                  m("span", { style: { marginLeft: "0.5rem" } }, trs("设置/向导/添加按钮", { cn: "添加大模型 (向导)", en: "Add Model (Wizard)" }))
                ]
              ),

              m(Box,
                {
                  isBtn: true,
                  color: "gray_4",
                  style: {
                    flex: 1,
                    margin: "0",
                    borderRadius: "3rem"
                  },
                  onclick: () => {
                    let url = "http://localhost:11434"
                    Notice.launch({
                      tip: trs("设置/Ollama/配置标题", { cn: "配置 Ollama 地址", en: "Configure Ollama URL" }),
                      content: {
                        view: () => m("",
                          {
                            style: {
                              padding: "1rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: "1rem"
                            }
                          },
                          [
                            m("",
                              {
                                style: {
                                  color: getColor("gray_1").front,
                                  fontSize: "1.5rem"
                                }
                              },
                              trs("设置界面/Ollama/输入提示")
                            ),
                            m(Box,
                              {
                                tagName: "input[type=text]",
                                value: url,
                                color: "gray_3",
                                style: {
                                  width: "100%",
                                  margin: "0",
                                  borderRadius: "3rem",
                                  fontSize: "1.5rem"
                                },
                                oninput: (dom, e) => {
                                  url = e.target.value
                                }
                              }
                            ),
                            m("",
                              {
                                style: {
                                  fontSize: "1.2rem",
                                  color: getColor("gray_1").front,
                                  opacity: 0.6
                                }
                              },
                              trs("设置界面/Ollama/端口提示")
                            )
                          ]
                        )
                      },
                      confirm: async () => {
                        if (!url) return false
                        Notice.launch({ msg: trs("系统/状态/正在尝试连接") })
                        try {
                          const res = await data.fnCall("getOllamaModels", [url])
                          if (res.ok && res.data) {
                            let count = 0
                            res.data.forEach(mItem => {
                              if (!value.find(v => v.model === mItem.model)) {
                                value.push(mItem)
                                count++
                              }
                            })
                            if (count > 0) {
                              if (onchange) onchange(value)
                              Notice.launch({
                                msg: `成功导入 ${count} 个模型`,
                                color: "green"
                              })
                            } else {
                              Notice.launch({
                                msg: trs("设置/Ollama/未发现新模型", { cn: "未发现新模型 (已全部存在)", en: "No new models found (all exist)" }),
                                color: "yellow"
                              })
                            }
                          } else {
                            Notice.launch({
                              msg: res.msg || trs("系统/消息/导入失败"),
                              color: "pink"
                            })
                          }
                        } catch (err) {
                          console.error("Ollama Import Error:", err)
                          Notice.launch({
                            msg: trs("系统/错误/提示") + (err?.message || String(err)),
                            color: "pink"
                          })
                        }
                        return undefined
                      }
                    })
                  }
                },
                trs("设置界面/Ollama/导入按钮")
              ),
              
              // 粘贴大模型
              clipboardModel ? m(Box,
                {
                  isBtn: true,
                  color: "main",
                  style: {
                    flex: 1,
                    margin: "0",
                    borderRadius: "3rem"
                  },
                  onclick: () => {
                    let newModel = JSON.parse(JSON.stringify(clipboardModel))
                    newModel.name = (newModel.name || "") + " (Copy)"
                    value.push(newModel)
                    if (onchange) onchange(value)
                  }
                },
                trs("通用/粘贴", { cn: "粘贴", en: "Paste" })
              ) : null
            ]
          ),

          // Ollama 使用帮助
          m("",
            {
              style: {
                marginTop: "0.5rem",
                textAlign: "center"
              }
            },
            [
              m("span",
                {
                  style: {
                    color: getColor("main").back,
                    fontSize: "1.2rem",
                    cursor: "pointer",
                    textDecoration: "underline"
                  },
                  onclick: () => {
                    Notice.launch({
                      tip: "Ollama 使用帮助",
                      content: {
                        view: () => m("",
                          {
                            style: {
                              padding: "1.5rem",
                              lineHeight: "1.6",
                              color: getColor("gray_1").front,
                              maxWidth: "50rem"
                            }
                          },
                          [
                            m("h3",
                              {
                                style: {
                                  color: getColor("main").back,
                                  marginBottom: "1rem",
                                  fontSize: "1.8rem"
                                }
                              },
                              "Ollama 快速指南"
                            ),
                            m("p", "1. 确保您的电脑上已根据官网说明安装并运行 Ollama。"),
                            m("p", "2. 默认情况下，本程序会连接到 http://localhost:11434。"),
                            m("p", "3. 如果连接失败："),
                            m("ul",
                              {
                                style: {
                                  paddingLeft: "1.5rem",
                                  opacity: 0.8
                                }
                              },
                              [
                                m("li", "检查 Ollama 小图标是否出现在系统托盘中。"),
                                m("li", "如果是远程连接，请确保 Ollama 启动时设置了 OLLAMA_HOST=0.0.0.0。"),
                                m("li", "无需配置 CORS (OLLAMA_ORIGINS)，因为我们是通过后端直连。")
                              ]
                            ),
                            m("p",
                              {
                                style: {
                                  marginTop: "1rem"
                                }
                              },
                              "点击导入时，您可以修改默认端口号以适应您的配置。"
                            )
                          ]
                        )
                      }
                    })
                  }
                },
                trs("设置界面/Ollama/查看帮助")
              )
            ]
          )
        ]
      )
    }
  }

  // --- Shell 编辑器 ---
  const ShellEditor = {
    view: ({ attrs }) => {
      const { value, onchange } = attrs
      const osMap = { win: "Windows", mac: "macOS", linux: "Linux" }

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }
        },
        Object.keys(value).map(osKey => {
          return m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "1rem"
              }
            },
            [
              m("",
                {
                  style: {
                    width: "8rem",
                    color: getColor("gray_4").front,
                    fontSize: "1.5rem"
                  }
                },
                osMap[osKey] || osKey
              ),
              m("input",
                {
                  value: value[osKey],
                  style: {
                    flex: 1,
                    background: getColor("gray_4").back,
                    color: getColor("gray_4").front,
                    padding: "0.8rem 1.2rem",
                    borderRadius: "3rem",
                    border: "none",
                    outline: "none",
                    fontSize: "1.5rem"
                  },
                  oninput: (e) => {
                    value[osKey] = e.target.value
                    if (onchange) onchange(value)
                  }
                }
              )
            ]
          )
        })
      )
    }
  }

  // --- 通用字段分发组件 ---
  const SettingField = {
    view: ({ attrs }) => {
      const opt = attrs.option

      if (opt.key === "ai_aiList") {
        return m("",
          {
            style: {
              marginBottom: "2rem"
            }
          },
          [
            m("label",
              {
                style: {
                  display: "block",
                  color: getColor("gray_1").front,
                  marginBottom: "1rem",
                  fontSize: "1.6rem"
                }
              },
              trs("设置界面/字段/" + opt.name)
            ),
            m(ModelListEditor,
              {
                value: opt.value,
                onchange: (v) => opt.value = v
              }
            )
          ]
        )
      }

      if (opt.key === "global_terminalShell") {
        return m("",
          {
            style: {
              marginBottom: "2rem"
            }
          },
          [
            m("label",
              {
                style: {
                  display: "block",
                  color: getColor("gray_1").front,
                  marginBottom: "1rem",
                  fontSize: "1.6rem"
                }
              },
              trs("设置界面/字段/" + opt.name)
            ),
            m(ShellEditor,
              {
                value: opt.value,
                onchange: (v) => opt.value = v
              }
            )
          ]
        )
      }

      // 主题选择
      if (opt.key === "global_themeColor") {
        const themes = [
          { value: 0, label: trs("设置/主题/默认", { cn: "经典深色", en: "Classic Dark" }) },
          { value: 1, label: trs("设置/主题/花园", { cn: "阳光花园", en: "Sunshine Garden" }) },
          { value: 2, label: trs("设置/主题/海风", { cn: "蔚蓝海风", en: "Ocean Breeze" }) }
        ]
        return m("",
          {
            style: {
              marginBottom: "1.5rem"
            }
          },
          [
            m("label",
              {
                style: {
                  display: "block",
                  color: getColor("gray_1").front,
                  marginBottom: "0.8rem",
                  fontSize: "1.5rem"
                }
              },
              trs("设置界面/字段/" + (opt.name || "显示主题"))
            ),
            m("",
              {
                style: {
                  display: "flex",
                  gap: "1rem",
                  flexWrap: "wrap"
                }
              },
              themes.map(t => {
                const isActive = Number(opt.value) === t.value
                return m(Box,
                  {
                    isBtn: true,
                    color: isActive ? "main" : "gray_4",
                    style: {
                      margin: "0",
                      padding: "0.8rem 1.5rem",
                      borderRadius: "3rem"
                    },
                    onclick: () => {
                      opt.value = t.value
                      commonData.themeColor = t.value
                      m.redraw()
                    }
                  },
                  t.label
                )
              })
            )
          ]
        )
      }

      // 语言选择
      if (opt.key === "global_language") {
        return m("",
          {
            style: {
              marginBottom: "1.5rem"
            }
          },
          [
            m("label",
              {
                style: {
                  display: "block",
                  color: getColor("gray_1").front,
                  marginBottom: "0.8rem",
                  fontSize: "1.5rem"
                }
              },
              trs("设置界面/字段/" + (opt.name || "系统语言"))
            ),
            m("select",
              {
                value: opt.value,
                onchange: (e) => opt.value = e.target.value,
                style: {
                  width: "100%",
                  background: getColor("gray_4").back,
                  color: getColor("gray_4").front,
                  padding: "0.8rem 1.2rem",
                  borderRadius: "3rem",
                  border: "none",
                  outline: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer"
                }
              },
              [
                m("option",
                  {
                    value: "cn",
                    style: {
                      background: getColor("gray_3").back,
                      color: getColor("gray_3").front
                    }
                  },
                  "简体中文"
                ),
                m("option",
                  {
                    value: "en",
                    style: {
                      background: getColor("gray_3").back,
                      color: getColor("gray_3").front
                    }
                  },
                  "English"
                )
              ]
            )
          ]
        )
      }

      // 默认字段类型判定
      const switchRegex = /is|use|enable|auto|save|show|hide|allow|switch|mode|开关|保存|自动/i
      const isBoolValue = typeof opt.value === "boolean" || (typeof opt.value === "number" && (opt.value === 0 || opt.value === 1))
      const isSwitchName = switchRegex.test((opt.name || "") + (opt.key || ""))
      const isBool = isBoolValue && (typeof opt.value === "boolean" || isSwitchName)

      const isNumber = typeof opt.value === "number" && !isBool
      const isPassword = !isBool && opt.key && /key|password|token|secret/i.test(opt.key)
      const isFieldActive = (opt.value === 1 || opt.value === true)

      if (isPassword && opt._showKey === undefined) opt._showKey = false

      return m("",
        {
          style: {
            marginBottom: "1.5rem",
            display: "flex",
            flexDirection: "column"
          }
        },
        [
          m("label",
            {
              style: {
                fontSize: "1.5rem",
                color: getColor("gray_1").front,
                marginBottom: "0.8rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }
            },
            [
              m("span", trs("设置界面/字段/" + (opt.name || opt.key))),
              isBool ?
                m("",
                  {
                    style: {
                      width: "3.6rem",
                      height: "2rem",
                      borderRadius: "3rem",
                      background: isFieldActive ? getColor("main").back : getColor("gray_4").back,
                      position: "relative",
                      cursor: "pointer",
                      transition: "background 0.3s"
                    },
                    onclick: () => {
                      if (typeof opt.value === "number") opt.value = opt.value === 1 ? 0 : 1
                      else opt.value = !opt.value
                    }
                  },
                  m("",
                    {
                      style: {
                        width: "1.6rem",
                        height: "1.6rem",
                        borderRadius: "50%",
                        background: getColor("gray_1").back,
                        position: "absolute",
                        top: "0.2rem",
                        left: isFieldActive ? "1.8rem" : "0.2rem",
                        transition: "left 0.3s"
                      }
                    }
                  )
                ) : null
            ]
          ),

          !isBool ?
            m("",
              {
                style: {
                  position: "relative",
                  display: "flex",
                  alignItems: "center"
                }
              },
              [
                m("input",
                  {
                    type: isPassword ? (opt._showKey ? "text" : "password") : (isNumber ? "number" : "text"),
                    value: opt.value,
                    style: {
                      padding: "0.8rem 1.2rem",
                      background: getColor("gray_4").back,
                      color: getColor("gray_4").front,
                      borderRadius: "3rem",
                      border: "none",
                      outline: "none",
                      width: "100%",
                      fontSize: "1.5rem",
                      paddingRight: isPassword ? "3rem" : "1.2rem"
                    },
                    oninput: (e) => {
                      let val = e.target.value
                      if (isNumber) val = Number(val)
                      opt.value = val
                    }
                  }
                ),
                isPassword ?
                  m("",
                    {
                      style: {
                        position: "absolute",
                        right: "1rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center"
                      },
                      onclick: () => opt._showKey = !opt._showKey
                    },
                    [
                      m.trust(opt._showKey ?
                        window.iconPark.getIcon("PreviewOpen", { size: "1.6rem", fill: getColor("gray_4").front }) :
                        window.iconPark.getIcon("PreviewClose", { size: "1.6rem", fill: getColor("gray_4").front })
                      )
                    ]
                  ) : null
              ]
            ) : null,

          (opt.desc && opt.desc !== opt.name) ?
            m("",
              {
                style: {
                  fontSize: "1.2rem",
                  color: getColor("gray_4").front,
                  opacity: 0.6,
                  marginTop: "0.5rem"
                }
              },
              opt.desc
            ) : null
        ]
      )
    }
  }

  // --- 主视图架构 ---
  return {
    async oninit({ attrs }) {
      try {
        await data.initSocket()
        await data.options.pull()
        commonData.themeColor = Number(data.options.get("global_themeColor")) || 0

        const groups = getStructure()
        const g1Keys = Object.keys(groups)
        if (g1Keys.length > 0) {
          activeGroup1 = g1Keys[0]
          const g2Keys = Object.keys(groups[activeGroup1] || {})
          if (g2Keys.length > 0) {
            activeGroup2 = g2Keys[0]
            const g3Keys = Object.keys(groups[activeGroup1][activeGroup2] || {})
            if (g3Keys.length > 0) activeGroup3 = g3Keys[0]
          }
        }

        attrs.noticeConfig.confirm = async () => {
          try {
            const cleanData = JSON.parse(JSON.stringify(data.options.data, (key, value) => {
              if (key.startsWith("_")) return undefined
              return value
            }))

            const oldAiList = data.options.get("ai_aiList")
            const newAiList = cleanData.find(d => d.key === "ai_aiList")?.value
            let aiConfigChanged = JSON.stringify(oldAiList) !== JSON.stringify(newAiList)

            let tmp = await data.fnCall("cmdOptions", [cleanData])
            await data.options.pull()
            commonData.themeColor = Number(data.options.get("global_themeColor")) || 0
            m.redraw()

            if (aiConfigChanged) {
              Notice.launch({
                tip: trs("设置/提示/模型配置已修改", { cn: "模型配置已修改", en: "Model Configuration Modified" }),
                msg:  tmp.msg + " \n" +trs("设置/提示/缓存穿透确认", { cn: "你修改了模型配置，将同时修改基础提示词。由于上下文前缀缓存需要保证前缀一致，现在前缀已经修改，为了避免缓存穿透，是否立即重新切换并配置模型？", en: "Model config changed. Do you want to re-select model?" }),
                confirm: async () => {
                  Notice.launch({
                    sign: "switch_model_dialog_from_settings",
                    tip: trs("输入栏/提示/选择与管理模型", { cn: "选择与切换模型", en: "Select & Switch Model" }),
                    content: ChatModelSelector
                  })
                }
              })
            } else {
              Notice.launch({
                msg: tmp.msg,
                color: "green"
              })
            }

            return true
          } catch (err) {
            console.error(err)
            Notice.launch({
              msg: trs("系统/消息/保存失败", { cn: "保存失败: ", en: "Save failed: " }) + err.message,
              color: "pink"
            })
            return false
          }
        }
        m.redraw()
      } catch (error) {
        console.error(error)
      }
    },

    oncreate({ dom }) {
      if (dom) {
        containerWidth = dom.offsetWidth
        m.redraw()
      }
    },

    onupdate({ dom }) {
      if (dom && Math.abs(dom.offsetWidth - containerWidth) > 10) {
        containerWidth = dom.offsetWidth
        m.redraw()
      }
    },

    view({ attrs }) {
      const groups = getStructure()
      const g1Keys = Object.keys(groups)
      if (!activeGroup1 && g1Keys.length > 0) activeGroup1 = g1Keys[0]
      const currentG1 = groups[activeGroup1] || {}
      const g2Keys = Object.keys(currentG1)
      if (!activeGroup2 && g2Keys.length > 0) activeGroup2 = g2Keys[0]
      if (g2Keys.length > 0 && !g2Keys.includes(activeGroup2)) activeGroup2 = g2Keys[0]
      const currentG2 = currentG1[activeGroup2] || {}
      const g3Keys = Object.keys(currentG2)
      if (!activeGroup3 && g3Keys.length > 0) activeGroup3 = g3Keys[0]
      if (g3Keys.length > 0 && !g3Keys.includes(activeGroup3)) activeGroup3 = g3Keys[0]

      const currentOptions = currentG2[activeGroup3] || []

      // 移动端/窄窗口判定 (基于视口或移动端环境，避免内容自适应导致的抖动)
      const isMob = Boolean(window.Mob) || (window.innerWidth < 650)

      // 抽屉或侧边栏菜单内容
      const renderSidebarContent = () => {
        return g1Keys.map(k1 => {
          const isG1Active = k1 === activeGroup1
          const subG2Keys = Object.keys(groups[k1] || {})

          return m("",
            {
              key: `g1-${k1}`,
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem"
              }
            },
            [
              // 1级分类项
              m(Box,
                {
                  isBtn: true,
                  color: isG1Active ? "main" : "gray_3",
                  style: {
                    margin: "0",
                    padding: "0.8rem 1.2rem",
                    borderRadius: "3rem",
                    fontSize: "1.6rem",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem"
                  },
                  onclick: () => {
                    activeGroup1 = k1
                    const nextG2Keys = Object.keys(groups[k1] || {})
                    if (nextG2Keys.length > 0) {
                      activeGroup2 = nextG2Keys[0]
                      const nextG3Keys = Object.keys(groups[k1][activeGroup2] || {})
                      if (nextG3Keys.length > 0) activeGroup3 = nextG3Keys[0]
                    }
                    if (isMob) menuShow = false
                  }
                },
                [
                  isG1Active ?
                    m("",
                      {
                        style: {
                          width: "0.8rem",
                          height: "0.8rem",
                          borderRadius: "50%",
                          background: getColor("main").front,
                          flexShrink: 0
                        }
                      }
                    ) : null,
                  m("span", trs("设置界面/分组/" + k1))
                ]
              ),

              // 2级分类展开列表
              isG1Active && subG2Keys.length > 0 ?
                m("",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.2rem",
                      paddingLeft: "1.2rem",
                      marginBottom: "0.4rem"
                    }
                  },
                  subG2Keys.map(k2 => {
                    const isG2Active = k2 === activeGroup2
                    return m(Box,
                      {
                        key: `g2-${k2}`,
                        isBtn: true,
                        color: isG2Active ? "main" : "gray_4",
                        style: {
                          margin: "0",
                          padding: "0.6rem 1.2rem",
                          borderRadius: "3rem",
                          textAlign: "left",
                          opacity: isG2Active ? 1 : 0.8
                        },
                        onclick: () => {
                          activeGroup2 = k2
                          const nextG3Keys = Object.keys(groups[activeGroup1][k2] || {})
                          if (nextG3Keys.length > 0) activeGroup3 = nextG3Keys[0]
                          if (isMob) menuShow = false
                        }
                      },
                      trs("设置界面/分组/" + k2)
                    )
                  })
                ) : null
            ]
          )
        })
      }

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: isMob ? "column" : "row",
            width: "100%",
            height: "100%",
            minWidth: isMob ? "auto" : "50rem",
            minHeight: isMob ? "auto" : "38rem",
            color: getColor("gray_1").front,
            background: getColor("gray_1").back,
            overflow: "hidden",
            position: "relative"
          }
        },
        [
          // 桌面端宽屏幕：左侧固定边栏
          !isMob ?
            m("",
              {
                style: {
                  width: "18rem",
                  background: getColor("gray_3").back,
                  display: "flex",
                  flexDirection: "column",
                  padding: "1rem 0.6rem",
                  gap: "0.4rem",
                  flexShrink: 0,
                  overflowY: "auto"
                }
              },
              renderSidebarContent()
            ) : null,

          // 移动端 / 窄窗口：顶部栏 (汉堡菜单按钮 + 3级 Tab)
          isMob ?
            m("",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  padding: "0.6rem 1rem",
                  gap: "0.6rem",
                  background: getColor("gray_3").back,
                  borderBottom: `0.1rem solid ${getColor("gray_3").front}11`,
                  flexShrink: 0,
                  overflowX: "auto"
                }
              },
              [
                // 汉堡折叠按钮
                m(Box,
                  {
                    isBtn: true,
                    color: menuShow ? "main" : "gray_4",
                    style: {
                      margin: "0",
                      padding: "0.5rem 0.8rem",
                      borderRadius: "3rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    },
                    onclick: (dom, e) => {
                      if (e && e.stopPropagation) e.stopPropagation()
                      menuShow = !menuShow
                    }
                  },
                  [
                    m.trust(window.iconPark.getIcon(menuShow ? "Close" : "HamburgerButton", {
                      size: "1.5rem",
                      fill: menuShow ? getColor("main").front : getColor("gray_4").front
                    }))
                  ]
                ),

                // 3 级 Tab 导航
                g3Keys.map(k3 => {
                  const isG3Active = k3 === activeGroup3
                  return m(Box,
                    {
                      key: `g3-mob-${k3}`,
                      isBtn: true,
                      color: isG3Active ? "main" : "gray_4",
                      style: {
                        margin: "0",
                        padding: "0.5rem 1.2rem",
                        borderRadius: "3rem",
                        flexShrink: 0
                      },
                      onclick: () => {
                        activeGroup3 = k3
                        menuShow = false
                      }
                    },
                    trs("设置界面/分组/" + k3)
                  )
                })
              ]
            ) : null,

          // 移动端：展开的浮动抽屉菜单
          isMob && menuShow ?
            m("",
              {
                style: {
                  position: "absolute",
                  top: "4.5rem",
                  left: "0.8rem",
                  right: "0.8rem",
                  maxHeight: "75%",
                  zIndex: 100,
                  background: getColor("gray_3").back,
                  borderRadius: "3rem",
                  padding: "1rem",
                  boxShadow: "0 1rem 3rem rgba(0,0,0,0.35)",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem"
                }
              },
              renderSidebarContent()
            ) : null,

          // 桌面端宽屏幕：右侧主区域
          !isMob ?
            m("",
              {
                style: {
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  overflow: "hidden"
                }
              },
              [
                // 右侧顶部 3 级导航栏
                g3Keys.length > 0 ?
                  m("",
                    {
                      style: {
                        display: "flex",
                        padding: "0.8rem 1.5rem",
                        alignItems: "center",
                        gap: "0.8rem",
                        flexShrink: 0,
                        overflowX: "auto"
                      }
                    },
                    g3Keys.map(k3 => {
                      const isG3Active = k3 === activeGroup3
                      return m(Box,
                        {
                          key: `g3-${k3}`,
                          isBtn: true,
                          color: isG3Active ? "main" : "gray_4",
                          style: {
                            margin: "0",
                            padding: "0.6rem 1.5rem",
                            borderRadius: "3rem"
                          },
                          onclick: () => activeGroup3 = k3
                        },
                        trs("设置界面/分组/" + k3)
                      )
                    })
                  ) : null,

                // 主体内容区 (当前 3 级设置卡片)
                m("",
                  {
                    style: {
                      flex: 1,
                      padding: "1.5rem",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.5rem"
                    }
                  },
                  [
                    activeGroup3 ?
                      m("",
                        {
                          style: {
                            background: getColor("gray_3").back,
                            borderRadius: "3rem",
                            padding: "1.5rem"
                          }
                        },
                        [
                          m("",
                            {
                              style: {
                                fontSize: "1.8rem",
                                color: getColor("gray_3").front,
                                marginBottom: "1.5rem",
                                paddingBottom: "0.8rem",
                                borderBottom: `0.1rem solid ${getColor("gray_3").front}15`
                              }
                            },
                            trs("设置界面/分组/" + activeGroup3)
                          ),
                          currentOptions.map(opt => m(SettingField, { option: opt })),
                          (activeGroup1 === "全局" && activeGroup2 === "界面" && activeGroup3 === "互动角色") ? m(PetPkgSelector) : null,
                          (activeGroup1 === "全局" && activeGroup2 === "界面" && activeGroup3 === "互动角色") ? m(IdleActionConfigurator) : null
                        ]
                      ) : null
                  ]
                )
              ]
            ) : null,

          // 移动端：主体内容区
          isMob ?
            m("",
              {
                style: {
                  flex: 1,
                  padding: "1rem",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem"
                }
              },
              [
                activeGroup3 ?
                  m("",
                    {
                      style: {
                        background: getColor("gray_3").back,
                        borderRadius: "3rem",
                        padding: "1.2rem"
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            fontSize: "1.6rem",
                            color: getColor("gray_3").front,
                            marginBottom: "1.2rem",
                            paddingBottom: "0.6rem",
                            borderBottom: `0.1rem solid ${getColor("gray_3").front}15`
                          }
                        },
                        trs("设置界面/分组/" + activeGroup3)
                      ),
                      currentOptions.map(opt => m(SettingField, { option: opt })),
                      (activeGroup1 === "全局" && activeGroup2 === "界面" && activeGroup3 === "互动角色") ? m(PetPkgSelector) : null,
                      (activeGroup1 === "全局" && activeGroup2 === "界面" && activeGroup3 === "互动角色") ? m(IdleActionConfigurator) : null
                    ]
                  ) : null
              ]
            ) : null
        ]
      )
    }
  }
}
