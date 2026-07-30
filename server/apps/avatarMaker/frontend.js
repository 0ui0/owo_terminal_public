import myAppData from "./avatarMakerData.js"

export default (
  {
    appId,
    m,
    Notice,
    ioSocket,
    commonData,
    iconPark,
    getColor,
    Box,
    Tag,
    trs,
    settingData,
    AutoForm,
    FormItem
  }
) => {
  let logs = []
  const maxLogs = 100
  let initialized = false
  let activeTab = "image" // "image" or "video" API tab
  let mode = "0a" // "0a", "0b", "1", "2a", "2b"
  let modeCategory = "image" // "image" or "video"
  let showApiKey = false

  let imageProvider = "volcengine" // "volcengine" or "dashscope"
  let videoProvider = "volcengine" // "volcengine" or "dashscope"

  // Pet Package Expressions preset library mapped directly from statics/petPkgs/default/pet filenames
  const presetPrompts = [
    { label: "😊 微笑 (smile)", prompt: "微笑，表情柔和幸福，嘴角上扬" },
    { label: "😄 闭眼笑 (smileEye)", prompt: "双眼笑成弯月，闭眼开心微笑" },
    { label: "😁 露齿笑 (grin)", prompt: "露齿大笑，心情十分愉快" },
    { label: "😃 欢快露齿笑 (grinHappy)", prompt: "欢快大笑，露齿微笑，神采飞扬" },
    { label: "😅 尴尬露齿笑 (grinEmbarrassed)", prompt: "尴尬地露齿苦笑，双颊带微红" },
    { label: "😡 生气怒视 (angry)", prompt: "生气怒视，眉毛下压紧锁，表情愤怒" },
    { label: "😬 咬牙 (clenchedTeeth)", prompt: "咬牙切齿，面部神情紧绷" },
    { label: "🤬 愤怒咬牙 (clenchedTeethAngry)", prompt: "愤怒咬牙，双眼瞪大愤怒，非常生气" },
    { label: "😰 尴尬咬牙 (clenchedTeethEmbarrassed)", prompt: "尴尬咬牙，汗颜，眼神躲闪" },
    { label: "😭 伤心流泪 (crySad)", prompt: "伤心流泪，眼角带泪花，非常难过" },
    { label: "🥹 喜极而泣 (cryHappy)", prompt: "喜极而泣，眼中带泪，满脸感动微笑" },
    { label: "😞 悲伤沮丧 (sad)", prompt: "低头沮丧，眼神失落悲伤" },
    { label: "😗 嘟嘴 (pout)", prompt: "嘟起小嘴，表达不满与娇嗔" },
    { label: "😚 闭眼嘟嘴 (poutEye)", prompt: "闭上双眼嘟嘴，神情傲娇俏皮" },
    { label: "🥺 委屈嘟嘴 (poutSad)", prompt: "委屈嘟嘴，眼神哀求失落" },
    { label: "😦 迷茫嘟嘴 (poutSlacken)", prompt: "迷茫发呆嘟嘴，神情茫然" },
    { label: "😨 紧张慌张 (nervous)", prompt: "紧张慌张，眼神不安，双颊微汗" },
    { label: "😐 发呆放空 (slacken)", prompt: "眼神放空发呆，神情呆滞" },
    { label: "😶 深度发呆 (slackenMore)", prompt: "深度发呆放空，张着小嘴发愣" },
    { label: "🎅 圣诞节日风 (chrimas)", prompt: "头戴圣诞帽，表情欢快喜庆" },
    { label: "🎄 圣诞闭眼笑 (chrimasEye)", prompt: "头戴圣诞帽，闭眼欢快微笑，充满节日气氛" }
  ]

  // Separated configuration groups
  let pathOptions = [
    {
      name: "最终输出目录",
      description: "生成的成品存放目录（例如 /xxx/主题包名称/）",
      value: "",
      key: "outputDir"
    },
    {
      name: "全身像素材路径",
      description: "静态全身绿幕图片绝对路径",
      value: "",
      key: "fullBodyBase"
    },
    {
      name: "半身像素材路径",
      description: "静态半身绿幕图片绝对路径",
      value: "",
      key: "halfBodyBase"
    }
  ]

  let imageOptions = [
    {
      name: "图片 API URL",
      description: "大模型图片生成接口 URL (右侧提供一键填入默认官方地址按钮)",
      value: "",
      key: "imageApiUrl"
    },
    {
      name: "图片 API Key",
      description: "大模型图片生成 API Key",
      value: "",
      key: "imageApiKey",
      isPassword: true
    },
    {
      name: "图片生成模型 (Model)",
      description: "图片模型接入点 Endpoint 名称 (火山: ep-xxx / 阿里: wanx2.1-i2i-turbo)",
      value: "",
      key: "imageModel"
    }
  ]

  let videoOptions = [
    {
      name: "视频 API URL",
      description: "大模型视频生成接口 URL (右侧提供一键填入默认官方地址按钮)",
      value: "",
      key: "videoApiUrl"
    },
    {
      name: "视频 API Key",
      description: "大模型视频生成 API Key",
      value: "",
      key: "videoApiKey",
      isPassword: true
    },
    {
      name: "视频生成模型 (Model)",
      description: "视频模型接入点 Endpoint 名称 (火山: ep-xxx / 阿里: wanx2.1-kf2v-plus)",
      value: "",
      key: "videoModel"
    }
  ]

  let promptOption = {
    name: "表情与动作提示词",
    description: "具体的表情或动作描述，例如：傲娇坏笑、闭眼微笑、手舞足蹈等",
    value: "",
    key: "prompt"
  }

  const getFullConfigData = (safeOnly = false) => {
    const configData = {
      mode,
      modeCategory,
      imageProvider,
      videoProvider,
      prompt: (promptOption.value || "").trim(),
      outputDir: (pathOptions.find(o => o.key === "outputDir")?.value || "").trim(),
      fullBodyBase: (pathOptions.find(o => o.key === "fullBodyBase")?.value || "").trim(),
      halfBodyBase: (pathOptions.find(o => o.key === "halfBodyBase")?.value || "").trim(),
      imageApiUrl: (imageOptions.find(o => o.key === "imageApiUrl")?.value || "").trim(),
      imageModel: (imageOptions.find(o => o.key === "imageModel")?.value || "").trim(),
      videoApiUrl: (videoOptions.find(o => o.key === "videoApiUrl")?.value || "").trim(),
      videoModel: (videoOptions.find(o => o.key === "videoModel")?.value || "").trim()
    }
    if (!safeOnly) {
      configData.imageApiKey = (imageOptions.find(o => o.key === "imageApiKey")?.value || "").trim()
      configData.videoApiKey = (videoOptions.find(o => o.key === "videoApiKey")?.value || "").trim()
    }
    return configData
  }

  const initOptionValues = (vnode) => {
    if (initialized || !vnode.attrs.data) {
      return
    }
    const allOpts = [...pathOptions, ...imageOptions, ...videoOptions, promptOption]
    allOpts.forEach(opt => {
      const rawVal = vnode.attrs.data[opt.key]
      if (rawVal !== undefined) {
        opt.value = typeof rawVal === "string" ? rawVal.trim() : (rawVal || "")
      }
    })
    if (vnode.attrs.data.mode) mode = vnode.attrs.data.mode
    if (vnode.attrs.data.imageProvider) imageProvider = vnode.attrs.data.imageProvider
    if (vnode.attrs.data.videoProvider) videoProvider = vnode.attrs.data.videoProvider

    if (mode === "0a" || mode === "0b") {
      modeCategory = "image"
    } else {
      modeCategory = "video"
    }
    initialized = true
  }

  const validateForm = () => {
    const config = getFullConfigData(false)

    if (!config.outputDir) return "请填写「最终输出目录」"
    if (!config.prompt) return "请填写「表情与动作提示词」"

    if (mode === "0a") {
      if (!config.halfBodyBase) return "静态半身表情模式需填写「半身像素材路径」"
      if (!config.imageApiUrl) return "静态半身表情模式需填写「图片 API URL」"
      if (!config.imageApiKey) return "静态半身表情模式需填写「图片 API Key」"
      if (!config.imageModel) return "静态半身表情模式需填写「图片生成模型」"
      return null
    } else if (mode === "0b") {
      if (!config.fullBodyBase) return "静态全身动作模式需填写「全身像素材路径」"
      if (!config.imageApiUrl) return "静态全身动作模式需填写「图片 API URL」"
      if (!config.imageApiKey) return "静态全身动作模式需填写「图片 API Key」"
      if (!config.imageModel) return "静态全身动作模式需填写「图片生成模型」"
      return null
    }

    if (!config.videoApiUrl) return "请填写「视频 API URL」"
    if (!config.videoApiKey) return "请填写「视频 API Key」"
    if (!config.videoModel) return "请填写「视频生成模型 (Model)」"

    if (mode === "1") {
      if (!config.halfBodyBase) return "表情特写视频模式需填写「半身像素材路径」"
      if (!config.imageApiUrl) return "表情特写视频模式需填写「图片 API URL」"
      if (!config.imageApiKey) return "表情特写视频模式需填写「图片 API Key」"
      if (!config.imageModel) return "表情特写视频模式需填写「图片生成模型」"
    } else if (mode === "2a") {
      if (!config.fullBodyBase) return "全身动作视频模式需填写「全身像素材路径」"
    } else if (mode === "2b") {
      if (!config.fullBodyBase) return "全身动作视频模式需填写「全身像素材路径」"
      if (!config.imageApiUrl) return "模式2b绘制尾帧需填写「图片 API URL」"
      if (!config.imageApiKey) return "模式2b绘制尾帧需填写「图片 API Key」"
      if (!config.imageModel) return "模式2b绘制尾帧需填写「图片生成模型」"
    }

    return null
  }

  const exportConfig = async () => {
    try {
      const now = new Date()
      const dStr = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") + "_" +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        String(now.getSeconds()).padStart(2, "0")

      const defaultFileName = `角色包制作配置_${dStr}.json`

      const saveDialogRes = await settingData.fnCall("appSaveDialog", [
        {
          filePath: defaultFileName,
          filters: [{ name: "JSON Config", extensions: ["json"] }]
        }
      ])
      if (!saveDialogRes || !saveDialogRes.ok || !saveDialogRes.filePath) return

      const exportData = getFullConfigData(false)

      const saveRes = await settingData.fnCall("appDispatch", [
        appId,
        "saveToFile",
        {
          filePath: saveDialogRes.filePath,
          content: JSON.stringify(exportData, null, 2)
        }
      ])

      if (saveRes && saveRes.ok) {
        Notice.launch({ msg: "✅ 配置导出成功！" })
        logs.push(`✅ 配置已成功导出至: ${saveDialogRes.filePath}`)
      } else {
        Notice.launch({ msg: `❌ 导出失败: ${saveRes?.msg || "写入失败"}` })
      }
    } catch (err) {
      Notice.launch({ msg: `❌ 导出失败: ${err.message}` })
    }
  }

  const importConfig = async () => {
    try {
      const dialogRes = await settingData.fnCall("appOpenDialog", [
        {
          title: "选择配置文件",
          filters: [{ name: "JSON Config", extensions: ["json"] }]
        }
      ])
      if (!dialogRes || !dialogRes.ok || dialogRes.canceled || !dialogRes.filePath) return

      const readRes = await settingData.fnCall("appDispatch", [
        appId,
        "readFile",
        { filePath: dialogRes.filePath }
      ])

      if (readRes && readRes.ok && readRes.data) {
        const imported = JSON.parse(readRes.data)
        const allOpts = [...pathOptions, ...imageOptions, ...videoOptions, promptOption]
        allOpts.forEach(opt => {
          if (imported[opt.key] !== undefined) {
            const val = imported[opt.key]
            opt.value = typeof val === "string" ? val.trim() : (val || "")
          }
        })
        if (imported.mode) mode = imported.mode
        if (imported.imageProvider) imageProvider = imported.imageProvider
        if (imported.videoProvider) videoProvider = imported.videoProvider

        if (mode === "0a" || mode === "0b") {
          modeCategory = "image"
        } else {
          modeCategory = "video"
        }

        Notice.launch({ msg: "✅ 配置文件导入成功！" })
        logs.push(`✅ 配置文件已加载: ${dialogRes.filePath}`)
        m.redraw()
      } else {
        Notice.launch({ msg: `❌ 读取失败: ${readRes?.msg || "文件内容为空"}` })
      }
    } catch (err) {
      Notice.launch({ msg: `❌ 导入失败: ${err.message}` })
    }
  }

  const instanceInterface = {
    onDispatch: (
      msg,
      callback
    ) => {
      if (msg.action === "log") {
        logs.push(msg.args.message)
        if (logs.length > maxLogs) {
          logs.shift()
        }
        m.redraw()
      } else if (msg.action === "requestConfig") {
        const safeOnly = msg.args?.safeOnly !== false
        const requestId = msg.args?.requestId
        const configData = getFullConfigData(safeOnly)
        if (requestId) {
          settingData.fnCall("appDispatch", [appId, "replyConfig", { requestId, config: configData }])
        }
        if (callback) {
          callback({ ok: true, msg: "拉取配置成功", data: configData })
        }
        return
      }

      if (callback) {
        callback(
          {
            ok: true,
            msg: "操作成功"
          }
        )
      }
    }
  }

  const init = () => {
    myAppData.addTool(
      "commonData",
      commonData
    )
    myAppData.registerInstances(
      appId,
      instanceInterface
    )
    if (commonData.registerApp) {
      commonData.registerApp(
        appId,
        myAppData
      )
    }
  }
  init()

  return {
    onremove() {
      myAppData.unregisterInstances(
        appId,
        commonData
      )
    },
    view(vnode) {
      initOptionValues(vnode)

      const imageModeList = [
        {
          label: "静态半身表情图片 (基于半身素材绘制新表情立绘)",
          value: "0a"
        },
        {
          label: "静态全身动作图片 (基于全身素材绘制新动作立绘)",
          value: "0b"
        }
      ]

      const videoModeList = [
        {
          label: "表情特写视频 (靠近镜头做表情并拉远)",
          value: "1"
        },
        {
          label: "全身动作视频 - 首尾相同 (适合微动或循环待机)",
          value: "2a"
        },
        {
          label: "全身动作视频 - 首尾不同 (适合从静立过渡到指定动作)",
          value: "2b"
        }
      ]

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            width: "100%",
            background: getColor("gray_1").back,
            color: getColor("gray_1").front,
            padding: window.Mob ? "0.8rem" : "1.5rem",
            boxSizing: "border-box"
          }
        },
        [
          // 1. Sticky Header at the top (Action Buttons + Console Log Box)
          m("",
            {
              style: {
                position: "sticky",
                top: 0,
                zIndex: 20,
                background: getColor("gray_1").back,
                paddingBottom: "1rem",
                marginBottom: "1rem"
              }
            },
            [
              // Action Buttons Row: Pure Box components with natural width in natural flow
              m("",
                {
                  style: {
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.6rem",
                    marginBottom: "1rem"
                  }
                },
                [
                  m(Box,
                    {
                      color: "main",
                      isBtn: true,
                      onclick: async () => {
                        const err = validateForm()
                        if (err) {
                          Notice.launch({
                            msg: `⚠️ 表单未填写完整: ${err}`,
                            type: "error"
                          })
                          logs.push(`❌ 提交被阻断: ${err}`)
                          m.redraw()
                          return
                        }

                        logs.push(
                          "⏳ 正在提交任务到主控 AI..."
                        )
                        try {
                          await settingData.fnCall(
                            "appDispatch",
                            [
                              appId,
                              "commitTask",
                              { config: getFullConfigData(true) }
                            ]
                          )
                          logs.push(
                            "✅ 任务已提交给主控 AI，请在聊天窗口查看任务进度。"
                          )
                        } catch (e) {
                          logs.push(
                            `❌ 提交失败: ${e.message}`
                          )
                        }
                      }
                    },
                    "开始制作"
                  ),
                  m(Box,
                    {
                      color: "pink_1",
                      isBtn: true,
                      onclick: async () => {
                        logs.push(
                          "🛑 正在发送停止信号..."
                        )
                        try {
                          await settingData.fnCall(
                            "appDispatch",
                            [
                              appId,
                              "cancelTask",
                              {}
                            ]
                          )
                          logs.push(
                            "✅ 已成功发送停止指令。"
                          )
                        } catch (e) {
                          logs.push(
                            `❌ 停止失败: ${e.message}`
                          )
                        }
                      }
                    },
                    "停止任务"
                  ),
                  m(Box,
                    {
                      color: "main",
                      isBtn: true,
                      onclick: exportConfig
                    },
                    "📤 导出配置"
                  ),
                  m(Box,
                    {
                      color: "gray_3",
                      isBtn: true,
                      onclick: importConfig
                    },
                    "📥 导入配置"
                  )
                ]
              ),

              // Console Log Box
              m("",
                {
                  style: {
                    background: "#0f0f11",
                    color: "#00ff66",
                    border: `1.5px solid ${getColor("gray_4").front}22`,
                    padding: "1.2rem",
                    height: "14rem",
                    overflowY: "auto",
                    fontFamily: "monospace",
                    fontSize: "1.2rem",
                    whiteSpace: "pre-wrap",
                    borderRadius: "1.2rem",
                    boxShadow: "0 6px 16px rgba(0,0,0,0.4), inset 0 0 1rem rgba(0,0,0,0.5)"
                  }
                },
                logs.length === 0
                  ? [m("div", { style: { color: "#666", fontStyle: "italic" } }, "等待任务开始，运行日志将在这里实时输出...")]
                  : logs.map(line => m("",
                    {
                      style: {
                        marginBottom: "0.5rem"
                      }
                    },
                    line
                  ))
              )
            ]
          ),

          // 2. Middle Forms Container (Natural Flowing Options)
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                marginBottom: "1.5rem"
              }
            },
            [
              // Section 1: API 配置
              m(Box,
                {
                  color: "main"
                },
                "API 配置"
              ),
              m("div",
                {
                  style: {
                    display: "inline-flex",
                    background: getColor("gray_3").back,
                    borderRadius: "1.5rem",
                    padding: "0.3rem",
                    margin: "0.8rem 0.5rem 1.2rem 0.5rem",
                    gap: "0.2rem",
                    width: "fit-content"
                  }
                },
                [
                  m("div",
                    {
                      style: {
                        padding: "0.4rem 1.5rem",
                        borderRadius: "1.2rem",
                        background: activeTab === "image" ? getColor("main").back : "transparent",
                        color: activeTab === "image" ? getColor("main").front : getColor("gray_1").front,
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        fontWeight: "bold",
                        transition: "all 0.2s"
                      },
                      onclick: () => {
                        activeTab = "image"
                      }
                    },
                    "图片 API"
                  ),
                  m("div",
                    {
                      style: {
                        padding: "0.4rem 1.5rem",
                        borderRadius: "1.2rem",
                        background: activeTab === "video" ? getColor("main").back : "transparent",
                        color: activeTab === "video" ? getColor("main").front : getColor("gray_1").front,
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        fontWeight: "bold",
                        transition: "all 0.2s"
                      },
                      onclick: () => {
                        activeTab = "video"
                      }
                    },
                    "视频 API"
                  )
                ]
              ),

              // API Provider Selector inside API Configuration Card
              m(FormItem,
                {
                  label: activeTab === "image" ? "图片 API 服务商平台" : "视频 API 服务商平台",
                  description: "选择对应平台，下方 API URL 可点击「填入默认地址」一键填充"
                },
                [
                  m("div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "row",
                        gap: "0.6rem",
                        margin: "0.5rem"
                      }
                    },
                    [
                      m(Tag,
                        {
                          isBtn: true,
                          color: (activeTab === "image" ? imageProvider : videoProvider) === "volcengine" ? "main" : "sliver",
                          styleExt: {
                            padding: "0.4rem 1rem",
                            fontSize: "0.9rem",
                            cursor: "pointer"
                          },
                          onclick: () => {
                            if (activeTab === "image") {
                              imageProvider = "volcengine"
                            } else {
                              videoProvider = "volcengine"
                            }
                            m.redraw()
                          }
                        },
                        "🌋 火山方舟 (Volcengine Ark)"
                      ),
                      m(Tag,
                        {
                          isBtn: true,
                          color: (activeTab === "image" ? imageProvider : videoProvider) === "dashscope" ? "main" : "sliver",
                          styleExt: {
                            padding: "0.4rem 1rem",
                            fontSize: "0.9rem",
                            cursor: "pointer"
                          },
                          onclick: () => {
                            if (activeTab === "image") {
                              imageProvider = "dashscope"
                            } else {
                              videoProvider = "dashscope"
                            }
                            m.redraw()
                          }
                        },
                        "🟠 阿里百炼 (DashScope 通义万相)"
                      )
                    ]
                  )
                ]
              ),

              // Render active tab options with FormItem (API URL includes Box button for auto filling)
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column"
                  }
                },
                (activeTab === "image" ? imageOptions : videoOptions).map((opt) => {
                  const isUrlInput = opt.key === "imageApiUrl" || opt.key === "videoApiUrl"
                  return m.fragment(
                    {
                      key: opt.key
                    },
                    [
                      m(FormItem,
                        {
                          label: opt.name,
                          description: opt.description
                        },
                        [
                          opt.isPassword
                            ? m("div",
                              {
                                style: {
                                  display: "flex",
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: "0.6rem",
                                  margin: "0.5rem"
                                }
                              },
                              [
                                m("input",
                                  {
                                    type: showApiKey ? "text" : "password",
                                    style: {
                                      flex: "1",
                                      height: "40px",
                                      boxSizing: "border-box",
                                      border: "1.5px solid " + getColor("确认框输入边框"),
                                      outline: "none",
                                      background: getColor("确认框输入背景"),
                                      padding: "0.4rem 0.8rem",
                                      color: getColor("确认框输入文字"),
                                      fontFamily: "inherit",
                                      borderRadius: "1rem",
                                      fontSize: "0.95rem"
                                    },
                                    placeholder: "请输入 API Key...",
                                    value: opt.value,
                                    oninput: (e) => {
                                      opt.value = e.target.value
                                    }
                                  }
                                ),
                                m(Box,
                                  {
                                    color: "main",
                                    isBtn: true,
                                    onclick: () => {
                                      showApiKey = !showApiKey
                                      m.redraw()
                                    }
                                  },
                                  showApiKey ? "隐藏" : "显示"
                                )
                              ]
                            )
                            : isUrlInput
                              ? m("div",
                                {
                                  style: {
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: "0.6rem"
                                  }
                                },
                                [
                                  m("div",
                                    {
                                      style: {
                                        flex: "1"
                                      }
                                    },
                                    [
                                      m(AutoForm,
                                        {
                                          dataObj: opt,
                                          dataName: "value",
                                          extEditMode: false
                                        }
                                      )
                                    ]
                                  ),
                                  m(Box,
                                    {
                                      color: "main",
                                      isBtn: true,
                                      onclick: () => {
                                        const provider = opt.key === "imageApiUrl" ? imageProvider : videoProvider
                                        opt.value = provider === "dashscope" ? "https://dashscope.aliyuncs.com/api/v1" : "https://ark.cn-beijing.volces.com/api/v3"
                                        m.redraw()
                                      }
                                    },
                                    "填入默认地址"
                                  )
                                ]
                              )
                              : m(AutoForm,
                                {
                                  dataObj: opt,
                                  dataName: "value",
                                  extEditMode: false
                                }
                              )
                        ]
                      )
                    ]
                  )
                })
              ),

              // Section 2: 素材与目录选择
              m(Box,
                {
                  color: "main"
                },
                "素材与输出目录选择"
              ),

              // Combined AutoForm with native select button side by side
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column"
                  }
                },
                pathOptions.map((opt) => {
                  return m.fragment(
                    {
                      key: opt.key
                    },
                    [
                      m(FormItem,
                        {
                          label: opt.name,
                          description: opt.description
                        },
                        [
                          m("div",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: "0.6rem"
                              }
                            },
                            [
                              m("div",
                                {
                                  style: {
                                    flex: "1"
                                  }
                                },
                                [
                                  m(AutoForm,
                                    {
                                      dataObj: opt,
                                      dataName: "value",
                                      extEditMode: false
                                    }
                                  )
                                ]
                              ),
                              m(Box,
                                {
                                  color: "main",
                                  isBtn: true,
                                  onclick: async () => {
                                    try {
                                      const res = await settingData.fnCall(
                                        "appOpenDialog",
                                        [
                                          opt.key === "outputDir"
                                            ? {
                                              title: "选择输出目录",
                                              properties: [
                                                "openDirectory"
                                              ]
                                            }
                                            : {
                                              title: `选择${opt.name}`,
                                              filters: [
                                                {
                                                  name: "Images",
                                                  extensions: [
                                                    "png",
                                                    "jpg",
                                                    "jpeg"
                                                  ]
                                                }
                                              ]
                                            }
                                        ]
                                      )
                                      if (res && res.ok && res.filePath) {
                                        opt.value = res.filePath
                                        m.redraw()
                                      }
                                    } catch (err) {
                                      console.error(err)
                                    }
                                  }
                                },
                                "选择"
                              )
                            ]
                          )
                        ]
                      )
                    ]
                  )
                })
              ),

              // Section 3: 任务参数
              m(Box,
                {
                  color: "main"
                },
                "生成任务参数"
              ),

              // Custom Generation Mode Selector with Category Tab Switcher inside FormItem
              m(FormItem,
                {
                  label: "制作模式",
                  description: "切换图片或视频模式，选择对应的表情与动作生成规则"
                },
                [
                  m("div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.8rem",
                        padding: "1rem 1.2rem",
                        background: getColor("确认框输入背景"),
                        borderRadius: "1rem",
                        border: "1.5px solid " + getColor("确认框输入边框"),
                        margin: "0.5rem"
                      }
                    },
                    [
                      // Mode Category Pill Switcher (图片模式 vs 视频模式)
                      m("div",
                        {
                          style: {
                            display: "inline-flex",
                            background: getColor("gray_3").back,
                            borderRadius: "1.2rem",
                            padding: "0.25rem",
                            marginBottom: "0.5rem",
                            gap: "0.2rem",
                            width: "fit-content"
                          }
                        },
                        [
                          m("div",
                            {
                              style: {
                                padding: "0.3rem 1.2rem",
                                borderRadius: "1rem",
                                background: modeCategory === "image" ? getColor("main").back : "transparent",
                                color: modeCategory === "image" ? getColor("main").front : getColor("gray_1").front,
                                cursor: "pointer",
                                fontSize: "0.9rem",
                                fontWeight: "bold",
                                transition: "all 0.2s"
                              },
                              onclick: () => {
                                modeCategory = "image"
                                if (mode !== "0a" && mode !== "0b") {
                                  mode = "0a"
                                }
                              }
                            },
                            "图片模式 (静态)"
                          ),
                          m("div",
                            {
                              style: {
                                padding: "0.3rem 1.2rem",
                                borderRadius: "1rem",
                                background: modeCategory === "video" ? getColor("main").back : "transparent",
                                color: modeCategory === "video" ? getColor("main").front : getColor("gray_1").front,
                                cursor: "pointer",
                                fontSize: "0.9rem",
                                fontWeight: "bold",
                                transition: "all 0.2s"
                              },
                              onclick: () => {
                                modeCategory = "video"
                                if (mode === "0a" || mode === "0b") {
                                  mode = "1"
                                }
                              }
                            },
                            "视频模式 (绿幕动态)"
                          )
                        ]
                      ),

                      // Mode Radio Options based on selected Mode Category
                      (modeCategory === "image" ? imageModeList : videoModeList).map(item => {
                        const isChecked = mode === item.value
                        return m("label",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "0.8rem",
                              cursor: "pointer",
                              fontSize: "0.95rem",
                              color: getColor("确认框输入文字"),
                              padding: "0.2rem 0"
                            }
                          },
                          [
                            m("input[type=radio]",
                              {
                                name: "generationMode",
                                value: item.value,
                                checked: isChecked,
                                onchange: (e) => {
                                  mode = e.target.value
                                },
                                style: {
                                  cursor: "pointer",
                                  width: "1.1rem",
                                  height: "1.1rem",
                                  accentColor: getColor("main").back
                                }
                              }
                            ),
                            m("span",
                              item.label
                            )
                          ]
                        )
                      }),

                      // Mode Process Guide
                      m("div",
                        {
                          style: {
                            marginTop: "1rem",
                            paddingTop: "0.8rem",
                            borderTop: `1.5px dashed ${getColor("gray_4").front}1c`,
                            fontSize: "0.9rem",
                            lineHeight: "1.6",
                            color: getColor("gray_1").front,
                            opacity: "0.85"
                          }
                        },
                        [
                          mode === "0a" ? m("", [
                            m("div", { style: { fontWeight: "bold", marginBottom: "0.3rem" } }, "⚙️ 运行机制与系统流程："),
                            m("div", "1. 系统基于你提供的「半身像素材」，结合「提示词」，调用图片生成 API 绘制全新的半身表情图。"),
                            m("div", "2. 生成的静态图片直接保存至输出目录（如 final_expression_image.png），不进行任何视频插帧或 FFmpeg 合成。适合制作静态头像与对话框表情包。")
                          ]) : void 0,
                          mode === "0b" ? m("", [
                            m("div", { style: { fontWeight: "bold", marginBottom: "0.3rem" } }, "⚙️ 运行机制与系统流程："),
                            m("div", "1. 系统基于你提供的「全身像素材」，结合「提示词」，调用图片生成 API 绘制完成指定新动作的静态全身姿势图。"),
                            m("div", "2. 生成的静态姿势图直接保存至输出目录（如 final_pose_image.png），不合成视频。适合制作立绘插画与静态动作素材。")
                          ]) : void 0,
                          mode === "1" ? m("", [
                            m("div", { style: { fontWeight: "bold", marginBottom: "0.3rem" } }, "⚙️ 运行机制与系统流程："),
                            m("div", "1. 系统会基于你提供的「半身像素材」，结合「提示词」，通过图片生成 API 生成一张全新的半身表情图。"),
                            m("div", "2. 生成新图后，自动调用视频模型合成两段镜头过渡视频：从「默认全身站姿」镜头拉近至「表情半身特写」，再由「表情半身特写」拉远退回「默认全身站姿」。"),
                            m("div", "3. 使用 ffmpeg 拼接两段视频并绿幕化输出。适合制作情绪反应和特写动作。")
                          ]) : void 0,
                          mode === "2a" ? m("", [
                            m("div", { style: { fontWeight: "bold", marginBottom: "0.3rem" } }, "⚙️ 运行机制与系统流程："),
                            m("div", "1. 系统不需要额外画图，直接使用现成的「全身像素材」作为视频的开始帧与结束帧。"),
                            m("div", "2. 直接调用视频生成模型对全身图进行动作合成，生成首尾姿势完全相同、中间带有微动姿势的绿幕视频。"),
                            m("div", "3. 适合生成微动呼吸、站立待机、小幅度手势等能够完美首尾相接、支持循环播放的画面。")
                          ]) : void 0,
                          mode === "2b" ? m("", [
                            m("div", { style: { fontWeight: "bold", marginBottom: "0.3rem" } }, "⚙️ 运行机制与系统流程："),
                            m("div", "1. 视频的首帧为默认站姿，尾帧为新动作。系统会先基于「全身像素材」加「提示词」，通过图片生成 API 绘制一张完成指定动作的全身尾帧图。"),
                            m("div", "2. 获得尾帧图后，调用视频生成模型进行动作补间，合成从「默认正常站立」变化过渡到「指定结束动作」的绿幕动作视频。"),
                            m("div", "3. 适合做大幅度的动作转折、技能释放或者大幅度姿势演绎。")
                          ]) : void 0
                        ]
                      )
                    ]
                  )
                ]
              ),

              // Render Prompt Option with Tag Preset Quick Bar (Mapped 1:1 from petPkgs/default/pet filenames)
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column"
                  }
                },
                [
                  m(FormItem,
                    {
                      label: promptOption.name,
                      description: promptOption.description
                    },
                    [
                      m(AutoForm,
                        {
                          dataObj: promptOption,
                          dataName: "value",
                          extEditMode: false
                        }
                      ),
                      // Preset Prompts Quick Bar using Tag component
                      m("div",
                        {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.4rem",
                            margin: "0.8rem 0.5rem 0.2rem 0.5rem"
                          }
                        },
                        [
                          m("div",
                            {
                              style: {
                                fontSize: "0.85rem",
                                color: getColor("gray_1").front,
                                opacity: "0.8",
                                fontWeight: "bold"
                              }
                            },
                            "💡 默认角色包 (default/pet) 表情预设 (点击 Tag 一键填入)："
                          ),
                          m("div",
                            {
                              style: {
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.2rem"
                              }
                            },
                            presetPrompts.map(item => {
                              const isSelected = promptOption.value === item.prompt
                              return m(Tag,
                                {
                                  isBtn: true,
                                  color: isSelected ? "main" : "sliver",
                                  styleExt: {
                                    margin: "0.2rem",
                                    fontSize: "0.85rem",
                                    cursor: "pointer"
                                  },
                                  onclick: () => {
                                    promptOption.value = item.prompt
                                    m.redraw()
                                  }
                                },
                                item.label
                              )
                            })
                          )
                        ]
                      )
                    ]
                  )
                ]
              )
            ]
          )
        ]
      )
    }
  }
}
