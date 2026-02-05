import Box from "../common/box.js"
import data from "./settingData.js"
import Notice from "../common/notice.js"
import m from "mithril"

export default () => {
  let activeGroup1 = ""
  let activeGroup2 = ""

  // Field Label Mapping
  const MODEL_FIELD_MAP = {
    name: "配置别名",
    model: "模型ID (Model Name)",
    apiKey: "API Key",
    url: "接口地址 (Base URL)",
    prompt: "预设提示词 (System Prompt)",
    price: "价格权重",
    tokenRate: "消耗倍率",
    preTokens: "Token 余额 (Remaining Quota)",
    switch: "启用状态",
    system: "系统内置"
  }

  // Helper to restructure flat data into nested groups
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

  // --- Specialized Component: AI Model List Editor ---
  const ModelListEditor = {
    view: ({ attrs }) => {
      const { value, onchange } = attrs

      return m("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "1rem"
        }
      }, [
        value.map((model, index) => {
          const isExpanded = model._expanded || false
          return m("div", {
            style: {
              background: "rgba(255,255,255,0.05)",
              borderRadius: "1rem",
              border: "1px solid rgba(255,255,255,0.05)",
              overflow: "hidden",
              transition: "background 0.3s"
            }
          }, [
            // Header (Summary)
            m("div", {
              style: {
                padding: "1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                background: isExpanded ? "rgba(255,255,255,0.05)" : "transparent"
              },
              onclick: () => model._expanded = !model._expanded
            }, [
              // Status Dot
              m("div", {
                style: {
                  width: "0.8rem",
                  height: "0.8rem",
                  borderRadius: "50%",
                  background: (model.switch === 1 || model.switch === true) ? "#755d5c" : "#555",
                  marginRight: "1rem",
                  boxShadow: (model.switch === 1 || model.switch === true) ? "0 0 0.5rem #755d5c" : "none"
                }
              }),
              // Name
              m("div", { style: { fontWeight: "bold", fontSize: "1.1rem", color: "#eee", flex: 1 } }, model.name || "未命名模型"),
              // Model ID helper
              m("div", { style: { fontSize: "0.9rem", color: "#888", marginRight: "1rem" } }, model.model),
              // Delete Button
              m("div", {
                style: {
                  padding: "0.3rem 0.8rem",
                  color: "#ff6b6b",
                  background: "rgba(255, 107, 107, 0.1)",
                  borderRadius: "0.5rem",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  opacity: 0.9
                },
                onclick: (e) => {
                  e.stopPropagation()
                  Notice.launch({
                    tip: "确认删除",
                    msg: `确定要删除模型 "${model.name}" 吗？`,
                    confirm: async () => {
                      value.splice(index, 1)
                      if (onchange) onchange(value)
                      return undefined
                    },
                  })
                }
              }, "删除")
            ]),

            // Expanded Details
            isExpanded ? m("div", {
              style: {
                padding: "1.5rem",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "1.2rem"
              }
            }, Object.keys(model).filter(k => k !== "_expanded" && k !== "_showKey" && k !== "system" && k !== "price" && k !== "tokenRate").map(key => {
              const label = MODEL_FIELD_MAP[key] || key
              const val = model[key]
              const isBool = key === "switch" || key === "system" || typeof val === "boolean" || (key === "switch" && (val === 0 || val === 1))
              const isLongText = key === "prompt"
              const isPassword = key === "apiKey"

              return m("div", {
                style: { display: "flex", flexDirection: "column" }
              }, [
                m("label", { style: { fontSize: "0.9rem", color: "#aaa", marginBottom: "0.5rem", marginLeft: "0.2rem" } }, label),
                isBool ? m("div", {
                  style: {
                    width: "3rem", height: "1.6rem", borderRadius: "2rem",
                    background: (val === 1 || val === true) ? "#755d5c" : "#555",
                    position: "relative", cursor: "pointer", transition: "0.3s",
                    border: "1px solid rgba(255,255,255,0.1)"
                  },
                  onclick: () => {
                    model[key] = (val === 1 || val === true) ? 0 : 1
                    if (onchange) onchange(value)
                  }
                }, m("div", {
                  style: {
                    width: "1.2rem", height: "1.2rem", borderRadius: "50%", background: "#fff",
                    position: "absolute", top: "0.15rem", left: (val === 1 || val === true) ? "1.6rem" : "0.2rem", transition: "0.3s",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                  }
                })) :
                  (isLongText ? m("textarea", {
                    value: val,
                    rows: 5,
                    style: {
                      background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#eee", padding: "1rem", borderRadius: "0.8rem", outline: "none", resize: "vertical",
                      fontSize: "1rem", lineHeight: "1.5", transition: "background 0.3s"
                    },
                    onfocus: (e) => e.target.style.background = "rgba(0,0,0,0.3)",
                    onblur: (e) => e.target.style.background = "rgba(0,0,0,0.2)",
                    oninput: (e) => { model[key] = e.target.value; if (onchange) onchange(value) }
                  }) : m("div", {
                    style: { position: "relative", display: "flex", alignItems: "center" }
                  }, [
                    m("input", {
                      type: isPassword ? (model._showKey ? "text" : "password") : ((typeof val === "number") ? "number" : "text"),
                      value: val,
                      style: {
                        background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "#eee", padding: "0.8rem 1rem", borderRadius: "0.8rem", outline: "none",
                        width: "100%", boxSizing: "border-box", fontSize: "1rem",
                        paddingRight: isPassword ? "3rem" : "1rem", transition: "background 0.3s"
                      },
                      onfocus: (e) => e.target.style.background = "rgba(0,0,0,0.3)",
                      onblur: (e) => e.target.style.background = "rgba(0,0,0,0.2)",
                      oninput: (e) => {
                        let v = e.target.value
                        if (typeof val === "number") v = Number(v)
                        model[key] = v
                        if (onchange) onchange(value)
                      }
                    }),
                    // Password Toggle Button
                    isPassword ? m("div", {
                      style: {
                        position: "absolute", right: "10px", cursor: "pointer",
                        opacity: 0.6, padding: "5px", display: "flex", alignItems: "center"
                      },
                      onclick: () => model._showKey = !model._showKey
                    }, m.trust(model._showKey ? window.iconPark.getIcon("PreviewOpen") : window.iconPark.getIcon("PreviewClose"))) : null
                  ])
                  ),

                // Description for preTokens
                (key === "preTokens") ? m("div", {
                  style: { fontSize: "0.85rem", color: "#8d8d8d", marginTop: "0.5rem", paddingLeft: "0.2rem" }
                }, "允许使用的Token余额，系统会在对话时自动扣除。归零或为负数时模型将不可用。") : null
              ])
            })) : null
          ])
        }),
        // Add / Import Buttons
        m("div", {
          style: { display: "flex", gap: "10px" }
        }, [
          m("div", {
            style: {
              flex: 1,
              padding: "1rem",
              border: "2px dashed rgba(255,255,255,0.1)",
              borderRadius: "1rem",
              textAlign: "center",
              color: "#aaa",
              cursor: "pointer",
              transition: "all 0.2s",
              background: "transparent"
            },
            onmouseover: (e) => { e.target.style.background = "rgba(255,255,255,0.05)"; e.target.style.borderColor = "rgba(255,255,255,0.2)" },
            onmouseout: (e) => { e.target.style.background = "transparent"; e.target.style.borderColor = "rgba(255,255,255,0.1)" },
            onclick: () => {
              const template = value.length > 0 ? JSON.parse(JSON.stringify(value[0])) : {
                name: "新模型", model: "gpt-3.5-turbo", apiKey: "", url: "https://api.openai.com/v1",
                price: 1, tokenRate: 1, system: 0, prompt: "", switch: 1, preTokens: 4000
              }
              template.name = "New Model " + (value.length + 1) // Ensure simple string
              delete template._expanded
              delete template._showKey
              value.push(template)
              if (onchange) onchange(value)
            }
          }, "+ 添加新模型"),

          m("div", {
            style: {
              flex: 1,
              padding: "1rem",
              border: "2px dashed rgba(117, 93, 92, 0.3)",
              borderRadius: "1rem",
              textAlign: "center",
              color: "#cca",
              cursor: "pointer",
              transition: "all 0.2s",
              background: "rgba(117, 93, 92, 0.1)"
            },
            onmouseover: (e) => { e.target.style.background = "rgba(117, 93, 92, 0.2)"; e.target.style.borderColor = "rgba(117, 93, 92, 0.5)" },
            onmouseout: (e) => { e.target.style.background = "rgba(117, 93, 92, 0.1)"; e.target.style.borderColor = "rgba(117, 93, 92, 0.3)" },
            onclick: () => {
              let url = "http://localhost:11434"
              Notice.launch({
                tip: "配置 Ollama 地址",
                content: {
                  view: () => m("div", { style: { padding: "1.5rem", minWidth: "300px" } }, [
                    m("div", { style: { marginBottom: "1rem", color: "#ccc" } }, "请输入 Ollama API 服务地址："),
                    m(Box, {
                      tagName: "input[type=text]",
                      value: url,
                      style: {
                        width: "100%", margin: "0", boxSizing: "border-box", borderRadius: "1.5rem",
                        padding: "1rem 1.5rem", fontSize: "1rem"
                      },
                      oninput: (dom, e) => {
                        url = e.target.value
                      }
                    }),
                    m("div", { style: { fontSize: "0.85rem", color: "#888", marginTop: "1rem" } }, "默认端口为 11434")
                  ])
                },
                confirm: async () => {
                  if (!url) return false
                  Notice.launch({ msg: "正在尝试连接..." })
                  try {
                    const res = await data.fnCall("getOllamaModels", [url])
                    if (res.ok && res.data) {
                      let count = 0
                      res.data.forEach(m => {
                        if (!value.find(v => v.model === m.model)) {
                          value.push(m)
                          count++
                        }
                      })
                      if (count > 0) {
                        if (onchange) onchange(value)
                        Notice.launch({ msg: `成功导入 ${count} 个模型` })
                      } else {
                        Notice.launch({ msg: "未发现新模型 (已全部存在)" })
                      }
                    } else {
                      Notice.launch({ msg: res.msg || "导入失败", type: "error" })
                    }
                  } catch (err) {
                    console.error("Ollama Import Error:", err)
                    let errMsg = "未知错误"
                    if (err && err.message) errMsg = err.message
                    else if (typeof err === "string") errMsg = err
                    else errMsg = JSON.stringify(err)

                    Notice.launch({ msg: "发生错误: " + errMsg, type: "error" })
                  }
                  return undefined
                },
                cancel: async () => true
              })
            }
          }, "从 Ollama 导入")
        ]),

        // Ollama Guide Link
        m("div", {
          style: { marginTop: "1rem", textAlign: "center" }
        }, [
          m("span", {
            style: { color: "#888", fontSize: "0.9rem", cursor: "pointer", textDecoration: "underline" },
            onclick: () => {
              Notice.launch({
                tip: "Ollama 使用帮助",
                content: {
                  view: () => m("div", { style: { padding: "2rem", lineHeight: "1.6", color: "#ddd", maxWidth: "600px" } }, [
                    m("h3", { style: { color: "#fff", marginBottom: "1rem" } }, "🚀 Ollama 快速指南"),
                    m("p", "1. 确保您的电脑上已根据官网说明安装并运行 Ollama。"),
                    m("p", "2. 默认情况下，本程序会连接到 http://localhost:11434。"),
                    m("p", "3. 如果连接失败："),
                    m("ul", { style: { paddingLeft: "1.5rem", color: "#aaa" } }, [
                      m("li", "检查 Ollama 小图标是否出现在系统托盘中。"),
                      m("li", "如果是远程连接，请确保 Ollama 启动时设置了 OLLAMA_HOST=0.0.0.0。"),
                      m("li", "无需配置 CORS (OLLAMA_ORIGINS)，因为我们是通过后端直连。")
                    ]),
                    m("p", { style: { marginTop: "1rem" } }, "点击导入时，您可以修改默认端口号以适应您的配置。")
                  ])
                }
              })
            }
          }, "📖 如何使用 Ollama？")
        ])
      ])
    }
  }

  // --- Specialized Component: Shell Map Editor ---
  const ShellEditor = {
    view: ({ attrs }) => {
      const { value, onchange } = attrs
      const osMap = { win: "Windows", mac: "macOS", linux: "Linux" }

      return m("div", {
        style: { display: "flex", flexDirection: "column", gap: "1rem" }
      }, Object.keys(value).map(osKey => {
        return m("div", {
          style: { display: "flex", alignItems: "center", gap: "1rem" }
        }, [
          m("div", { style: { width: "80px", color: "#ccc", fontSize: "1rem" } }, osMap[osKey] || osKey),
          m("input", {
            value: value[osKey],
            style: {
              flex: 1,
              background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#eee", padding: "0.8rem 1rem", borderRadius: "0.8rem", outline: "none",
              fontSize: "1rem"
            },
            oninput: (e) => {
              value[osKey] = e.target.value
              if (onchange) onchange(value)
            }
          })
        ])
      }))
    }
  }

  // Generic Setting Field Router
  const SettingField = {
    view: ({ attrs }) => {
      const opt = attrs.option

      // Dispatch to Specialized Editors
      if (opt.key === "ai_aiList") {
        return m("div", { style: { marginBottom: "2rem" } }, [
          m("label", { style: { display: "block", color: "#ddd", marginBottom: "1rem", fontWeight: "bold", fontSize: "1.1rem" } }, opt.name),
          m(ModelListEditor, { value: opt.value, onchange: (v) => opt.value = v })
        ])
      }

      if (opt.key === "global_terminalShell") {
        return m("div", { style: { marginBottom: "2rem" } }, [
          m("label", { style: { display: "block", color: "#ddd", marginBottom: "1rem", fontWeight: "bold", fontSize: "1.1rem" } }, opt.name),
          m(ShellEditor, { value: opt.value, onchange: (v) => opt.value = v })
        ])
      }

      // Default Renderer
      const switchRegex = /^(is|use|enable|auto|show|hide|allow)|(switch|enable|mode|开关)$/i
      const isBoolType = typeof opt.value === "boolean" || (typeof opt.value === "number" && (opt.value === 0 || opt.value === 1) && switchRegex.test(opt.name + opt.key))
      const isSwitchKey = (opt.key && switchRegex.test(opt.key)) || (opt.name && switchRegex.test(opt.name))
      const isBool = isBoolType || isSwitchKey

      const isNumber = typeof opt.value === "number" && !isBool
      const isPassword = !isBool && opt.key && /key|password|token|secret/i.test(opt.key)

      // State for show/hide password (using option object to store temp state)
      if (isPassword && opt._showKey === undefined) opt._showKey = false

      return m("div", {
        style: {
          marginBottom: "1.5rem",
          display: "flex",
          flexDirection: "column",
        }
      }, [
        m("label", {
          style: {
            fontSize: "1rem", color: "#ccc", marginBottom: "0.8rem",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingLeft: "0.2rem"
          }
        }, [
          m("span", opt.name || opt.key),
          isBool ? m("div", {
            style: {
              width: "3rem", height: "1.6rem", borderRadius: "2rem",
              background: (opt.value === 1 || opt.value === true) ? "#755d5c" : "#555",
              position: "relative", cursor: "pointer", transition: "0.3s",
              border: "1px solid rgba(255,255,255,0.1)"
            },
            onclick: () => {
              if (typeof opt.value === "number") opt.value = opt.value === 1 ? 0 : 1
              else opt.value = !opt.value
            }
          }, m("div", {
            style: {
              width: "1.2rem", height: "1.2rem", borderRadius: "50%", background: "#fff",
              position: "absolute", top: "0.15rem", left: (opt.value === 1 || opt.value === true) ? "1.6rem" : "0.2rem", transition: "0.3s",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
            }
          })) : null
        ]),

        !isBool ? m("div", { style: { position: "relative", display: "flex", alignItems: "center" } }, [
          m("input", {
            type: isPassword ? (opt._showKey ? "text" : "password") : (isNumber ? "number" : "text"),
            value: opt.value,
            style: {
              padding: "0.8rem 1rem", background: "rgba(0, 0, 0, 0.2)",
              border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "0.8rem",
              color: "#eee", fontSize: "1rem", outline: "none", width: "100%", boxSizing: "border-box",
              paddingRight: isPassword ? "3rem" : "1rem", transition: "background 0.3s"
            },
            onfocus: (e) => e.target.style.background = "rgba(0,0,0,0.3)",
            onblur: (e) => e.target.style.background = "rgba(0,0,0,0.2)",
            oninput: (e) => {
              let val = e.target.value
              if (isNumber) val = Number(val)
              opt.value = val
            }
          }),
          isPassword ? m("div", {
            style: {
              position: "absolute", right: "10px", cursor: "pointer",
              opacity: 0.6, padding: "5px", display: "flex", alignItems: "center"
            },
            onclick: () => opt._showKey = !opt._showKey
          }, m.trust(opt._showKey ? window.iconPark.getIcon("PreviewOpen") : window.iconPark.getIcon("PreviewClose"))) : null
        ]) : null,

        (opt.desc && opt.desc !== opt.name) ? m("div", {
          style: { fontSize: "0.85rem", color: "#8d8d8d", marginTop: "0.5rem", paddingLeft: "0.2rem" }
        }, opt.desc) : null
      ])
    }
  }

  // ... Main Layout (unchanged) ...
  return {
    async oninit({ attrs }) {
      // ... same as before
      try {
        await data.initSocket()
        await data.options.pull()

        // Defaults
        const groups = getStructure()
        const g1Keys = Object.keys(groups)
        if (g1Keys.length > 0) {
          activeGroup1 = g1Keys[0]
          const g2Keys = Object.keys(groups[activeGroup1])
          if (g2Keys.length > 0) activeGroup2 = g2Keys[0]
        }

        attrs.noticeConfig.confirm = async () => {
          try {
            // Sanitize data: Remove UI-only properties starting with "_" (like _expanded)
            const cleanData = JSON.parse(JSON.stringify(data.options.data, (key, value) => {
              if (key.startsWith("_")) return undefined;
              return value;
            }))

            console.log("Saving options...", cleanData)
            let tmp = await data.fnCall("cmdOptions", [cleanData])
            Notice.launch({ msg: tmp.msg, timeout: 2000 })
            await data.options.pull()
            return true
          } catch (err) {
            console.error(err)
            Notice.launch({ msg: "保存失败: " + err.message, type: "error" })
            return false
          }
        }
        m.redraw()
      } catch (error) { console.error(error) }
    },

    view() {
      const groups = getStructure()
      const g1Keys = Object.keys(groups)
      if (!activeGroup1 && g1Keys.length > 0) activeGroup1 = g1Keys[0]
      const currentG1 = groups[activeGroup1] || {}
      const g2Keys = Object.keys(currentG1)
      if (!activeGroup2 && g2Keys.length > 0) activeGroup2 = g2Keys[0]
      if (g2Keys.length > 0 && !g2Keys.includes(activeGroup2)) activeGroup2 = g2Keys[0]
      const currentG2 = currentG1[activeGroup2] || {}
      const g3Keys = Object.keys(currentG2)

      return m("div", {
        style: {
          display: "flex", width: "100%", height: "100%", color: "#eee",
          overflow: "hidden", background: "#393839", // Softer dark background
          borderRadius: "0 0 2rem 2rem" // Match Notice bottom radius
        }
      }, [
        // Sidebar
        m("div", {
          style: {
            width: "160px", background: "rgba(0,0,0,0.2)",
            display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.05)",
            padding: "1rem 0", gap: "0.5rem", flexShrink: 0
          }
        }, g1Keys.map(k => {
          const isActive = k === activeGroup1
          return m("div", {
            style: {
              padding: "1rem 1.5rem", cursor: "pointer",
              background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
              borderLeft: isActive ? "0.3rem solid #755d5c" : "0.3rem solid transparent",
              color: isActive ? "#fff" : "#aaa", fontWeight: isActive ? "bold" : "normal",
              transition: "all 0.3s", fontSize: "1.05rem"
            },
            onclick: () => {
              activeGroup1 = k
              const newG2Keys = Object.keys(groups[activeGroup1])
              if (newG2Keys.length > 0) activeGroup2 = newG2Keys[0]
            }
          }, k)
        })),

        // Main Content
        m("div", {
          style: { flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }
        }, [
          // Tabs
          g2Keys.length > 0 ? m("div", {
            style: {
              display: "flex", padding: "0 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(0,0,0,0.1)", alignItems: "center", height: "4rem", flexShrink: 0,
              gap: "1rem"
            }
          }, g2Keys.map(k => {
            const isActive = k === activeGroup2
            return m("div", {
              style: {
                padding: "0.6rem 1.2rem", cursor: "pointer", borderRadius: "2rem",
                background: isActive ? "rgba(117, 93, 92, 0.8)" : "rgba(255,255,255,0.05)",
                color: isActive ? "#fff" : "#aaa",
                fontSize: "0.95rem", transition: "all 0.3s",
                boxShadow: isActive ? "0 4px 12px rgba(0,0,0,0.1)" : "none"
              },
              onclick: () => activeGroup2 = k
            }, k)
          })) : null,

          // Settings List
          m("div", {
            style: { flex: 1, padding: "2rem 3rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2rem" }
          }, g3Keys.map(group3Name => {
            const options = currentG2[group3Name]
            return m("div", {
              style: {
                background: "rgba(255,255,255,0.03)", borderRadius: "1.5rem", padding: "2rem",
                border: "1px solid rgba(255,255,255,0.05)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.1)"
              }
            }, [
              m("div", {
                style: {
                  fontSize: "1.2rem", fontWeight: "bold", color: "#eee", marginBottom: "1.5rem",
                  paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.05)"
                }
              }, group3Name),
              options.map(opt => m(SettingField, { option: opt }))
            ])
          }))
        ])
      ])
    }
  }
}
