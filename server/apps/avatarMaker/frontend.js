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
    trs,
    settingData
  }
) => {
  let currentStep = 1 // 1: 制作模式, 2: 路径与素材, 3: API配置, 4: 提示词与执行
  let logs = []
  const maxLogs = 100
  let initialized = false
  let mode = "0a" // "0a", "0b", "1", "2a", "2b"
  let modeCategory = "image" // "image" or "video"

  let imageProvider = "volcengine" // "volcengine" or "dashscope"
  let videoProvider = "volcengine" // "volcengine" or "dashscope"

  let activeTab = "image" // "image" or "video"
  let showImageApiKey = false
  let showVideoApiKey = false

  // 21 款默认表情预设
  const presetPrompts = [
    { label: "😊 微笑", prompt: "微笑，表情柔和幸福，嘴角上扬" },
    { label: "😄 闭眼笑", prompt: "双眼笑成弯月，闭眼开心微笑" },
    { label: "😁 露齿笑", prompt: "露齿大笑，心情十分愉快" },
    { label: "😃 欢快笑", prompt: "欢快大笑，露齿微笑，神采飞扬" },
    { label: "😅 尴尬苦笑", prompt: "尴尬地露齿苦笑，双颊带微红" },
    { label: "😡 生气怒视", prompt: "生气怒视，眉毛下压紧锁，表情愤怒" },
    { label: "😬 咬牙紧张", prompt: "咬牙切齿，面部神情紧绷" },
    { label: "🤬 愤怒咬牙", prompt: "愤怒咬牙，双眼瞪大愤怒，非常生气" },
    { label: "😰 尴尬汗颜", prompt: "尴尬咬牙，汗颜，眼神躲闪" },
    { label: "😭 伤心流泪", prompt: "伤心流泪，眼角带泪花，非常难过" },
    { label: "🥹 喜极而泣", prompt: "喜极而泣，眼中带泪，满脸感动微笑" },
    { label: "😞 悲伤低落", prompt: "低头沮丧，眼神失落悲伤" },
    { label: "😗 嘟嘴娇嗔", prompt: "嘟起小嘴，表达不满与娇嗔" },
    { label: "😚 闭眼嘟嘴", prompt: "闭上双眼嘟嘴，神情傲娇俏皮" },
    { label: "🥺 委屈巴巴", prompt: "委屈嘟嘴，眼神哀求失落" },
    { label: "😦 迷茫放空", prompt: "迷茫发呆嘟嘴，神情茫然" },
    { label: "😨 紧张慌张", prompt: "紧张慌张，眼神不安，双颊微汗" },
    { label: "😐 发呆呆滞", prompt: "眼神放空发呆，神情呆滞" },
    { label: "😶 深度发愣", prompt: "深度发呆放空，张着小嘴发愣" },
    { label: "🎅 圣诞节日", prompt: "头戴圣诞帽，表情欢快喜庆" },
    { label: "🎄 圣诞闭眼", prompt: "头戴圣诞帽，闭眼欢快微笑，充满节日气氛" }
  ]

  // 最新服务商及推荐模型库 (支持下拉选单与手动输入联动)
  const MODEL_PRESETS = {
    volcengine: {
      name: "火山方舟 (Volcengine)",
      imageDefaultUrl: "https://ark.cn-beijing.volces.com/api/v3",
      imageModels: [
        { label: "doubao-seedream-3-0-t2i-241128", value: "doubao-seedream-3-0-t2i-241128" },
        { label: "doubao-image-i2i", value: "doubao-image-i2i" },
        { label: "doubao-seedance-1-5-pro-251215", value: "doubao-seedance-1-5-pro-251215" },
        { label: "ep-自定义推理接入点 (在下方填入 ep-xxx)", value: "" }
      ],
      videoDefaultUrl: "https://ark.cn-beijing.volces.com/api/v3",
      videoModels: [
        { label: "doubao-seedance-1-5-pro-251215", value: "doubao-seedance-1-5-pro-251215" },
        { label: "doubao-seaweed-241128", value: "doubao-seaweed-241128" },
        { label: "ep-自定义推理接入点 (在下方填入 ep-xxx)", value: "" }
      ]
    },
    dashscope: {
      name: "阿里百炼 (DashScope)",
      imageDefaultUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      imageModels: [
        { label: "wan2.6-image", value: "wan2.6-image" },
        { label: "wanx2.1-imageedit", value: "wanx2.1-imageedit" },
        { label: "wanx2.1-i2i-turbo", value: "wanx2.1-i2i-turbo" },
        { label: "wanx-v1", value: "wanx-v1" },
        { label: "自定义模型 (在下方手动输入)", value: "" }
      ],
      videoDefaultUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      videoModels: [
        { label: "wan2.7-kf2v", value: "wan2.7-kf2v" },
        { label: "wan2.2-kf2v-flash", value: "wan2.2-kf2v-flash" },
        { label: "wan2.1-kf2v-plus", value: "wan2.1-kf2v-plus" },
        { label: "wan2.1-t2v-turbo", value: "wan2.1-t2v-turbo" },
        { label: "自定义模型 (在下方手动输入)", value: "" }
      ]
    }
  }

  // 配置项字段
  let configFields = {
    outputDir: "",
    fullBodyBase: "",
    halfBodyBase: "",
    imageApiUrl: "https://ark.cn-beijing.volces.com/api/v3",
    imageApiKey: "",
    imageModel: "doubao-seedream-3-0-t2i-241128",
    videoApiUrl: "https://ark.cn-beijing.volces.com/api/v3",
    videoApiKey: "",
    videoModel: "doubao-seaweed-241128",
    prompt: ""
  }

  // 模式定义 (完全采用旧版原始文案与机制说明，一个字都不改)
  const modeDefinitions = [
    {
      id: "0a",
      category: "image",
      label: "静态半身表情图片 (基于半身素材绘制新表情立绘)",
      sopSteps: [
        "1. 系统基于你提供的「半身像素材」，结合「提示词」，调用图片生成 API 绘制全新的半身表情图。",
        "2. 生成的静态图片直接保存至输出目录（如 final_expression_image.png），不进行任何视频插帧或 FFmpeg 合成。适合制作静态头像与对话框表情包。"
      ]
    },
    {
      id: "0b",
      category: "image",
      label: "静态全身动作图片 (基于全身素材绘制新动作立绘)",
      sopSteps: [
        "1. 系统基于你提供的「全身像素材」，结合「提示词」，调用图片生成 API 绘制完成指定新动作的静态全身姿势图。",
        "2. 生成的静态姿势图直接保存至输出目录（如 final_pose_image.png），不合成视频。适合制作立绘插画与静态动作素材。"
      ]
    },
    {
      id: "1",
      category: "video",
      label: "表情特写视频 (靠近镜头做表情并拉远)",
      sopSteps: [
        "1. 系统会基于你提供的「半身像素材」，结合「提示词」，通过图片生成 API 生成一张全新的半身表情图。",
        "2. 生成新图后，自动调用视频模型合成两段镜头过渡视频：从「默认全身站姿」镜头拉近至「表情半身特写」，再由「表情半身特写」拉远退回「默认全身站姿」。",
        "3. 使用 ffmpeg 拼接两段视频并绿幕化输出。适合制作情绪反应和特写动作。"
      ]
    },
    {
      id: "2a",
      category: "video",
      label: "全身动作视频 - 首尾相同 (适合微动或循环待机)",
      sopSteps: [
        "1. 系统不需要额外画图，直接使用现成的「全身像素材」作为视频的开始帧与结束帧。",
        "2. 直接调用视频生成模型对全身图进行动作合成，生成首尾姿势完全相同、中间带有微动姿势的绿幕视频。",
        "3. 适合生成微动呼吸、站立待机、小幅度手势等能够完美首尾相接、支持循环播放的画面。"
      ]
    },
    {
      id: "2b",
      category: "video",
      label: "全身动作视频 - 首尾不同 (适合从静立过渡到指定动作)",
      sopSteps: [
        "1. 视频的首帧为默认站姿，尾帧为新动作。系统会先基于「全身像素材」加「提示词」，通过图片生成 API 绘制一张完成指定动作的全身尾帧图。",
        "2. 获得尾帧图后，调用视频生成模型进行动作补间，合成从「默认正常站立」变化过渡到「指定结束动作」的绿幕动作视频。",
        "3. 适合做大幅度的动作转折、技能释放或者大幅度姿势演绎。"
      ]
    },
    {
      id: "2c",
      category: "video",
      label: "全身动作视频 - 单图生成 (由单张全身图和描述直接生成视频)",
      sopSteps: [
        "1. 不需要额外画尾帧图，也不需要首尾相同。系统直接使用「全身像素材」结合「提示词」，调用视频生成模型直接进行动作演绎与生成。",
        "2. 生成的 WebM 视频将从初始全身姿势开始，根据提示词自由活动演进并绿幕化输出。",
        "3. 适合生成单次连贯动作、自由特写动作或无需严格首尾封闭的动作片段。"
      ]
    }
  ]

  const getFullConfigData = (safeOnly = false) => {
    const configData = {
      mode,
      modeCategory,
      imageProvider,
      videoProvider,
      prompt: (configFields.prompt || "").trim(),
      outputDir: (configFields.outputDir || "").trim(),
      fullBodyBase: (configFields.fullBodyBase || "").trim(),
      halfBodyBase: (configFields.halfBodyBase || "").trim(),
      imageApiUrl: (configFields.imageApiUrl || "").trim(),
      imageModel: (configFields.imageModel || "").trim(),
      videoApiUrl: (configFields.videoApiUrl || "").trim(),
      videoModel: (configFields.videoModel || "").trim()
    }
    if (!safeOnly) {
      configData.imageApiKey = (configFields.imageApiKey || "").trim()
      configData.videoApiKey = (configFields.videoApiKey || "").trim()
    }
    return configData
  }

  const initOptionValues = (vnode) => {
    if (initialized || !vnode.attrs.data) return
    const raw = vnode.attrs.data
    Object.keys(configFields).forEach(k => {
      if (raw[k] !== undefined) {
        configFields[k] = typeof raw[k] === "string" ? raw[k].trim() : (raw[k] || "")
      }
    })
    if (raw.mode) mode = raw.mode
    if (raw.imageProvider) imageProvider = raw.imageProvider
    if (raw.videoProvider) videoProvider = raw.videoProvider

    if (mode === "0a" || mode === "0b") modeCategory = "image"
    else modeCategory = "video"

    initialized = true
  }

  // 提交前统一完整校验（若未填完整，返回错误信息及对应的步骤编号）
  const validateAllBeforeSubmit = () => {
    const config = getFullConfigData(false)

    if (!mode) return { step: 1, msg: "请选择制作模式" }
    if (!config.outputDir) return { step: 2, msg: "请填写「最终输出目录」" }

    if (mode === "0a" || mode === "1") {
      if (!config.halfBodyBase) return { step: 2, msg: "当前模式需填写「半身像素材路径」" }
    }
    if (mode === "0b" || mode === "2a" || mode === "2b" || mode === "2c") {
      if (!config.fullBodyBase) return { step: 2, msg: "当前模式需填写「全身像素材路径」" }
    }

    const needImage = (mode === "0a" || mode === "0b" || mode === "1" || mode === "2b")
    const needVideo = (mode === "1" || mode === "2a" || mode === "2b" || mode === "2c")

    if (needImage) {
      if (!config.imageApiUrl) return { step: 3, msg: "请填写「图片 API URL」" }
      if (!config.imageApiKey) return { step: 3, msg: "请填写「图片 API Key」" }
      if (!config.imageModel) return { step: 3, msg: "请填写「图片生成模型 (Model)」" }
    }
    if (needVideo) {
      if (!config.videoApiUrl) return { step: 3, msg: "请填写「视频 API URL」" }
      if (!config.videoApiKey) return { step: 3, msg: "请填写「视频 API Key」" }
      if (!config.videoModel) return { step: 3, msg: "请填写「视频生成模型 (Model)」" }
    }

    if (!config.prompt) return { step: 4, msg: "请填写「表情与动作提示词」" }

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
        Notice.launch({ msg: "配置导出成功", color: "green" })
        logs.push(`配置已导出至: ${saveDialogRes.filePath}`)
      } else {
        Notice.launch({ msg: `导出失败: ${saveRes?.msg || "写入失败"}`, color: "pink" })
      }
    } catch (err) {
      Notice.launch({ msg: `导出失败: ${err.message}`, color: "pink" })
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
        Object.keys(configFields).forEach(k => {
          if (imported[k] !== undefined) {
            configFields[k] = typeof imported[k] === "string" ? imported[k].trim() : (imported[k] || "")
          }
        })
        if (imported.mode) mode = imported.mode
        if (imported.imageProvider) imageProvider = imported.imageProvider
        if (imported.videoProvider) videoProvider = imported.videoProvider

        if (mode === "0a" || mode === "0b") modeCategory = "image"
        else modeCategory = "video"

        Notice.launch({ msg: "配置文件导入成功", color: "green" })
        logs.push(`配置文件已加载: ${dialogRes.filePath}`)
        m.redraw()
      } else {
        Notice.launch({ msg: `读取失败: ${readRes?.msg || "文件内容为空"}`, color: "pink" })
      }
    } catch (err) {
      Notice.launch({ msg: `导入失败: ${err.message}`, color: "pink" })
    }
  }

  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (msg.action === "log") {
        logs.push(msg.args.message)
        if (logs.length > maxLogs) logs.shift()
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

      if (callback) callback({ ok: true, msg: "操作成功" })
    }
  }

  const init = () => {
    myAppData.addTool("commonData", commonData)
    myAppData.registerInstances(appId, instanceInterface)
    if (commonData.registerApp) {
      commonData.registerApp(appId, myAppData)
    }
  }
  init()

  return {
    onremove() {
      myAppData.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      initOptionValues(vnode)

      const steps = [
        { num: 1, title: "模式选择" },
        { num: 2, title: "素材目录" },
        { num: 3, title: "API配置" },
        { num: 4, title: "提示词生成" }
      ]

      const activeImagePreset = MODEL_PRESETS[imageProvider] || MODEL_PRESETS.volcengine
      const activeVideoPreset = MODEL_PRESETS[videoProvider] || MODEL_PRESETS.volcengine

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "1.2rem",
            color: getColor("gray_1").front,
            background: getColor("gray_1").back,
            padding: "1.5rem"
          }
        },
        [
          // 顶部向导步骤导航条 (可自由点击任意步骤，不作中途强制拦截)
          m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: getColor("gray_3").back,
                borderRadius: "3rem",
                padding: "0.6rem 1rem",
                gap: "0.5rem",
                overflowX: "auto"
              }
            },
            steps.map((s) => {
              const isCurrent = currentStep === s.num

              return m("",
                {
                  key: `step-bar-${s.num}`,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.6rem 1.2rem",
                    borderRadius: "3rem",
                    background: isCurrent ? getColor("main").back : "transparent",
                    color: isCurrent ? getColor("main").front : getColor("gray_3").front,
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "all 0.25s"
                  },
                  onclick: () => {
                    currentStep = s.num
                  }
                },
                [
                  m("",
                    {
                      style: {
                        width: "2rem",
                        height: "2rem",
                        borderRadius: "50%",
                        background: isCurrent ? getColor("main").front : getColor("gray_4").front,
                        color: isCurrent ? getColor("main").back : getColor("gray_3").back,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem"
                      }
                    },
                    s.num
                  ),
                  m("span",
                    {
                      style: {
                        fontSize: "1.5rem"
                      }
                    },
                    s.title
                  )
                ]
              )
            })
          ),

          // 主体步骤内容区
          m("",
            {
              style: {
                background: getColor("gray_3").back,
                borderRadius: "3rem",
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.2rem"
              }
            },
            [
              // === STEP 1: 制作模式选择 ===
              currentStep === 1 ?
                m("",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem"
                    }
                  },
                  [
                    m("",
                      {
                        style: {
                          fontSize: "1.8rem",
                          color: getColor("gray_3").front,
                          marginBottom: "0.5rem"
                        }
                      },
                      "请选择角色包制作模式"
                    ),
                    m("",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.8rem"
                        }
                      },
                      modeDefinitions.map(mItem => {
                        const isSelected = mode === mItem.id
                        return m("",
                          {
                            key: mItem.id,
                            style: {
                              background: isSelected ? `${getColor("main").back}22` : getColor("gray_4").back,
                              border: isSelected ? `0.15rem solid ${getColor("main").back}` : "0.15rem solid transparent",
                              borderRadius: "3rem",
                              padding: "1.2rem 1.6rem",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              transition: "all 0.25s"
                            },
                            onclick: () => {
                              mode = mItem.id
                              modeCategory = mItem.category
                            }
                          },
                          [
                            m("",
                              {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.8rem",
                                  flex: 1
                                }
                              },
                              [
                                m("span",
                                  {
                                    style: {
                                      fontSize: "1.5rem",
                                      color: getColor("gray_4").front
                                    }
                                  },
                                  mItem.label
                                )
                              ]
                            ),
                            m("",
                              {
                                style: {
                                  width: "2rem",
                                  height: "2rem",
                                  borderRadius: "50%",
                                  border: `0.2rem solid ${isSelected ? getColor("main").back : getColor("gray_4").front}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0
                                }
                              },
                              isSelected ?
                                m("",
                                  {
                                    style: {
                                      width: "1rem",
                                      height: "1rem",
                                      borderRadius: "50%",
                                      background: getColor("main").back
                                    }
                                  }
                                ) : null
                            )
                          ]
                        )
                      })
                    ),

                    // 模式流程运行说明卡片 (完全还原旧版说明)
                    m("",
                      {
                        style: {
                          marginTop: "0.5rem",
                          padding: "1.4rem 1.8rem",
                          borderRadius: "3rem",
                          background: getColor("gray_4").back,
                          fontSize: "1.2rem",
                          lineHeight: "1.6",
                          color: getColor("gray_4").front,
                          opacity: 0.85,
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.4rem"
                        }
                      },
                      [
                        m("div",
                          {
                            style: {
                              fontSize: "1.3rem",
                              marginBottom: "0.2rem"
                            }
                          },
                          "⚙️ 运行机制与系统流程："
                        ),
                        ...(modeDefinitions.find(d => d.id === mode)?.sopSteps || []).map(stepTxt => {
                          return m("div", stepTxt)
                        })
                      ]
                    )
                  ]
                ) : null,

              // === STEP 2: 路径与素材设定 ===
              currentStep === 2 ?
                m("",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.2rem"
                    }
                  },
                  [
                    m("",
                      {
                        style: {
                          fontSize: "1.8rem",
                          color: getColor("gray_3").front,
                          marginBottom: "0.5rem"
                        }
                      },
                      "设置输出目录与基础素材"
                    ),

                    // 最终输出目录
                    m("",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem"
                        }
                      },
                      [
                        m("label",
                          {
                            style: {
                              fontSize: "1.5rem",
                              color: getColor("gray_1").front
                            }
                          },
                          "最终输出目录 *"
                        ),
                        m("",
                          {
                            style: {
                              display: "flex",
                              gap: "0.8rem",
                              alignItems: "center"
                            }
                          },
                          [
                            m("input",
                              {
                                value: configFields.outputDir,
                                placeholder: "例如: /Users/xxx/Desktop/myPetPkg/",
                                style: {
                                  flex: 1,
                                  padding: "0.8rem 1.2rem",
                                  borderRadius: "3rem",
                                  border: "none",
                                  outline: "none",
                                  background: getColor("gray_4").back,
                                  color: getColor("gray_4").front,
                                  fontSize: "1.5rem"
                                },
                                oninput: (e) => configFields.outputDir = e.target.value
                              }
                            ),
                            m("",
                              {
                                style: {
                                  padding: "0.8rem 1.5rem",
                                  borderRadius: "3rem",
                                  background: getColor("main").back,
                                  color: getColor("main").front,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.4rem",
                                  flexShrink: 0
                                },
                                onclick: async () => {
                                  const res = await settingData.fnCall("appOpenDialog", [{
                                    title: "选择最终输出目录",
                                    properties: ["openDirectory"]
                                  }])
                                  if (res && res.ok && res.filePath) {
                                    configFields.outputDir = res.filePath
                                    m.redraw()
                                  }
                                }
                              },
                              [
                                m.trust(iconPark.getIcon("FolderOpen", { size: "1.4rem", fill: getColor("main").front })),
                                m("span", "浏览目录")
                              ]
                            )
                          ]
                        ),
                        m("span",
                          {
                            style: {
                              fontSize: "1.2rem",
                              color: getColor("gray_4").front,
                              opacity: 0.6
                            }
                          },
                          "生成的全部表情图片与绿幕视频成品将保存在该目录下。"
                        )
                      ]
                    ),

                    // 全身像素材路径 (根据模式高亮提示)
                    m("",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                          opacity: (mode === "0b" || mode === "2a" || mode === "2b" || mode === "2c") ? 1 : 0.6
                        }
                      },
                      [
                        m("label",
                          {
                            style: {
                              fontSize: "1.5rem",
                              color: getColor("gray_1").front
                            }
                          },
                          `全身像素材路径 ${(mode === "0b" || mode === "2a" || mode === "2b" || mode === "2c") ? "*" : "(当前模式可选)"}`
                        ),
                        m("",
                          {
                            style: {
                              display: "flex",
                              gap: "0.8rem",
                              alignItems: "center"
                            }
                          },
                          [
                            m("input",
                              {
                                value: configFields.fullBodyBase,
                                placeholder: "静态全身绿幕图片绝对路径 (.png)",
                                style: {
                                  flex: 1,
                                  padding: "0.8rem 1.2rem",
                                  borderRadius: "3rem",
                                  border: "none",
                                  outline: "none",
                                  background: getColor("gray_4").back,
                                  color: getColor("gray_4").front,
                                  fontSize: "1.5rem"
                                },
                                oninput: (e) => configFields.fullBodyBase = e.target.value
                              }
                            ),
                            m("",
                              {
                                style: {
                                  padding: "0.8rem 1.5rem",
                                  borderRadius: "3rem",
                                  background: getColor("gray_4").back,
                                  color: getColor("gray_4").front,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.4rem",
                                  flexShrink: 0
                                },
                                onclick: async () => {
                                  const res = await settingData.fnCall("appOpenDialog", [{
                                    title: "选择全身像素材",
                                    filters: [{ name: "Images", extensions: ["png", "jpg", "webp"] }]
                                  }])
                                  if (res && res.ok && res.filePath) {
                                    configFields.fullBodyBase = res.filePath
                                    m.redraw()
                                  }
                                }
                              },
                              [
                                m.trust(iconPark.getIcon("Picture", { size: "1.4rem", fill: getColor("gray_4").front })),
                                m("span", "选择文件")
                              ]
                            )
                          ]
                        )
                      ]
                    ),

                    // 半身像素材路径
                    m("",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                          opacity: (mode === "0a" || mode === "1") ? 1 : 0.6
                        }
                      },
                      [
                        m("label",
                          {
                            style: {
                              fontSize: "1.5rem",
                              color: getColor("gray_1").front
                            }
                          },
                          `半身像素材路径 ${(mode === "0a" || mode === "1") ? "*" : "(当前模式可选)"}`
                        ),
                        m("",
                          {
                            style: {
                              display: "flex",
                              gap: "0.8rem",
                              alignItems: "center"
                            }
                          },
                          [
                            m("input",
                              {
                                value: configFields.halfBodyBase,
                                placeholder: "静态半身绿幕图片绝对路径 (.png)",
                                style: {
                                  flex: 1,
                                  padding: "0.8rem 1.2rem",
                                  borderRadius: "3rem",
                                  border: "none",
                                  outline: "none",
                                  background: getColor("gray_4").back,
                                  color: getColor("gray_4").front,
                                  fontSize: "1.5rem"
                                },
                                oninput: (e) => configFields.halfBodyBase = e.target.value
                              }
                            ),
                            m("",
                              {
                                style: {
                                  padding: "0.8rem 1.5rem",
                                  borderRadius: "3rem",
                                  background: getColor("gray_4").back,
                                  color: getColor("gray_4").front,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.4rem",
                                  flexShrink: 0
                                },
                                onclick: async () => {
                                  const res = await settingData.fnCall("appOpenDialog", [{
                                    title: "选择半身像素材",
                                    filters: [{ name: "Images", extensions: ["png", "jpg", "webp"] }]
                                  }])
                                  if (res && res.ok && res.filePath) {
                                    configFields.halfBodyBase = res.filePath
                                    m.redraw()
                                  }
                                }
                              },
                              [
                                m.trust(iconPark.getIcon("Picture", { size: "1.4rem", fill: getColor("gray_4").front })),
                                m("span", "选择文件")
                              ]
                            )
                          ]
                        )
                      ]
                    )
                  ]
                ) : null,

              // === STEP 3: API 服务配置 ===
              currentStep === 3 ?
                m("",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.2rem"
                    }
                  },
                  [
                    m("",
                      {
                        style: {
                          fontSize: "1.8rem",
                          color: getColor("gray_3").front,
                          marginBottom: "0.5rem"
                        }
                      },
                      "配置模型生成接口 (API)"
                    ),

                    // Step 3 顶部 Tab 切换胶囊 (图片 API / 视频 API)
                    m("",
                      {
                        style: {
                          display: "inline-flex",
                          background: getColor("gray_4").back,
                          borderRadius: "3rem",
                          padding: "0.4rem",
                          gap: "0.4rem",
                          width: "fit-content",
                          marginBottom: "0.5rem"
                        }
                      },
                      [
                        { id: "image", label: "🖼️ 图片生成 API" },
                        { id: "video", label: "🎬 视频生成 API" }
                      ].map(t => {
                        const isTabActive = activeTab === t.id
                        return m("",
                          {
                            key: t.id,
                            style: {
                              padding: "0.6rem 1.6rem",
                              borderRadius: "3rem",
                              background: isTabActive ? getColor("main").back : "transparent",
                              color: isTabActive ? getColor("main").front : getColor("gray_4").front,
                              cursor: "pointer",
                              fontSize: "1.4rem",
                              transition: "all 0.2s"
                            },
                            onclick: () => {
                              activeTab = t.id
                            }
                          },
                          t.label
                        )
                      })
                    ),

                    // 图片 API 配置面板
                    activeTab === "image" ?
                      m("",
                        {
                          style: {
                            background: getColor("gray_4").back,
                            borderRadius: "3rem",
                            padding: "1.5rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "1.2rem"
                          }
                        },
                        [
                          // 图片服务商选择
                          m("",
                            {
                              style: {
                                display: "flex",
                                alignItems: "center",
                                gap: "0.8rem",
                                flexWrap: "wrap"
                              }
                            },
                            [
                              m("span", { style: { fontSize: "1.4rem" } }, "图片服务商:"),
                              [
                                { id: "volcengine", name: "火山方舟 (Volcengine)" },
                                { id: "dashscope", name: "阿里百炼 (DashScope)" }
                              ].map(p => {
                                const isActive = imageProvider === p.id
                                return m("",
                                  {
                                    key: p.id,
                                    style: {
                                      padding: "0.5rem 1.2rem",
                                      borderRadius: "3rem",
                                      background: isActive ? getColor("main").back : getColor("gray_3").back,
                                      color: isActive ? getColor("main").front : getColor("gray_3").front,
                                      cursor: "pointer",
                                      fontSize: "1.3rem",
                                      transition: "all 0.2s"
                                    },
                                    onclick: () => {
                                      imageProvider = p.id
                                      const preset = MODEL_PRESETS[p.id]
                                      if (preset) {
                                        configFields.imageApiUrl = preset.imageDefaultUrl
                                        configFields.imageModel = preset.imageModels[0]?.value || ""
                                      }
                                    }
                                  },
                                  p.name
                                )
                              })
                            ]
                          ),

                          // 图片 API URL
                          m("",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem"
                              }
                            },
                            [
                              m("label", { style: { fontSize: "1.3rem", opacity: 0.8 } }, "图片 API 接口地址 (URL)"),
                              m("input",
                                {
                                  value: configFields.imageApiUrl,
                                  placeholder: "https://...",
                                  style: {
                                    padding: "0.8rem 1.2rem",
                                    borderRadius: "3rem",
                                    border: "none",
                                    outline: "none",
                                    background: getColor("gray_3").back,
                                    color: getColor("gray_3").front,
                                    fontSize: "1.5rem"
                                  },
                                  oninput: (e) => configFields.imageApiUrl = e.target.value
                                }
                              )
                            ]
                          ),

                          // 图片 API Key
                          m("",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem"
                              }
                            },
                            [
                              m("label", { style: { fontSize: "1.3rem", opacity: 0.8 } }, "图片 API 密钥 (Key)"),
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
                                      type: showImageApiKey ? "text" : "password",
                                      value: configFields.imageApiKey,
                                      placeholder: "sk-...",
                                      style: {
                                        width: "100%",
                                        padding: "0.8rem 1.2rem",
                                        paddingRight: "3.5rem",
                                        borderRadius: "3rem",
                                        border: "none",
                                        outline: "none",
                                        background: getColor("gray_3").back,
                                        color: getColor("gray_3").front,
                                        fontSize: "1.5rem"
                                      },
                                      oninput: (e) => configFields.imageApiKey = e.target.value
                                    }
                                  ),
                                  m("",
                                    {
                                      style: {
                                        position: "absolute",
                                        right: "1rem",
                                        cursor: "pointer"
                                      },
                                      onclick: () => showImageApiKey = !showImageApiKey
                                    },
                                    [
                                      m.trust(showImageApiKey ?
                                        iconPark.getIcon("PreviewOpen", { size: "1.6rem", fill: getColor("gray_3").front }) :
                                        iconPark.getIcon("PreviewClose", { size: "1.6rem", fill: getColor("gray_3").front })
                                      )
                                    ]
                                  )
                                ]
                              )
                            ]
                          ),

                          // 图片 Model (下拉选单 + 自定义输入)
                          m("",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem"
                              }
                            },
                            [
                              m("label", { style: { fontSize: "1.3rem", opacity: 0.8 } }, "图片生成模型 (Model / Endpoint)"),
                              (() => {
                                const isCustom = !activeImagePreset.imageModels.some(mOpt => mOpt.value && mOpt.value === configFields.imageModel)
                                return m("select",
                                  {
                                    style: {
                                      padding: "0.8rem 1.2rem",
                                      borderRadius: "3rem",
                                      border: "none",
                                      outline: "none",
                                      background: getColor("gray_3").back,
                                      color: getColor("gray_3").front,
                                      fontSize: "1.4rem",
                                      cursor: "pointer",
                                      marginBottom: "0.4rem"
                                    },
                                    onchange: (e) => {
                                      if (e.target.value) {
                                        configFields.imageModel = e.target.value
                                      } else {
                                        const isPreset = activeImagePreset.imageModels.some(mOpt => mOpt.value && mOpt.value === configFields.imageModel)
                                        if (isPreset) {
                                          configFields.imageModel = ""
                                        }
                                      }
                                    }
                                  },
                                  [
                                    activeImagePreset.imageModels.map(mOpt => {
                                      const isSelected = mOpt.value ? (configFields.imageModel === mOpt.value) : isCustom
                                      return m("option", { value: mOpt.value, selected: isSelected }, mOpt.label)
                                    })
                                  ]
                                )
                              })(),
                              m("input",
                                {
                                  value: configFields.imageModel,
                                  placeholder: "可在此手动输入模型名称或 ep-xxx 推理接入点",
                                  style: {
                                    padding: "0.8rem 1.2rem",
                                    borderRadius: "3rem",
                                    border: "none",
                                    outline: "none",
                                    background: getColor("gray_3").back,
                                    color: getColor("gray_3").front,
                                    fontSize: "1.5rem"
                                  },
                                  oninput: (e) => configFields.imageModel = e.target.value
                                }
                              )
                            ]
                          )
                        ]
                      ) : null,

                    // 视频 API 配置面板
                    activeTab === "video" ?
                      m("",
                        {
                          style: {
                            background: getColor("gray_4").back,
                            borderRadius: "3rem",
                            padding: "1.5rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "1.2rem"
                          }
                        },
                        [
                          // 视频服务商选择
                          m("",
                            {
                              style: {
                                display: "flex",
                                alignItems: "center",
                                gap: "0.8rem",
                                flexWrap: "wrap"
                              }
                            },
                            [
                              m("span", { style: { fontSize: "1.4rem" } }, "视频服务商:"),
                              [
                                { id: "volcengine", name: "火山方舟 (Volcengine)" },
                                { id: "dashscope", name: "阿里百炼 (DashScope)" }
                              ].map(p => {
                                const isActive = videoProvider === p.id
                                return m("",
                                  {
                                    key: p.id,
                                    style: {
                                      padding: "0.5rem 1.2rem",
                                      borderRadius: "3rem",
                                      background: isActive ? getColor("main").back : getColor("gray_3").back,
                                      color: isActive ? getColor("main").front : getColor("gray_3").front,
                                      cursor: "pointer",
                                      fontSize: "1.3rem",
                                      transition: "all 0.2s"
                                    },
                                    onclick: () => {
                                      videoProvider = p.id
                                      const preset = MODEL_PRESETS[p.id]
                                      if (preset) {
                                        configFields.videoApiUrl = preset.videoDefaultUrl
                                        configFields.videoModel = preset.videoModels[0]?.value || ""
                                      }
                                    }
                                  },
                                  p.name
                                )
                              })
                            ]
                          ),

                          // 视频 API URL
                          m("",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem"
                              }
                            },
                            [
                              m("label", { style: { fontSize: "1.3rem", opacity: 0.8 } }, "视频 API 接口地址 (URL)"),
                              m("input",
                                {
                                  value: configFields.videoApiUrl,
                                  placeholder: "https://...",
                                  style: {
                                    padding: "0.8rem 1.2rem",
                                    borderRadius: "3rem",
                                    border: "none",
                                    outline: "none",
                                    background: getColor("gray_3").back,
                                    color: getColor("gray_3").front,
                                    fontSize: "1.5rem"
                                  },
                                  oninput: (e) => configFields.videoApiUrl = e.target.value
                                }
                              )
                            ]
                          ),

                          // 视频 API Key
                          m("",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem"
                              }
                            },
                            [
                              m("label", { style: { fontSize: "1.3rem", opacity: 0.8 } }, "视频 API 密钥 (Key)"),
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
                                      type: showVideoApiKey ? "text" : "password",
                                      value: configFields.videoApiKey,
                                      placeholder: "sk-...",
                                      style: {
                                        width: "100%",
                                        padding: "0.8rem 1.2rem",
                                        paddingRight: "3.5rem",
                                        borderRadius: "3rem",
                                        border: "none",
                                        outline: "none",
                                        background: getColor("gray_3").back,
                                        color: getColor("gray_3").front,
                                        fontSize: "1.5rem"
                                      },
                                      oninput: (e) => configFields.videoApiKey = e.target.value
                                    }
                                  ),
                                  m("",
                                    {
                                      style: {
                                        position: "absolute",
                                        right: "1rem",
                                        cursor: "pointer"
                                      },
                                      onclick: () => showVideoApiKey = !showVideoApiKey
                                    },
                                    [
                                      m.trust(showVideoApiKey ?
                                        iconPark.getIcon("PreviewOpen", { size: "1.6rem", fill: getColor("gray_3").front }) :
                                        iconPark.getIcon("PreviewClose", { size: "1.6rem", fill: getColor("gray_3").front })
                                      )
                                    ]
                                  )
                                ]
                              )
                            ]
                          ),

                          // 视频 Model (下拉选单 + 自定义输入)
                          m("",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem"
                              }
                            },
                            [
                              m("label", { style: { fontSize: "1.3rem", opacity: 0.8 } }, "视频生成模型 (Model / Endpoint)"),
                              (() => {
                                const isCustom = !activeVideoPreset.videoModels.some(mOpt => mOpt.value && mOpt.value === configFields.videoModel)
                                return m("select",
                                  {
                                    style: {
                                      padding: "0.8rem 1.2rem",
                                      borderRadius: "3rem",
                                      border: "none",
                                      outline: "none",
                                      background: getColor("gray_3").back,
                                      color: getColor("gray_3").front,
                                      fontSize: "1.4rem",
                                      cursor: "pointer",
                                      marginBottom: "0.4rem"
                                    },
                                    onchange: (e) => {
                                      if (e.target.value) {
                                        configFields.videoModel = e.target.value
                                      } else {
                                        const isPreset = activeVideoPreset.videoModels.some(mOpt => mOpt.value && mOpt.value === configFields.videoModel)
                                        if (isPreset) {
                                          configFields.videoModel = ""
                                        }
                                      }
                                    }
                                  },
                                  [
                                    activeVideoPreset.videoModels.map(mOpt => {
                                      const isSelected = mOpt.value ? (configFields.videoModel === mOpt.value) : isCustom
                                      return m("option", { value: mOpt.value, selected: isSelected }, mOpt.label)
                                    })
                                  ]
                                )
                              })(),
                              m("input",
                                {
                                  value: configFields.videoModel,
                                  placeholder: "可在此手动输入模型名称或 ep-xxx 推理接入点",
                                  style: {
                                    padding: "0.8rem 1.2rem",
                                    borderRadius: "3rem",
                                    border: "none",
                                    outline: "none",
                                    background: getColor("gray_3").back,
                                    color: getColor("gray_3").front,
                                    fontSize: "1.5rem"
                                  },
                                  oninput: (e) => configFields.videoModel = e.target.value
                                }
                              )
                            ]
                          )
                        ]
                      ) : null
                  ]
                ) : null,

              // === STEP 4: 提示词与执行 ===
              currentStep === 4 ?
                m("",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.2rem"
                    }
                  },
                  [
                    m("",
                      {
                        style: {
                          fontSize: "1.8rem",
                          color: getColor("gray_3").front,
                          marginBottom: "0.5rem"
                        }
                      },
                      "设置表情动作描述并开始制作"
                    ),

                    // 提示词输入框
                    m("",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem"
                        }
                      },
                      [
                        m("label",
                          {
                            style: {
                              fontSize: "1.5rem",
                              color: getColor("gray_1").front
                            }
                          },
                          "表情或动作提示词 *"
                        ),
                        m("textarea",
                          {
                            value: configFields.prompt,
                            placeholder: "输入角色的表情或动作细节，例如：微笑，表情柔和幸福，嘴角上扬...",
                            rows: 3,
                            style: {
                              padding: "1rem 1.2rem",
                              borderRadius: "1.5rem",
                              border: "none",
                              outline: "none",
                              background: getColor("gray_4").back,
                              color: getColor("gray_4").front,
                              fontSize: "1.5rem",
                              lineHeight: "1.5",
                              resize: "vertical"
                            },
                            oninput: (e) => configFields.prompt = e.target.value
                          }
                        )
                      ]
                    ),

                    // 原生表情快捷 Tag 胶囊
                    m("",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.6rem"
                        }
                      },
                      [
                        m("span",
                          {
                            style: {
                              fontSize: "1.2rem",
                              color: getColor("gray_4").front,
                              opacity: 0.8
                            }
                          },
                          "💡 默认角色包 (default/pet) 快捷预设 (点击一键填入)："
                        ),
                        m("",
                          {
                            style: {
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.5rem"
                            }
                          },
                          presetPrompts.map(item => {
                            const isSelected = configFields.prompt === item.prompt
                            return m("",
                              {
                                key: item.label,
                                style: {
                                  padding: "0.5rem 1.2rem",
                                  borderRadius: "3rem",
                                  background: isSelected ? getColor("main").back : getColor("gray_4").back,
                                  color: isSelected ? getColor("main").front : getColor("gray_4").front,
                                  cursor: "pointer",
                                  fontSize: "1.2rem",
                                  transition: "all 0.2s"
                                },
                                onclick: () => {
                                  configFields.prompt = item.prompt
                                }
                              },
                              item.label
                            )
                          })
                        )
                      ]
                    )
                  ]
                ) : null
            ]
          ),

          // 底部向导步骤控制栏与操作按钮
          m("",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.8rem",
                marginTop: "0.5rem"
              }
            },
            [
              // 左侧：导入与导出
              m("",
                {
                  style: {
                    display: "flex",
                    gap: "0.8rem"
                  }
                },
                [
                  m("",
                    {
                      style: {
                        padding: "0.8rem 1.5rem",
                        borderRadius: "3rem",
                        background: getColor("gray_3").back,
                        color: getColor("gray_3").front,
                        cursor: "pointer",
                        fontSize: "1.4rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      },
                      onclick: importConfig
                    },
                    [
                      m.trust(iconPark.getIcon("Download", { size: "1.4rem", fill: getColor("gray_3").front })),
                      m("span", "导入配置")
                    ]
                  ),
                  m("",
                    {
                      style: {
                        padding: "0.8rem 1.5rem",
                        borderRadius: "3rem",
                        background: getColor("gray_3").back,
                        color: getColor("gray_3").front,
                        cursor: "pointer",
                        fontSize: "1.4rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      },
                      onclick: exportConfig
                    },
                    [
                      m.trust(iconPark.getIcon("Upload", { size: "1.4rem", fill: getColor("gray_3").front })),
                      m("span", "导出配置")
                    ]
                  )
                ]
              ),

              // 右侧：上一步 / 下一步 / 开始制作 (支持自由切换)
              m("",
                {
                  style: {
                    display: "flex",
                    gap: "0.8rem"
                  }
                },
                [
                  currentStep > 1 ?
                    m("",
                      {
                        style: {
                          padding: "0.8rem 1.8rem",
                          borderRadius: "3rem",
                          background: getColor("gray_4").back,
                          color: getColor("gray_4").front,
                          cursor: "pointer",
                          fontSize: "1.5rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem"
                        },
                        onclick: () => currentStep--
                      },
                      "上一步"
                    ) : null,

                  currentStep < 4 ?
                    m("",
                      {
                        style: {
                          padding: "0.8rem 2rem",
                          borderRadius: "3rem",
                          background: getColor("main").back,
                          color: getColor("main").front,
                          cursor: "pointer",
                          fontSize: "1.5rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem"
                        },
                        onclick: () => {
                          currentStep++
                        }
                      },
                      [
                        m("span", "下一步"),
                        m.trust(iconPark.getIcon("Right", { size: "1.4rem", fill: getColor("main").front }))
                      ]
                    ) :
                    m("",
                      {
                        style: {
                          display: "flex",
                          gap: "0.8rem"
                        }
                      },
                      [
                        m("",
                          {
                            style: {
                              padding: "0.8rem 2.2rem",
                              borderRadius: "3rem",
                              background: getColor("main").back,
                              color: getColor("main").front,
                              cursor: "pointer",
                              fontSize: "1.5rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem"
                            },
                            onclick: async () => {
                              // 提交前统一完整校验
                              const validationError = validateAllBeforeSubmit()
                              if (validationError) {
                                currentStep = validationError.step
                                Notice.launch({ msg: `⚠️ ${validationError.msg}`, color: "pink" })
                                logs.push(`❌ 提交被拦截 (步骤 ${validationError.step}): ${validationError.msg}`)
                                m.redraw()
                                return
                              }

                              logs.push("⏳ 正在提交任务到主控 AI...")
                              try {
                                await settingData.fnCall("appDispatch", [
                                  appId,
                                  "commitTask",
                                  { config: getFullConfigData(true) }
                                ])
                                logs.push("✅ 任务已提交给主控 AI，请在聊天窗口查看任务进度。")
                                Notice.launch({ msg: "角色包制作任务已启动", color: "green" })
                              } catch (e) {
                                logs.push(`❌ 提交失败: ${e.message}`)
                                Notice.launch({ msg: `提交失败: ${e.message}`, color: "pink" })
                              }
                            }
                          },
                          [
                            m.trust(iconPark.getIcon("Play", { size: "1.4rem", fill: getColor("main").front })),
                            m("span", "开始制作")
                          ]
                        ),
                        m("",
                          {
                            style: {
                              padding: "0.8rem 1.8rem",
                              borderRadius: "3rem",
                              background: getColor("pink_1").back,
                              color: getColor("pink_1").front,
                              cursor: "pointer",
                              fontSize: "1.5rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem"
                            },
                            onclick: async () => {
                              logs.push("🛑 正在发送停止信号...")
                              try {
                                await settingData.fnCall("appDispatch", [appId, "cancelTask", {}])
                                logs.push("✅ 已成功发送停止指令。")
                                Notice.launch({ msg: "已发送停止指令", color: "yellow" })
                              } catch (e) {
                                logs.push(`❌ 停止失败: ${e.message}`)
                              }
                            }
                          },
                          [
                            m.trust(iconPark.getIcon("Square", { size: "1.4rem", fill: getColor("pink_1").front })),
                            m("span", "停止任务")
                          ]
                        )
                      ]
                    )
                ]
              )
            ]
          ),

          // 底部控制台日志窗口 (手绘 3rem 圆角极客终端风格)
          m("",
            {
              style: {
                background: "#0f0f11",
                color: "#00ff66",
                border: `0.1rem solid ${getColor("gray_4").front}22`,
                padding: "1.2rem 1.6rem",
                height: "12rem",
                boxSizing: "border-box",
                overflowX: "hidden",
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: "1.2rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                borderRadius: "3rem",
                boxShadow: "0 0.6rem 1.6rem rgba(0,0,0,0.35), inset 0 0 1rem rgba(0,0,0,0.5)"
              }
            },
            logs.length === 0
              ? [m("div", { style: { color: "#666", fontStyle: "italic" } }, "等待任务开始，运行日志将在这里实时输出...")]
              : logs.map(line => m("", { style: { marginBottom: "0.3rem" } }, line))
          )
        ]
      )
    }
  }
}
