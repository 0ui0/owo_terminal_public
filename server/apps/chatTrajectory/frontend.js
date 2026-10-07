import chatTrajectoryData from "./chatTrajectoryData.js"

export default ({ appId, m, Notice, ioSocket, commonData, settingData, Box, iconPark, getColor, trs }) => {
  // 1. 显式初始化与唯一类型状态变量 (严格遵守编程指南，禁止以 null 或 undefined 初始化)
  let dataObj = {}
  let isFetchingBool = false
  let errorStr = ""
  let viewModeStr = "chats" // "chats" | "asks"
  let searchQueryStr = ""
  let selectedStepIdStr = ""
  let activeDetailTabStr = "formatted" // "overview" | "formatted" | "raw"
  let collapsedTurnSet = new Set()

  // 2. 安全 JSON 字符串解析函数
  const safeJsonParseFn = (strVal) => {
    if (typeof strVal !== "string") return {}
    const trimmedStr = strVal.trim()
    if ((trimmedStr.startsWith("{") && trimmedStr.endsWith("}")) || (trimmedStr.startsWith("[") && trimmedStr.endsWith("]"))) {
      try {
        return JSON.parse(trimmedStr)
      } catch (err) {
        console.error("[chatTrajectory] safeJsonParse error:", err)
        return {}
      }
    }
    return {}
  }

  // 3. 特殊协议解构器 (拆解 extJsonConfig 与元数据)
  const parseSpecialProtocolsFn = (contentStr) => {
    if (typeof contentStr !== "string") {
      return { cleanContentStr: "", extJsonObj: {}, metaDataStr: "" }
    }

    let extJsonObj = {}
    let metaDataStr = ""
    let cleanContentStr = contentStr

    const extMatchArr = cleanContentStr.match(/<extJsonConfig>([\s\S]*?)<\/extJsonConfig>/)
    if (extMatchArr) {
      try {
        extJsonObj = JSON.parse(extMatchArr[1].trim())
      } catch (err) {
        console.error("[chatTrajectory] parse extJsonConfig error:", err)
        extJsonObj = { parseErrorStr: err.message, rawStr: extMatchArr[1].trim() }
      }
      cleanContentStr = cleanContentStr.replace(/<extJsonConfig>[\s\S]*?<\/extJsonConfig>/g, "").trim()
    }

    const metaMatchArr = cleanContentStr.match(/<readOnlyMetaData>([\s\S]*?)<\/readOnlyMetaData>/)
    if (metaMatchArr) {
      metaDataStr = metaMatchArr[1].trim()
      cleanContentStr = cleanContentStr.replace(/<readOnlyMetaData>[\s\S]*?<\/readOnlyMetaData>/g, "").trim()
    }

    return { cleanContentStr, extJsonObj, metaDataStr }
  }

  // 4. 轮次与步骤模型转换器
  const buildTrajectoryTurnsFn = (rawObj, modeStr) => {
    const turnArr = []
    let currentTurnObj = {
      turnIndexNum: 0,
      stepArr: []
    }

    const ensureTurnFn = (turnIndexNum) => {
      if (currentTurnObj.turnIndexNum !== turnIndexNum) {
        currentTurnObj = {
          turnIndexNum: turnIndexNum,
          stepArr: []
        }
        turnArr.push(currentTurnObj)
      }
      return currentTurnObj
    }

    if (modeStr === "chats") {
      const messageArr = Array.isArray(rawObj.messages) ? rawObj.messages : []
      let turnCounterNum = 0

      messageArr.forEach((msgObj, idxNum) => {
        const roleStr = msgObj.role || "unknown"
        const contentStr = typeof msgObj.content === "string" ? msgObj.content : (Array.isArray(msgObj.content) ? JSON.stringify(msgObj.content) : "")
        const protocolObj = parseSpecialProtocolsFn(contentStr)

        if (roleStr === "user" || currentTurnObj.turnIndexNum === 0) {
          turnCounterNum++
          ensureTurnFn(turnCounterNum)
        }

        if (roleStr === "assistant" && Array.isArray(msgObj.tool_calls) && msgObj.tool_calls.length > 0) {
          if (protocolObj.cleanContentStr || Object.keys(protocolObj.extJsonObj).length > 0) {
            currentTurnObj.stepArr.push({
              idStr: `step_${idxNum}_thought`,
              turnIndexNum: currentTurnObj.turnIndexNum,
              stepIndexNum: currentTurnObj.stepArr.length + 1,
              roleStr: "assistant",
              kindStr: "thought",
              titleStr: trs("聊天轨迹/标签/助理思考", { cn: "助理思考与计划", en: "Assistant Thoughts" }),
              summaryStr: protocolObj.cleanContentStr || protocolObj.extJsonObj.mind || "",
              contentStr: contentStr,
              cleanContentStr: protocolObj.cleanContentStr,
              extJsonObj: protocolObj.extJsonObj,
              metaDataStr: protocolObj.metaDataStr,
              toolNameStr: "",
              toolArgsStr: "",
              toolResultStr: "",
              parsedArgsObj: {},
              parsedResultObj: {},
              statusStr: "completed",
              rawObj: msgObj
            })
          }

          msgObj.tool_calls.forEach((tcObj, tcIdxNum) => {
            const fnNameStr = tcObj.function?.name || tcObj.name || trs("聊天轨迹/标签/未知工具", { cn: "未知工具", en: "Unknown Tool" })
            const argsStr = tcObj.function?.arguments || ""
            currentTurnObj.stepArr.push({
              idStr: tcObj.id || `step_${idxNum}_tc_${tcIdxNum}`,
              turnIndexNum: currentTurnObj.turnIndexNum,
              stepIndexNum: currentTurnObj.stepArr.length + 1,
              roleStr: "tool",
              kindStr: "toolCall",
              titleStr: fnNameStr,
              summaryStr: argsStr.slice(0, 80),
              contentStr: "",
              cleanContentStr: "",
              extJsonObj: {},
              metaDataStr: "",
              toolNameStr: fnNameStr,
              toolArgsStr: argsStr,
              toolResultStr: "",
              parsedArgsObj: safeJsonParseFn(argsStr),
              parsedResultObj: {},
              statusStr: "completed",
              rawObj: tcObj
            })
          })
        } else if (roleStr === "tool") {
          const parsedResObj = safeJsonParseFn(contentStr)
          currentTurnObj.stepArr.push({
            idStr: `step_${idxNum}_res`,
            turnIndexNum: currentTurnObj.turnIndexNum,
            stepIndexNum: currentTurnObj.stepArr.length + 1,
            roleStr: "tool",
            kindStr: "toolResult",
            titleStr: msgObj.name || trs("聊天轨迹/标签/工具结果", { cn: "工具执行结果", en: "Tool Result" }),
            summaryStr: contentStr.slice(0, 80),
            contentStr: contentStr,
            cleanContentStr: contentStr,
            extJsonObj: {},
            metaDataStr: "",
            toolNameStr: msgObj.name || "",
            toolArgsStr: "",
            toolResultStr: contentStr,
            parsedArgsObj: {},
            parsedResultObj: parsedResObj,
            statusStr: parsedResObj.ok === false ? "error" : "completed",
            rawObj: msgObj
          })
        } else {
          const isUserBool = roleStr === "user"
          const isSystemBool = roleStr === "system"
          currentTurnObj.stepArr.push({
            idStr: `step_${idxNum}`,
            turnIndexNum: currentTurnObj.turnIndexNum,
            stepIndexNum: currentTurnObj.stepArr.length + 1,
            roleStr: roleStr,
            kindStr: isUserBool ? "user" : (isSystemBool ? "system" : "message"),
            titleStr: isUserBool
              ? trs("聊天轨迹/标签/用户输入", { cn: "用户输入", en: "User Input" })
              : (isSystemBool ? trs("聊天轨迹/标签/系统提示", { cn: "系统提示", en: "System Prompt" }) : trs("聊天轨迹/标签/助理回复", { cn: "助理回复", en: "Assistant Message" })),
            summaryStr: protocolObj.cleanContentStr || contentStr,
            contentStr: contentStr,
            cleanContentStr: protocolObj.cleanContentStr,
            extJsonObj: protocolObj.extJsonObj,
            metaDataStr: protocolObj.metaDataStr,
            toolNameStr: "",
            toolArgsStr: "",
            toolResultStr: "",
            parsedArgsObj: {},
            parsedResultObj: {},
            statusStr: "completed",
            rawObj: msgObj
          })
        }
      })
    } else {
      const askArr = Array.isArray(rawObj) ? rawObj : (Array.isArray(rawObj.asks) ? rawObj.asks : [])
      let turnCounterNum = 0
      askArr.forEach((askObj, idxNum) => {
        turnCounterNum++
        const turnObj = ensureTurnFn(turnCounterNum)
        const contentStr = typeof askObj.content === "string" ? askObj.content : JSON.stringify(askObj)
        const protocolObj = parseSpecialProtocolsFn(contentStr)
        turnObj.stepArr.push({
          idStr: `ask_${idxNum}`,
          turnIndexNum: turnCounterNum,
          stepIndexNum: 1,
          roleStr: askObj.role || (askObj.group === "agent" ? "assistant" : "user"),
          kindStr: askObj.role || "message",
          titleStr: askObj.name || trs("聊天轨迹/标签/队列项", { cn: "队列任务项", en: "Queue Item" }),
          summaryStr: protocolObj.cleanContentStr || contentStr,
          contentStr: contentStr,
          cleanContentStr: protocolObj.cleanContentStr,
          extJsonObj: protocolObj.extJsonObj,
          metaDataStr: protocolObj.metaDataStr,
          toolNameStr: "",
          toolArgsStr: "",
          toolResultStr: "",
          parsedArgsObj: {},
          parsedResultObj: {},
          statusStr: "completed",
          rawObj: askObj
        })
      })
    }

    return turnArr
  }

  // 5. 异步获取数据函数
  const fetchDataAFn = async () => {
    isFetchingBool = true
    errorStr = ""
    m.redraw()
    try {
      const endpointStr = viewModeStr === "chats" ? "chats/get" : "asks/get"
      const resObj = await m.request({
        method: "GET",
        url: `/api/aiAsk/${endpointStr}?_t=${Date.now()}`
      })
      dataObj = resObj || {}
      const turnArr = buildTrajectoryTurnsFn(dataObj, viewModeStr)
      if (turnArr.length > 0 && turnArr[0].stepArr.length > 0 && !selectedStepIdStr) {
        selectedStepIdStr = turnArr[0].stepArr[0].idStr
      }
    } catch (err) {
      console.error("[chatTrajectory] fetchData error:", err)
      errorStr = err.message || String(err)
    } finally {
      isFetchingBool = false
      m.redraw()
    }
  }

  // 6. 复制文本工具函数
  const copyTextFn = (textVal) => {
    if (!textVal) return
    const textToCopyStr = typeof textVal === "object" ? JSON.stringify(textVal, null, 2) : String(textVal)
    navigator.clipboard.writeText(textToCopyStr).then(() => {
      Notice?.launch({
        msg: trs("聊天轨迹/提示/已复制", { cn: "已成功复制到剪贴板", en: "Copied to clipboard" }),
        type: "success"
      })
    }).catch((err) => {
      console.error("[chatTrajectory] copy error:", err)
      Notice?.launch({
        msg: trs("聊天轨迹/提示/复制失败", { cn: "复制失败", en: "Copy failed" }),
        type: "error"
      })
    })
  }

  // 7. 注册实例接口并挂载到全局
  const instanceInterfaceObj = {
    onDispatch: (msgObj, callbackFn) => {
      if (msgObj.action === "refresh") {
        fetchDataAFn()
        if (callbackFn) callbackFn({ ok: true, msg: "刷新成功" })
      }
    }
  }

  chatTrajectoryData.addTool("commonData", commonData)
  chatTrajectoryData.registerInstances(appId, instanceInterfaceObj)
  if (commonData.registerApp) {
    commonData.registerApp(appId, chatTrajectoryData)
  }

  // 8. 闭包组件视图生命周期
  return {
    async oninit() {
      await fetchDataAFn()
    },

    onremove() {
      chatTrajectoryData.unregisterInstances(appId, commonData)
    },

    view() {
      const gColorFn = getColor || (() => ({ back: "#ffffff", front: "#1d1d1f" }))
      const baseGrayColorObj = gColorFn("gray_4")
      const mainColorObj = gColorFn("main")
      const turnArr = buildTrajectoryTurnsFn(dataObj, viewModeStr)
      const allStepArr = turnArr.flatMap(t => t.stepArr)

      const queryStr = searchQueryStr.trim().toLowerCase()
      const filteredTurnArr = turnArr.map(t => {
        if (!queryStr) return t
        const matchStepArr = t.stepArr.filter(s => {
          return (s.titleStr && s.titleStr.toLowerCase().includes(queryStr)) ||
            (s.summaryStr && s.summaryStr.toLowerCase().includes(queryStr)) ||
            (s.toolNameStr && s.toolNameStr.toLowerCase().includes(queryStr)) ||
            (s.toolArgsStr && s.toolArgsStr.toLowerCase().includes(queryStr)) ||
            (s.toolResultStr && s.toolResultStr.toLowerCase().includes(queryStr))
        })
        return {
          turnIndexNum: t.turnIndexNum,
          stepArr: matchStepArr
        }
      }).filter(t => t.stepArr.length > 0)

      const currentStepObj = allStepArr.find(s => s.idStr === selectedStepIdStr) || (allStepArr.length > 0 ? allStepArr[0] : null)

      const getRoleThemeFn = (roleStr, kindStr) => {
        if (roleStr === "user") return gColorFn("main")
        if (kindStr === "thought") return gColorFn("purple_1")
        if (roleStr === "assistant") return gColorFn("blue_1")
        if (roleStr === "tool") return kindStr === "toolResult" ? gColorFn("green_1") : gColorFn("yellow_1")
        return gColorFn("gray_3")
      }

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: baseGrayColorObj.back,
            color: baseGrayColorObj.front,
            fontSize: "1.5rem",
            boxSizing: "border-box",
            overflow: "hidden"
          }
        },
        [
          // 8.1 顶栏工具条 Toolbar
          m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.8rem 1.4rem",
                borderBottom: `1px solid ${baseGrayColorObj.front}18`,
                background: "rgba(0, 0, 0, 0.03)",
                flexWrap: "wrap",
                gap: "0.8rem"
              }
            },
            [
              // 模式与主标题
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem"
                  }
                },
                [
                  m("span",
                    {
                      style: {
                        fontSize: "1.8rem",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem"
                      }
                    },
                    trs("聊天轨迹/标题/模型执行轨迹", { cn: "模型执行轨迹", en: "Execution Trajectory" })
                  ),
                  m(Box,
                    {
                      isBtn: true,
                      style: {
                        padding: "0.3rem 0.9rem",
                        margin: "0",
                        fontSize: "1.2rem",
                        borderRadius: "3rem",
                        background: gColorFn("blue_1").back,
                        color: gColorFn("blue_1").front
                      },
                      onclick: () => {
                        viewModeStr = viewModeStr === "chats" ? "asks" : "chats"
                        fetchDataAFn()
                      }
                    },
                    viewModeStr === "chats"
                      ? trs("聊天轨迹/按钮/切至Asks", { cn: "查看 Asks 队列", en: "View Asks Queue" })
                      : trs("聊天轨迹/按钮/切至Chats", { cn: "查看 Chats 上下文", en: "View Chats Context" })
                  )
                ]
              ),

              // 搜索输入框
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    background: `${baseGrayColorObj.front}0a`,
                    borderRadius: "3rem",
                    padding: "0.2rem 1rem",
                    minWidth: "22rem"
                  }
                },
                [
                  m("input",
                    {
                      type: "text",
                      placeholder: trs("聊天轨迹/占位/搜索轨迹", { cn: "搜索角色、工具、内容...", en: "Search steps, tools, content..." }),
                      value: searchQueryStr,
                      style: {
                        border: "none",
                        background: "transparent",
                        outline: "none",
                        color: "inherit",
                        fontSize: "1.3rem",
                        width: "100%"
                      },
                      oninput: (e) => {
                        searchQueryStr = e.target.value
                      }
                    }
                  )
                ]
              ),

              // 控制按钮栏
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.8rem"
                  }
                },
                [
                  m(Box,
                    {
                      isBtn: true,
                      style: {
                        padding: "0.3rem 0.9rem",
                        margin: "0",
                        fontSize: "1.2rem",
                        borderRadius: "3rem",
                        background: `${baseGrayColorObj.front}0f`,
                        color: baseGrayColorObj.front
                      },
                      onclick: () => {
                        if (collapsedTurnSet.size > 0) {
                          collapsedTurnSet.clear()
                        } else {
                          turnArr.forEach(t => collapsedTurnSet.add(t.turnIndexNum))
                        }
                      }
                    },
                    collapsedTurnSet.size > 0
                      ? trs("聊天轨迹/按钮/展开全部", { cn: "展开全部轮次", en: "Expand Turns" })
                      : trs("聊天轨迹/按钮/收起全部", { cn: "收起全部轮次", en: "Collapse Turns" })
                  ),
                  m(Box,
                    {
                      isBtn: true,
                      style: {
                        padding: "0.3rem 1.1rem",
                        margin: "0",
                        fontSize: "1.2rem",
                        borderRadius: "3rem",
                        background: mainColorObj.back,
                        color: mainColorObj.front
                      },
                      onclick: () => {
                        if (!isFetchingBool) fetchDataAFn()
                      }
                    },
                    isFetchingBool
                      ? trs("聊天轨迹/按钮/加载中", { cn: "拉取中...", en: "Loading..." })
                      : trs("聊天轨迹/按钮/刷新", { cn: "刷新数据", en: "Refresh" })
                  )
                ]
              )
            ]
          ),

          // 8.2 顶部泳道时间线 (Timeline Strip)
          allStepArr.length > 0 ? m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                padding: "0.6rem 1.4rem",
                background: "rgba(0, 0, 0, 0.05)",
                borderBottom: `1px solid ${baseGrayColorObj.front}14`,
                overflowX: "auto",
                gap: "0.4rem",
                flexShrink: 0
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: "1.2rem",
                    fontWeight: "600",
                    marginRight: "0.6rem",
                    whiteSpace: "nowrap",
                    opacity: "0.7"
                  }
                },
                trs("聊天轨迹/泳道/时间流", { cn: "时序泳道", en: "Timeline" })
              ),
              allStepArr.map((sObj, idxNum) => {
                const roleColorObj = getRoleThemeFn(sObj.roleStr, sObj.kindStr)
                const isSelectedBool = sObj.idStr === selectedStepIdStr
                return m("",
                  {
                    key: `strip_${sObj.idStr}`,
                    title: `#${idxNum + 1} [${sObj.titleStr}] ${sObj.summaryStr.slice(0, 60)}`,
                    style: {
                      width: isSelectedBool ? "2rem" : "1.2rem",
                      height: "1.2rem",
                      borderRadius: "0.3rem",
                      background: roleColorObj.front,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      transform: isSelectedBool ? "scaleY(1.4)" : "scale(1)",
                      boxShadow: isSelectedBool ? `0 0 6px ${roleColorObj.front}` : "none",
                      flexShrink: 0
                    },
                    onclick: () => {
                      selectedStepIdStr = sObj.idStr
                    }
                  }
                )
              })
            ]
          ) : null,

          // 8.3 主体双栏区域
          m("",
            {
              style: {
                display: "flex",
                flex: 1,
                minHeight: 0,
                overflow: "hidden"
              }
            },
            [
              // 左栏：轮次流列表
              m("",
                {
                  style: {
                    width: "42%",
                    minWidth: "30rem",
                    maxWidth: "50rem",
                    borderRight: `1px solid ${baseGrayColorObj.front}14`,
                    overflowY: "auto",
                    padding: "1rem",
                    boxSizing: "border-box"
                  }
                },
                [
                  filteredTurnArr.length === 0 ? m("",
                    {
                      style: {
                        padding: "3rem",
                        textAlign: "center",
                        opacity: "0.5",
                        fontSize: "1.4rem"
                      }
                    },
                    trs("聊天轨迹/提示/无匹配记录", { cn: "当前暂无符合条件的轨迹步骤", en: "No matching steps found" })
                  ) : null,

                  filteredTurnArr.map(turnObj => {
                    const isCollapsedBool = collapsedTurnSet.has(turnObj.turnIndexNum)
                    return m("",
                      {
                        key: `turn_${turnObj.turnIndexNum}`,
                        style: {
                          marginBottom: "1rem"
                        }
                      },
                      [
                        // 轮次折叠头
                        m("",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.6rem 0.8rem",
                              borderRadius: "0.6rem",
                              background: `${baseGrayColorObj.front}08`,
                              cursor: "pointer",
                              userSelect: "none",
                              fontWeight: "600",
                              fontSize: "1.3rem",
                              marginBottom: "0.4rem"
                            },
                            onclick: () => {
                              if (isCollapsedBool) collapsedTurnSet.delete(turnObj.turnIndexNum)
                              else collapsedTurnSet.add(turnObj.turnIndexNum)
                            }
                          },
                          [
                            m("span", `第 ${turnObj.turnIndexNum} 轮 · 共 ${turnObj.stepArr.length} 个步骤`),
                            m("span", { style: { fontSize: "1.1rem", opacity: "0.6" } }, isCollapsedBool ? "[+]" : "[-]")
                          ]
                        ),

                        // 步骤卡片列表
                        !isCollapsedBool ? turnObj.stepArr.map(stepObj => {
                          const roleColorObj = getRoleThemeFn(stepObj.roleStr, stepObj.kindStr)
                          const isSelectedBool = stepObj.idStr === selectedStepIdStr
                          return m("",
                            {
                              key: stepObj.idStr,
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                padding: "0.7rem 0.9rem",
                                borderRadius: "0.8rem",
                                background: isSelectedBool ? `${mainColorObj.front}18` : `${baseGrayColorObj.front}04`,
                                border: isSelectedBool ? `1.5px solid ${mainColorObj.front}` : "1.5px solid transparent",
                                marginBottom: "0.4rem",
                                cursor: "pointer",
                                transition: "all 0.15s ease"
                              },
                              onclick: () => {
                                selectedStepIdStr = stepObj.idStr
                              }
                            },
                            [
                              m("",
                                {
                                  style: {
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: "0.3rem"
                                  }
                                },
                                [
                                  m("",
                                    {
                                      style: {
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.5rem"
                                      }
                                    },
                                    [
                                      m("span",
                                        {
                                          style: {
                                            fontSize: "1.1rem",
                                            padding: "0.15rem 0.6rem",
                                            borderRadius: "3rem",
                                            background: roleColorObj.back,
                                            color: roleColorObj.front,
                                            fontWeight: "600"
                                          }
                                        },
                                        stepObj.kindStr === "toolCall" ? "工具" : (stepObj.kindStr === "toolResult" ? "结果" : (stepObj.roleStr === "user" ? "用户" : "助理"))
                                      ),
                                      m("span",
                                        {
                                          style: {
                                            fontWeight: "600",
                                            fontSize: "1.35rem",
                                            color: isSelectedBool ? mainColorObj.front : "inherit"
                                          }
                                        },
                                        stepObj.titleStr
                                      )
                                    ]
                                  ),
                                  m("span",
                                    {
                                      style: {
                                        fontSize: "1.1rem",
                                        opacity: "0.5"
                                      }
                                    },
                                    `#${stepObj.stepIndexNum}`
                                  )
                                ]
                              ),
                              m("",
                                {
                                  style: {
                                    fontSize: "1.2rem",
                                    opacity: "0.75",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                  }
                                },
                                stepObj.summaryStr || "(无纯文本正文)"
                              )
                            ]
                          )
                        }) : null
                      ]
                    )
                  })
                ]
              ),

              // 右栏：多维审查卡片
              m("",
                {
                  style: {
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    background: "rgba(0, 0, 0, 0.015)"
                  }
                },
                [
                  currentStepObj ? [
                    // 详情 Header
                    m("",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "1rem 1.4rem",
                          borderBottom: `1px solid ${baseGrayColorObj.front}14`,
                          background: `${baseGrayColorObj.front}04`
                        }
                      },
                      [
                        m("",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "0.8rem"
                            }
                          },
                          [
                            m("span",
                              {
                                style: {
                                  fontSize: "1.6rem",
                                  fontWeight: "600"
                                }
                              },
                              `${currentStepObj.titleStr} · 第 ${currentStepObj.turnIndexNum} 轮`
                            ),
                            m("span",
                              {
                                style: {
                                  fontSize: "1.1rem",
                                  padding: "0.2rem 0.7rem",
                                  borderRadius: "3rem",
                                  background: currentStepObj.statusStr === "error" ? gColorFn("pink_1").back : gColorFn("green_1").back,
                                  color: currentStepObj.statusStr === "error" ? gColorFn("pink_1").front : gColorFn("green_1").front,
                                  fontWeight: "600"
                                }
                              },
                              currentStepObj.statusStr === "error" ? "异常" : "完成"
                            )
                          ]
                        ),
                        m(Box,
                          {
                            isBtn: true,
                            style: {
                              padding: "0.3rem 0.9rem",
                              margin: "0",
                              fontSize: "1.2rem",
                              borderRadius: "3rem",
                              background: `${baseGrayColorObj.front}10`,
                              color: baseGrayColorObj.front
                            },
                            onclick: () => {
                              const toCopyVal = currentStepObj.toolArgsStr || currentStepObj.toolResultStr || currentStepObj.contentStr || currentStepObj.rawObj
                              copyTextFn(toCopyVal)
                            }
                          },
                          trs("聊天轨迹/按钮/复制内容", { cn: "复制内容", en: "Copy Content" })
                        )
                      ]
                    ),

                    // Tab 切换条
                    m("",
                      {
                        style: {
                          display: "flex",
                          gap: "0.5rem",
                          padding: "0.6rem 1.4rem",
                          borderBottom: `1px solid ${baseGrayColorObj.front}10`
                        }
                      },
                      [
                        { idStr: "formatted", labelStr: trs("聊天轨迹/Tab/结构化预览", { cn: "结构化 / JSON 预览", en: "Formatted & JSON" }) },
                        { idStr: "overview", labelStr: trs("聊天轨迹/Tab/概览", { cn: "属性概述", en: "Overview" }) },
                        { idStr: "raw", labelStr: trs("聊天轨迹/Tab/原始数据", { cn: "原始报文 (Raw)", en: "Raw Payload" }) }
                      ].map(tabItem => {
                        const isActiveBool = activeDetailTabStr === tabItem.idStr
                        return m(Box,
                          {
                            key: tabItem.idStr,
                            isBtn: true,
                            style: {
                              padding: "0.3rem 1rem",
                              margin: "0",
                              fontSize: "1.3rem",
                              borderRadius: "3rem",
                              background: isActiveBool ? mainColorObj.back : "transparent",
                              color: isActiveBool ? mainColorObj.front : "inherit",
                              fontWeight: isActiveBool ? "600" : "normal"
                            },
                            onclick: () => {
                              activeDetailTabStr = tabItem.idStr
                            }
                          },
                          tabItem.labelStr
                        )
                      })
                    ),

                    // 详情面板正文
                    m("",
                      {
                        style: {
                          flex: 1,
                          overflowY: "auto",
                          padding: "1.4rem",
                          boxSizing: "border-box"
                        }
                      },
                      [
                        // 1. 结构化预览
                        activeDetailTabStr === "formatted" ? [
                          // 宅喵 extJsonConfig 卡片
                          Object.keys(currentStepObj.extJsonObj).length > 0 ? m("",
                            {
                              style: {
                                background: `${gColorFn("purple_1").front}0d`,
                                border: `1px solid ${gColorFn("purple_1").front}33`,
                                borderRadius: "0.8rem",
                                padding: "1.2rem",
                                marginBottom: "1.2rem"
                              }
                            },
                            [
                              m("",
                                {
                                  style: {
                                    color: gColorFn("purple_1").front,
                                    fontWeight: "600",
                                    fontSize: "1.4rem",
                                    marginBottom: "0.8rem",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between"
                                  }
                                },
                                [
                                  trs("聊天轨迹/协议/宅喵协议", { cn: "🐾 宅喵通信协议 (extJsonConfig)", en: "ChatCat Protocol (extJsonConfig)" }),
                                  m(Box,
                                    {
                                      isBtn: true,
                                      style: {
                                        fontSize: "1.1rem",
                                        padding: "0.2rem 0.6rem",
                                        margin: "0",
                                        borderRadius: "3rem",
                                        background: gColorFn("purple_1").back,
                                        color: gColorFn("purple_1").front
                                      },
                                      onclick: () => copyTextFn(currentStepObj.extJsonObj)
                                    },
                                    "复制 JSON"
                                  )
                                ]
                              ),
                              currentStepObj.extJsonObj.mind ? m("",
                                { style: { marginBottom: "0.6rem" } },
                                [
                                  m("span", { style: { fontWeight: "600", color: gColorFn("purple_1").front } }, "思考大纲 (mind): "),
                                  m("span", { style: { opacity: "0.9" } }, currentStepObj.extJsonObj.mind)
                                ]
                              ) : null,
                              (currentStepObj.extJsonObj.mood !== undefined || currentStepObj.extJsonObj.playFace || currentStepObj.extJsonObj.faceAction) ? m("",
                                {
                                  style: {
                                    display: "flex",
                                    gap: "1rem",
                                    fontSize: "1.2rem",
                                    marginBottom: "0.6rem",
                                    opacity: "0.85"
                                  }
                                },
                                [
                                  currentStepObj.extJsonObj.mood !== undefined ? m("span", `心情值: ${currentStepObj.extJsonObj.mood}`) : null,
                                  currentStepObj.extJsonObj.faceAction ? m("span", `表情: ${currentStepObj.extJsonObj.faceAction}`) : null,
                                  currentStepObj.extJsonObj.playFace ? m("span", `动效: ${currentStepObj.extJsonObj.playFace}`) : null
                                ]
                              ) : null,
                              currentStepObj.extJsonObj.note ? m("",
                                { style: { marginTop: "0.8rem" } },
                                [
                                  m("", { style: { fontWeight: "600", marginBottom: "0.3rem" } }, "记忆笔记 (note):"),
                                  m("pre",
                                    {
                                      style: {
                                        background: "rgba(0, 0, 0, 0.1)",
                                        padding: "0.8rem",
                                        borderRadius: "0.6rem",
                                        whiteSpace: "pre-wrap",
                                        fontSize: "1.25rem",
                                        margin: "0"
                                      }
                                    },
                                    currentStepObj.extJsonObj.note
                                  )
                                ]
                              ) : null
                            ]
                          ) : null,

                          // 工具参数 JSON
                          Object.keys(currentStepObj.parsedArgsObj).length > 0 ? m("",
                            {
                              style: {
                                background: "rgba(0, 0, 0, 0.06)",
                                borderRadius: "0.8rem",
                                padding: "1.2rem",
                                marginBottom: "1.2rem"
                              }
                            },
                            [
                              m("",
                                {
                                  style: {
                                    fontWeight: "600",
                                    fontSize: "1.4rem",
                                    marginBottom: "0.6rem",
                                    color: gColorFn("yellow_1").front,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between"
                                  }
                                },
                                [
                                  trs("聊天轨迹/字段/入参JSON", { cn: "工具输入参数 (JSON)", en: "Tool Arguments (JSON)" }),
                                  m(Box,
                                    {
                                      isBtn: true,
                                      style: {
                                        fontSize: "1.1rem",
                                        padding: "0.2rem 0.6rem",
                                        margin: "0",
                                        borderRadius: "3rem",
                                        background: gColorFn("yellow_1").back,
                                        color: gColorFn("yellow_1").front
                                      },
                                      onclick: () => copyTextFn(currentStepObj.parsedArgsObj)
                                    },
                                    "复制"
                                  )
                                ]
                              ),
                              m("pre",
                                {
                                  style: {
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    fontSize: "1.3rem",
                                    fontFamily: "Consolas, Monaco, monospace"
                                  }
                                },
                                JSON.stringify(currentStepObj.parsedArgsObj, null, 2)
                              )
                            ]
                          ) : null,

                          // 工具执行结果 JSON
                          Object.keys(currentStepObj.parsedResultObj).length > 0 ? m("",
                            {
                              style: {
                                background: "rgba(0, 0, 0, 0.06)",
                                borderRadius: "0.8rem",
                                padding: "1.2rem",
                                marginBottom: "1.2rem"
                              }
                            },
                            [
                              m("",
                                {
                                  style: {
                                    fontWeight: "600",
                                    fontSize: "1.4rem",
                                    marginBottom: "0.6rem",
                                    color: gColorFn("green_1").front,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between"
                                  }
                                },
                                [
                                  trs("聊天轨迹/字段/返回JSON", { cn: "工具执行结果 (JSON)", en: "Tool Result (JSON)" }),
                                  m(Box,
                                    {
                                      isBtn: true,
                                      style: {
                                        fontSize: "1.1rem",
                                        padding: "0.2rem 0.6rem",
                                        margin: "0",
                                        borderRadius: "3rem",
                                        background: gColorFn("green_1").back,
                                        color: gColorFn("green_1").front
                                      },
                                      onclick: () => copyTextFn(currentStepObj.parsedResultObj)
                                    },
                                    "复制"
                                  )
                                ]
                              ),
                              m("pre",
                                {
                                  style: {
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    fontSize: "1.3rem",
                                    fontFamily: "Consolas, Monaco, monospace"
                                  }
                                },
                                JSON.stringify(currentStepObj.parsedResultObj, null, 2)
                              )
                            ]
                          ) : null,

                          // 普通文本或未解析结果
                          (currentStepObj.cleanContentStr || currentStepObj.toolResultStr || currentStepObj.toolArgsStr) ? m("",
                            {
                              style: {
                                background: "rgba(0, 0, 0, 0.04)",
                                borderRadius: "0.8rem",
                                padding: "1.2rem"
                              }
                            },
                            [
                              m("",
                                {
                                  style: {
                                    fontWeight: "600",
                                    marginBottom: "0.6rem",
                                    fontSize: "1.3rem",
                                    opacity: "0.8"
                                  }
                                },
                                trs("聊天轨迹/字段/正文内容", { cn: "正文内容 / 结果", en: "Content / Output" })
                              ),
                              m("pre",
                                {
                                  style: {
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    fontSize: "1.35rem",
                                    lineHeight: "1.6"
                                  }
                                },
                                currentStepObj.cleanContentStr || currentStepObj.toolResultStr || currentStepObj.toolArgsStr
                              )
                            ]
                          ) : null
                        ] : null,

                        // 2. 概览模式
                        activeDetailTabStr === "overview" ? m("",
                          {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: "1rem"
                            }
                          },
                          [
                            { labelStr: "步骤唯一 ID", valStr: currentStepObj.idStr },
                            { labelStr: "所属轮次", valStr: `第 ${currentStepObj.turnIndexNum} 轮` },
                            { labelStr: "通信角色 (role)", valStr: currentStepObj.roleStr },
                            { labelStr: "步骤类型 (kind)", valStr: currentStepObj.kindStr },
                            { labelStr: "执行状态", valStr: currentStepObj.statusStr },
                            { labelStr: "工具名称", valStr: currentStepObj.toolNameStr || "(非工具调用)" }
                          ].map(itemObj => m("",
                            {
                              key: itemObj.labelStr,
                              style: {
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0.8rem 1rem",
                                borderRadius: "0.6rem",
                                background: "rgba(0, 0, 0, 0.04)"
                              }
                            },
                            [
                              m("span", { style: { opacity: "0.7", fontSize: "1.3rem" } }, itemObj.labelStr),
                              m("span", { style: { fontWeight: "600", fontSize: "1.35rem" } }, itemObj.valStr)
                            ]
                          ))
                        ) : null,

                        // 3. Raw 模式
                        activeDetailTabStr === "raw" ? m("",
                          [
                            m("pre",
                              {
                                style: {
                                  margin: 0,
                                  background: "rgba(0, 0, 0, 0.1)",
                                  padding: "1.2rem",
                                  borderRadius: "0.8rem",
                                  whiteSpace: "pre-wrap",
                                  fontSize: "1.25rem",
                                  fontFamily: "Consolas, Monaco, monospace"
                                }
                              },
                              JSON.stringify(currentStepObj.rawObj, null, 2)
                            )
                          ]
                        ) : null
                      ]
                    )
                  ] : m("",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        opacity: "0.5",
                        fontSize: "1.5rem"
                      }
                    },
                    trs("聊天轨迹/提示/选择步骤", { cn: "请在左侧选择一个步骤查看详情", en: "Select a step on the left to inspect" })
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
