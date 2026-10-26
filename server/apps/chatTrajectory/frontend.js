import chatTrajectoryData from "./chatTrajectoryData.js"

export default ({ appId, m, Notice, ioSocket, commonData, settingData, Box, Tag, iconPark, getColor, trs }) => {
  // ============================================================
  // 一、闭包私有状态 (全部显式初始化，类型单一)
  // ============================================================
  let agentListArr = []
  let activeListIdNum = 0
  let isFetchingBool = false
  let errorStr = ""
  let viewModeStr = "chats"
  let searchQueryStr = ""
  let collapsedTurnSet = new Set()
  let activeSelectionRangeObj = { start: 0, end: 1 }
  let isSelectingTimelineBool = false
  let selectStartFractionNum = 0
  let listScrollDom = null

  // ============================================================
  // 二、基础工具函数
  // ============================================================

  // 2.1 宽松 JSON 解析：解析出对象即返回对象，否则返回空对象 (语义为「无法提取字段」)
  const parseJsonFn = (rawVal) => {
    if (rawVal && typeof rawVal === "object") {
      return rawVal
    }
    if (typeof rawVal !== "string" || !rawVal.trim()) {
      return {}
    }
    try {
      const parsedVal = JSON.parse(rawVal.trim())
      return (parsedVal && typeof parsedVal === "object") ? parsedVal : {}
    } catch (err) {
      return {}
    }
  }

  // 2.2 任意值压成单行文本
  const toSingleLineFn = (rawVal) => {
    if (rawVal === null || rawVal === undefined) {
      return ""
    }
    const textStr = (typeof rawVal === "string") ? rawVal : JSON.stringify(rawVal)
    return textStr.replace(/\s+/g, " ").trim()
  }

  // 2.3 超长文本截断
  const clampTextFn = (textStr, maxNum) => {
    if (typeof textStr !== "string") {
      return ""
    }
    return textStr.length > maxNum ? (textStr.slice(0, maxNum) + "…") : textStr
  }

  // 2.4 协议标签解构：剥离 <think> / <extJsonConfig> / <readOnlyMetaData>
  const parseProtocolFn = (contentStr) => {
    if (typeof contentStr !== "string") {
      return {
        cleanStr: "",
        thinkStr: "",
        extObj: {},
        extRawStr: "",
        metaStr: ""
      }
    }
    let cleanStr = contentStr
    let thinkStr = ""
    let extObj = {}
    let extRawStr = ""
    let metaStr = ""

    const thinkMatchArr = cleanStr.match(/<think>([\s\S]*?)<\/think>/i)
    if (thinkMatchArr) {
      thinkStr = thinkMatchArr[1].trim()
      cleanStr = cleanStr.replace(/<think>[\s\S]*?<\/think>/gi, "")
    }

    const extMatchArr = cleanStr.match(/<extJsonConfig>([\s\S]*?)<\/extJsonConfig>/i)
    if (extMatchArr) {
      extRawStr = extMatchArr[1].trim()
      extObj = parseJsonFn(extRawStr)
      cleanStr = cleanStr.replace(/<extJsonConfig>[\s\S]*?<\/extJsonConfig>/gi, "")
    }

    const metaMatchArr = cleanStr.match(/<readOnlyMetaData>([\s\S]*?)<\/readOnlyMetaData>/i)
    if (metaMatchArr) {
      metaStr = metaMatchArr[1].trim()
      cleanStr = cleanStr.replace(/<readOnlyMetaData>[\s\S]*?<\/readOnlyMetaData>/gi, "")
    }

    return {
      cleanStr: cleanStr.trim(),
      thinkStr: thinkStr,
      extObj: extObj,
      extRawStr: extRawStr,
      metaStr: metaStr
    }
  }

  // 2.5 工具入参提炼：把 JSON 压成「键 = 值」的人类可读预览
  const buildArgsPreviewFn = (argsRawVal) => {
    const argsObj = parseJsonFn(argsRawVal)
    const keyArr = Object.keys(argsObj)
    if (keyArr.length === 0) {
      return ""
    }
    return clampTextFn(
      keyArr.map((keyStr) => {
        const val = argsObj[keyStr]
        let valStr = ""
        if (val === null || val === undefined) {
          valStr = "null"
        } else if (Array.isArray(val)) {
          valStr = trs("聊天轨迹/预览/数组", { cn: `数组 ${val.length} 项`, en: `Array ${val.length}` })
        } else if (typeof val === "object") {
          valStr = trs("聊天轨迹/预览/对象", { cn: "对象", en: "Object" })
        } else {
          valStr = String(val).replace(/\s+/g, " ")
        }
        return `${keyStr} = ${clampTextFn(valStr, 42)}`
      }).join("   "),
      200
    )
  }

  // 2.6 工具结果提炼：剥掉系统装饰行与系统元数据，取前两行正文
  const buildResultPreviewFn = (resultRawVal) => {
    const resultStr = (typeof resultRawVal === "string") ? resultRawVal : JSON.stringify(resultRawVal ?? "")
    const metaTagStr = "readOnly" + "MetaData"
    const metaReg = new RegExp("<" + metaTagStr + ">[\\s\\S]*?</" + metaTagStr + ">", "gi")
    const cleanStr = resultStr
      .replace(metaReg, "")
      .replace(/【提示】[^\n]*/g, "")
      .replace(/<\/?terminal>/gi, "")
      .replace(/^\s*\d+:\s?/gm, "")
      .replace(/---+/g, "")
      .trim()
    const lineArr = cleanStr.split("\n").map((lineStr) => lineStr.trim()).filter(Boolean)
    if (lineArr.length === 0) {
      return ""
    }
    return clampTextFn(lineArr.slice(0, 2).join("   "), 200)
  }

  // 2.7 JSON 美化 (非 JSON 文本原样返回)
  const prettyJsonFn = (rawVal) => {
    if (typeof rawVal === "string") {
      const parsedVal = parseJsonFn(rawVal)
      return (Object.keys(parsedVal).length > 0) ? JSON.stringify(parsedVal, null, 2) : rawVal
    }
    return JSON.stringify(rawVal, null, 2)
  }

  // 2.8 复制到剪贴板
  const copyTextFn = (rawVal) => {
    const textStr = (typeof rawVal === "string") ? rawVal : JSON.stringify(rawVal, null, 2)
    if (!textStr) {
      return
    }
    navigator.clipboard.writeText(textStr).then(() => {
      Notice.launch({
        msg: trs("聊天轨迹/提示/已复制", { cn: "已复制到剪贴板", en: "Copied to clipboard" })
      })
    }).catch((err) => {
      console.error("[chatTrajectory] 复制失败:", err)
    })
  }

  // 2.9 平滑滚动定位至指定步骤 (通过 parentNode 直接操纵 Notice 滚动条，保留 Notice 自适应)
  const scrollToStepFn = (stepObj) => {
    if (!stepObj) return
    if (stepObj.turnNum && collapsedTurnSet.has(stepObj.turnNum)) {
      collapsedTurnSet.delete(stepObj.turnNum)
      m.redraw()
    }
    setTimeout(() => {
      const targetDom = document.getElementById(stepObj.idStr)
      if (!targetDom) return

      // 直接通过 parentNode 沿 DOM 链找到真正拥有滚动条的 Notice 内容容器
      let noticeScrollDom = targetDom.parentNode
      while (noticeScrollDom && noticeScrollDom !== document.body) {
        const overflowY = window.getComputedStyle(noticeScrollDom).overflowY
        if (overflowY === "auto" || overflowY === "scroll") {
          break
        }
        noticeScrollDom = noticeScrollDom.parentNode
      }

      if (noticeScrollDom && noticeScrollDom !== document.body) {
        // 计算目标元素相对于 Notice 滚动容器的准确位置，并扣除顶部粘性甘特图的高度 (约 84px)
        const containerRect = noticeScrollDom.getBoundingClientRect()
        const targetRect = targetDom.getBoundingClientRect()
        const deltaY = targetRect.top - containerRect.top
        const stickyHeaderHeight = 84
        const targetScrollTop = noticeScrollDom.scrollTop + deltaY - stickyHeaderHeight
        noticeScrollDom.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth"
        })
      } else {
        targetDom.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, 40)
  }

  // ============================================================
  // 三、数据装配：消息数组 → 轮次 → 步骤
  // ============================================================
  const buildTurnArrFn = (agentObj, modeStr) => {
    if (!agentObj || typeof agentObj !== "object") {
      return []
    }

    const turnArr = []
    let currentStepArr = null
    let turnNum = 0

    const openTurnFn = () => {
      turnNum++
      currentStepArr = []
      turnArr.push({
        turnNum: turnNum,
        stepArr: currentStepArr
      })
    }

    const pushStepFn = (stepObj) => {
      if (currentStepArr === null) {
        openTurnFn()
      }
      currentStepArr.push({
        ...stepObj,
        turnNum: turnNum,
        stepNum: currentStepArr.length + 1
      })
    }

    // 步骤结构体：字段在此显式落位，杜绝游离属性
    const makeStepFn = ({
      idStr,
      roleStr,
      kindStr,
      badgeStr,
      badgeColorStr,
      titleStr,
      summaryStr,
      detailStr,
      thinkStr = "",
      argsPreviewStr = "",
      argsRawStr = "",
      resultPreviewStr = "",
      resultRawStr = "",
      extObj = {},
      extRawStr = "",
      metaStr = "",
      rawObj
    }) => ({
      idStr: idStr,
      roleStr: roleStr,
      kindStr: kindStr,
      badgeStr: badgeStr,
      badgeColorStr: badgeColorStr,
      titleStr: titleStr,
      summaryStr: summaryStr,
      detailStr: detailStr,
      thinkStr: thinkStr,
      argsPreviewStr: argsPreviewStr,
      argsRawStr: argsRawStr,
      resultPreviewStr: resultPreviewStr,
      resultRawStr: resultRawStr,
      extObj: extObj,
      extRawStr: extRawStr,
      metaStr: metaStr,
      rawObj: rawObj
    })

    if (modeStr === "chats") {
      const messageArr = Array.isArray(agentObj.messages) ? agentObj.messages : []
      if (messageArr.length === 0) {
        return []
      }

      // 已被 assistant 的 tool_calls 正式认领的调用编号
      const claimedCallIdSet = new Set()
      messageArr.forEach((msgObj) => {
        if (!msgObj || !Array.isArray(msgObj.tool_calls)) {
          return
        }
        msgObj.tool_calls.forEach((tcObj) => {
          const callIdVal = tcObj.id || tcObj.call_id
          if (callIdVal) {
            claimedCallIdSet.add(String(callIdVal))
          }
        })
      })

      // 调用编号 → 结果消息
      const toolResultMap = new Map()
      messageArr.forEach((msgObj) => {
        if (msgObj && msgObj.tool_call_id) {
          toolResultMap.set(String(msgObj.tool_call_id), msgObj)
        }
      })

      messageArr.forEach((msgObj, idxNum) => {
        if (!msgObj || typeof msgObj !== "object") {
          return
        }
        const roleStr = msgObj.role || "unknown"
        const contentStr = (typeof msgObj.content === "string") ? msgObj.content : JSON.stringify(msgObj.content ?? "")
        const protocolObj = parseProtocolFn(contentStr)

        // 用户消息开路，或首条消息兜底开轮
        if (roleStr === "user" || currentStepArr === null) {
          openTurnFn()
        }

        if (roleStr === "assistant") {
          // A. 深度思考流
          const rawThinkStr = msgObj.reasoning_content || msgObj.reasoning || protocolObj.thinkStr || ""
          if (rawThinkStr.trim()) {
            pushStepFn(makeStepFn({
              idStr: `msg${idxNum}_think`,
              roleStr: "assistant",
              kindStr: "thought",
              badgeStr: trs("聊天轨迹/角色/思考", { cn: "思考", en: "Think" }),
              badgeColorStr: "purple_1",
              titleStr: "",
              summaryStr: clampTextFn(toSingleLineFn(rawThinkStr), 240),
              detailStr: rawThinkStr,
              rawObj: msgObj
            }))
          }

          // B. 工具调用 (与执行结果成对呈现)
          const toolCallArr = Array.isArray(msgObj.tool_calls) ? msgObj.tool_calls : []
          toolCallArr.forEach((tcObj, tcIdxNum) => {
            const callIdVal = tcObj.id || tcObj.call_id
            const callIdStr = callIdVal ? String(callIdVal) : ""
            const toolNameStr = tcObj.function?.name || tcObj.name || ""
            const argsRawVal = tcObj.function?.arguments ?? tcObj.arguments ?? ""
            const argsRawStr = (typeof argsRawVal === "string") ? argsRawVal : JSON.stringify(argsRawVal)
            const resultMsgObj = callIdStr ? toolResultMap.get(callIdStr) : null
            const resultRawStr = resultMsgObj
              ? ((typeof resultMsgObj.content === "string") ? resultMsgObj.content : JSON.stringify(resultMsgObj.content ?? ""))
              : ""
            const argsPreviewStr = buildArgsPreviewFn(argsRawStr)
            const resultPreviewStr = buildResultPreviewFn(resultRawStr)

            pushStepFn(makeStepFn({
              idStr: `msg${idxNum}_call${tcIdxNum}`,
              roleStr: "assistant",
              kindStr: "toolCall",
              badgeStr: trs("聊天轨迹/角色/工具", { cn: "工具", en: "Tool" }),
              badgeColorStr: "green_1",
              titleStr: toolNameStr,
              summaryStr: argsPreviewStr,
              detailStr: argsRawStr,
              argsPreviewStr: argsPreviewStr,
              argsRawStr: argsRawStr,
              resultPreviewStr: resultPreviewStr,
              resultRawStr: resultRawStr,
              rawObj: {
                call: tcObj,
                result: resultMsgObj
              }
            }))
          })

          // C. 助手正文
          if (protocolObj.cleanStr) {
            pushStepFn(makeStepFn({
              idStr: `msg${idxNum}_reply`,
              roleStr: "assistant",
              kindStr: "assistant",
              badgeStr: trs("聊天轨迹/角色/助手", { cn: "助手", en: "Assistant" }),
              badgeColorStr: "pink_1",
              titleStr: "",
              summaryStr: clampTextFn(toSingleLineFn(protocolObj.cleanStr), 240),
              detailStr: protocolObj.cleanStr,
              extObj: protocolObj.extObj,
              extRawStr: protocolObj.extRawStr,
              metaStr: protocolObj.metaStr,
              rawObj: msgObj
            }))
          }
        } else if (roleStr === "tool") {
          // 未被认领的工具结果，单独成条
          const toolCallIdStr = msgObj.tool_call_id ? String(msgObj.tool_call_id) : ""
          if (!toolCallIdStr || !claimedCallIdSet.has(toolCallIdStr)) {
            pushStepFn(makeStepFn({
              idStr: `msg${idxNum}_result`,
              roleStr: "tool",
              kindStr: "toolResult",
              badgeStr: trs("聊天轨迹/角色/结果", { cn: "结果", en: "Result" }),
              badgeColorStr: "green_1",
              titleStr: msgObj.name || "",
              summaryStr: buildResultPreviewFn(contentStr),
              detailStr: contentStr,
              resultPreviewStr: buildResultPreviewFn(contentStr),
              resultRawStr: contentStr,
              rawObj: msgObj
            }))
          }
        } else {
          // 用户 / 系统 消息
          const isUserBool = (roleStr === "user")
          pushStepFn(makeStepFn({
            idStr: `msg${idxNum}`,
            roleStr: roleStr,
            kindStr: isUserBool ? "user" : "system",
            badgeStr: isUserBool
              ? trs("聊天轨迹/角色/用户", { cn: "用户", en: "User" })
              : trs("聊天轨迹/角色/系统", { cn: "系统", en: "System" }),
            badgeColorStr: isUserBool ? "blue_2" : "purple_2",
            titleStr: "",
            summaryStr: clampTextFn(toSingleLineFn(protocolObj.cleanStr || contentStr), 240),
            detailStr: protocolObj.cleanStr || contentStr,
            extObj: protocolObj.extObj,
            extRawStr: protocolObj.extRawStr,
            metaStr: protocolObj.metaStr,
            rawObj: msgObj
          }))
        }
      })
    } else {
      // asks 任务队列模式：每条队列项独立成轮
      const askArr = Array.isArray(agentObj.asks) ? agentObj.asks : []
      askArr.forEach((askObj, idxNum) => {
        if (!askObj || typeof askObj !== "object") {
          return
        }
        openTurnFn()
        const contentStr = (typeof askObj.content === "string") ? askObj.content : JSON.stringify(askObj.content ?? "")
        const protocolObj = parseProtocolFn(contentStr)
        pushStepFn(makeStepFn({
          idStr: String(askObj.id || `ask${idxNum}`),
          roleStr: askObj.role || "unknown",
          kindStr: "ask",
          badgeStr: trs("聊天轨迹/角色/队列", { cn: "队列", en: "Ask" }),
          badgeColorStr: "blue_2",
          titleStr: askObj.name || askObj.title || "",
          summaryStr: clampTextFn(toSingleLineFn(protocolObj.cleanStr || contentStr), 240),
          detailStr: protocolObj.cleanStr || contentStr,
          extObj: protocolObj.extObj,
          extRawStr: protocolObj.extRawStr,
          metaStr: protocolObj.metaStr,
          rawObj: askObj
        }))
      })
    }

    return turnArr
  }

  // ============================================================
  // 四、数据获取 (解包 { ok, data } 包装)
  // ============================================================
  const fetchDataAFn = async () => {
    isFetchingBool = true
    errorStr = ""
    m.redraw()
    try {
      const endpointStr = (viewModeStr === "chats") ? "chats/get" : "asks/get"
      const resObj = await m.request({
        method: "GET",
        url: `/api/aiAsk/${endpointStr}?_t=${Date.now()}`
      })
      if (resObj && resObj.ok === true && Array.isArray(resObj.data)) {
        agentListArr = resObj.data
      } else {
        agentListArr = []
        errorStr = resObj?.msg || trs("聊天轨迹/错误/结构异常", { cn: "接口返回结构异常", en: "Unexpected response" })
      }
      // 校正当前选中会话
      if (agentListArr.length > 0) {
        const stillExistsBool = agentListArr.some((agentObj) => Number(agentObj.listId) === Number(activeListIdNum))
        if (!stillExistsBool) {
          activeListIdNum = Number(agentListArr[0].listId)
        }
      }
    } catch (err) {
      console.error("[chatTrajectory] 获取轨迹数据失败:", err)
      errorStr = err.message || String(err)
      agentListArr = []
    } finally {
      isFetchingBool = false
      m.redraw()
    }
  }

  // ============================================================
  // 五、详情弹窗 (Notice 自适应，绝不硬编码宽高)
  // ============================================================
  const openDetailNoticeFn = (stepObj) => {
    let tabStr = "summary"

    Notice.launch({
      tip: `${stepObj.badgeStr} · ${trs("聊天轨迹/详情/位置", { cn: `第 ${stepObj.turnNum} 轮 / 第 ${stepObj.stepNum} 步`, en: `Turn ${stepObj.turnNum} · Step ${stepObj.stepNum}` })}`,
      content: {
        view() {
          const cardColorObj = getColor("brown_5")
          const pageColorObj = getColor("gray_3")
          const greenColorObj = getColor("green_1")
          const badgeColorObj = getColor(stepObj.badgeColorStr)

          // 核心 Tab 选项
          const tabItemArr = [
            { keyStr: "summary", labelStr: trs("聊天轨迹/详情Tab/摘要", { cn: "摘要", en: "Summary" }) },
            { keyStr: "payload", labelStr: trs("聊天轨迹/详情Tab/参数", { cn: "参数", en: "Payload" }) },
            { keyStr: "result", labelStr: trs("聊天轨迹/详情Tab/结果", { cn: "结果", en: "Result" }) },
            { keyStr: "raw", labelStr: trs("聊天轨迹/详情Tab/原始", { cn: "原始报文", en: "Raw" }) }
          ]

          // 复制源文本提取
          const getCopySourceStr = () => {
            if (tabStr === "payload") return stepObj.argsRawStr || ""
            if (tabStr === "result") return stepObj.resultRawStr || ""
            if (tabStr === "raw") return JSON.stringify(stepObj.rawObj, null, 2)
            return stepObj.detailStr || stepObj.titleStr || ""
          }

          // 标准卡片区块组件 (配置 brown_5 气泡底色，与外层底座拉开清晰层次反差)
          const renderSectionCardFn = (labelStr, tagColorStr, contentVnode) => m(Box,
            {
              color: "brown_5",
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem",
                margin: "0.4rem 0",
                padding: "1rem 1.4rem",
                borderRadius: "1.2rem",
                boxShadow: "0 0.2rem 0.8rem rgba(0, 0, 0, 0.1)"
              }
            },
            [
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem"
                  }
                },
                [
                  m(Tag,
                    {
                      color: tagColorStr,
                      styleExt: {
                        margin: "0",
                        fontSize: "1.15rem"
                      }
                    },
                    labelStr
                  )
                ]
              ),
              contentVnode
            ]
          )

          // 代码与格式化文本展示块
          const renderCodeBoxFn = (codeStr) => m("",
            {
              style: {
                background: "rgba(0, 0, 0, 0.16)",
                color: cardColorObj.front,
                borderRadius: "0.8rem",
                padding: "1rem",
                fontSize: "1.35rem",
                lineHeight: "1.6",
                fontFamily: "Consolas, Monaco, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                maxHeight: "36rem",
                overflowY: "auto",
                borderLeft: `0.3rem solid ${badgeColorObj.back}`
              }
            },
            codeStr
          )

          return m(Box, [
            m("",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem"
                }
              },
              [
                // ---- 顶栏：Tab 切换与快速复制 ----
                m("",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "0.6rem"
                    }
                  },
                [
                  // Tab 胶囊组
                  m("",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        flexWrap: "wrap"
                      }
                    },
                    tabItemArr.map((itemObj) => m(Tag,
                      {
                        key: itemObj.keyStr,
                        isBtn: true,
                        color: (tabStr === itemObj.keyStr) ? "main" : "gray_4",
                        styleExt: {
                          margin: "0",
                          fontSize: "1.25rem"
                        },
                        onclick: () => {
                          tabStr = itemObj.keyStr
                        }
                      },
                      itemObj.labelStr
                    ))
                  ),

                  // 复制按钮
                  m(Tag,
                    {
                      isBtn: true,
                      color: "gray_4",
                      styleExt: {
                        margin: "0",
                        fontSize: "1.2rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      },
                      onclick: () => {
                        copyTextFn(getCopySourceStr())
                      }
                    },
                    [
                      m.trust(iconPark.getIcon("CopyOne", { fill: pageColorObj.front, size: "1.2rem" })),
                      m("span", trs("聊天轨迹/按钮/复制内容", { cn: "复制内容", en: "Copy" }))
                    ]
                  )
                ]
              ),

              // ---- Tab 1: 摘要视图 ----
              tabStr === "summary" ? m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.8rem"
                  }
                },
                [
                  // 基础元信息属性标签条
                  m("",
                    {
                      style: {
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "0.5rem"
                      }
                    },
                    [
                      m(Tag,
                        {
                          color: stepObj.badgeColorStr,
                          styleExt: { margin: "0", fontSize: "1.2rem" }
                        },
                        `${trs("聊天轨迹/字段/角色", { cn: "角色", en: "Role" })}: ${stepObj.roleStr}`
                      ),
                      m(Tag,
                        {
                          color: "gray_4",
                          styleExt: { margin: "0", fontSize: "1.2rem" }
                        },
                        `${trs("聊天轨迹/字段/类型", { cn: "类型", en: "Kind" })}: ${stepObj.kindStr}`
                      ),
                      m(Tag,
                        {
                          color: "gray_4",
                          styleExt: { margin: "0", fontSize: "1.2rem" }
                        },
                        `${trs("聊天轨迹/字段/编号", { cn: "编号", en: "ID" })}: ${stepObj.idStr}`
                      )
                    ]
                  ),

                  // 工具调用块
                  stepObj.titleStr ? renderSectionCardFn(
                    trs("聊天轨迹/字段/工具调用", { cn: "工具调用", en: "Tool Call" }),
                    "green_1",
                    m("",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          fontSize: "1.45rem",
                          color: cardColorObj.front
                        }
                      },
                      [
                        m.trust(iconPark.getIcon("Code", { fill: getColor("green_1").back, size: "1.3rem" })),
                        m("span", stepObj.titleStr)
                      ]
                    )
                  ) : null,

                  // 正文内容块
                  stepObj.detailStr ? renderSectionCardFn(
                    trs("聊天轨迹/字段/正文内容", { cn: "正文内容", en: "Content" }),
                    stepObj.roleStr === "user" ? "blue_2" : "gray_4",
                    m("",
                      {
                        style: {
                          fontSize: "1.35rem",
                          lineHeight: "1.6",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          color: cardColorObj.front
                        }
                      },
                      stepObj.detailStr
                    )
                  ) : null,

                  // 深度思考块
                  stepObj.thinkStr ? renderSectionCardFn(
                    trs("聊天轨迹/字段/深度思考", { cn: "深度思考", en: "Reasoning" }),
                    "purple_1",
                    renderCodeBoxFn(stepObj.thinkStr)
                  ) : null,

                  // 工具入参预览块
                  stepObj.argsRawStr ? renderSectionCardFn(
                    trs("聊天轨迹/字段/工具参数", { cn: "工具入参", en: "Arguments" }),
                    "green_1",
                    renderCodeBoxFn(prettyJsonFn(stepObj.argsRawStr))
                  ) : null,

                  // 执行结果块
                  stepObj.resultRawStr ? renderSectionCardFn(
                    trs("聊天轨迹/字段/执行结果", { cn: "执行结果", en: "Result" }),
                    "green_1",
                    renderCodeBoxFn(prettyJsonFn(stepObj.resultRawStr))
                  ) : null
                ]
              ) : null,

              // ---- Tab 2: 入参报文 ----
              tabStr === "payload" ? m("",
                {
                  style: { display: "flex", flexDirection: "column", gap: "0.6rem" }
                },
                stepObj.argsRawStr
                  ? renderCodeBoxFn(prettyJsonFn(stepObj.argsRawStr))
                  : m(Box,
                    {
                      style: { padding: "2.5rem 1rem", textAlign: "center", opacity: "0.6" }
                    },
                    trs("聊天轨迹/提示/无参数", { cn: "本步骤没有工具调用入参", en: "No payload arguments" })
                  )
              ) : null,

              // ---- Tab 3: 执行结果 ----
              tabStr === "result" ? m("",
                {
                  style: { display: "flex", flexDirection: "column", gap: "0.6rem" }
                },
                stepObj.resultRawStr
                  ? renderCodeBoxFn(prettyJsonFn(stepObj.resultRawStr))
                  : m(Box,
                    {
                      style: { padding: "2.5rem 1rem", textAlign: "center", opacity: "0.6" }
                    },
                    trs("聊天轨迹/提示/无结果", { cn: "本步骤没有工具执行结果", en: "No execution result" })
                  )
              ) : null,

              // ---- Tab 4: 原始报文 JSON ----
              tabStr === "raw" ? m("",
                {
                  style: { display: "flex", flexDirection: "column", gap: "0.6rem" }
                },
                renderCodeBoxFn(JSON.stringify(stepObj.rawObj, null, 2))
              ) : null
            ]
          )
        ])
        }
      }
    })
  }

  // ============================================================
  // 六、实例接口注册
  // ============================================================
  const instanceInterfaceObj = {
    onDispatch: (msgObj, callbackFn) => {
      if (msgObj.action === "refresh") {
        fetchDataAFn()
      }
      if (callbackFn) {
        callbackFn({ ok: true, msg: trs("聊天轨迹/提示/已刷新", { cn: "已刷新", en: "Refreshed" }) })
      }
    }
  }

  chatTrajectoryData.addTool("commonData", commonData)
  chatTrajectoryData.registerInstances(appId, instanceInterfaceObj)
  if (commonData && commonData.registerApp) {
    commonData.registerApp(appId, chatTrajectoryData)
  }

  // ============================================================
  // 七、闭包组件视图
  // ============================================================
  return {
    async oninit() {
      await fetchDataAFn()
    },

    onremove() {
      chatTrajectoryData.unregisterInstances(appId, commonData)
    },

    view() {
      const pageColorObj = getColor("gray_3")
      const cardColorObj = getColor("gray_4")
      const stepColorObj = getColor("brown_5")
      const mainColorObj = getColor("main")
      const blueColorObj = getColor("blue_2")
      const purpleColorObj = getColor("purple_1")
      const yellowColorObj = getColor("yellow_1")
      const greenColorObj = getColor("green_1")

      // 当前会话与轮次数据
      const currentAgentObj = agentListArr.find((agentObj) => Number(agentObj.listId) === Number(activeListIdNum)) || null
      const turnArr = buildTurnArrFn(currentAgentObj, viewModeStr)
      const allStepArr = turnArr.flatMap((turnObj) => turnObj.stepArr)

      // 搜索过滤
      const queryStr = searchQueryStr.trim().toLowerCase()
      const shownTurnArr = !queryStr ? turnArr : turnArr.map((turnObj) => ({
        turnNum: turnObj.turnNum,
        stepArr: turnObj.stepArr.filter((stepObj) => [stepObj.titleStr, stepObj.summaryStr, stepObj.detailStr, stepObj.resultPreviewStr]
          .some((textVal) => typeof textVal === "string" && textVal.toLowerCase().includes(queryStr)))
      })).filter((turnObj) => turnObj.stepArr.length > 0)

      const hasCollapsedBool = collapsedTurnSet.size > 0

      return m(Box,
        {
          style: {
            display: "flex",
            flexDirection: "column",
            padding: "0.4rem 0.6rem"
          }
        },
        [
          // ---- 粘性顶栏区 (顶部左右同心大圆角贴合Box底座，底色遮挡文字穿透) ----
          m("",
            {
              style: {
                position: "sticky",
                top: "0",
                zIndex: 10,
                background: pageColorObj.back,
                margin: "-0.4rem -0.6rem 0 -0.6rem",
                padding: "0.4rem 0.6rem 0.6rem 0.6rem",
                borderTopLeftRadius: "2.8rem",
                borderTopRightRadius: "2.8rem",
                borderBottom: "0.1rem solid rgba(255, 255, 255, 0.08)"
              }
            },
            [
              // ---- 顶栏工具条 (会话标签行与操作控件行独立分行，优雅容纳多个智能体) ----
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                    padding: "0.4rem 0.6rem",
                    flexShrink: 0,
                    background: "transparent",
                    color: pageColorObj.front
                  }
                },
                [
                  // 1. 会话标签选择行 (独立成行展示，Tag使用纯正默认用法不覆盖样式)
                  m("",
                    {
                      style: {
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        width: "100%"
                      }
                    },
                    agentListArr.map((agentObj) => m(Tag,
                      {
                        key: `agent_${agentObj.listId}`,
                        isBtn: true,
                        color: (Number(agentObj.listId) === Number(activeListIdNum)) ? "main" : "gray_4",
                        onclick: () => {
                          activeListIdNum = Number(agentObj.listId)
                        }
                      },
                      `${agentObj.name || trs("聊天轨迹/会话/主智能体", { cn: "主控", en: "Main" })} #${agentObj.listId}`
                    ))
                  ),

                  // 2. 操作控件行 (模式切换 + 胶囊搜索 + 折叠 + 刷新，全部保持默认用法)
                  m("",
                    {
                      style: {
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        width: "100%"
                      }
                    },
                    [
                      // 模式切换
                      m(Tag,
                        {
                          isBtn: true,
                          color: "gray_4",
                          onclick: () => {
                            viewModeStr = (viewModeStr === "chats") ? "asks" : "chats"
                            fetchDataAFn()
                          }
                        },
                        (viewModeStr === "chats")
                          ? trs("聊天轨迹/按钮/切至队列", { cn: "任务队列", en: "Asks" })
                          : trs("聊天轨迹/按钮/切至上下文", { cn: "发送上下文", en: "Chats" })
                      ),

                      // 搜索 (Box 作为 input，尺寸与 Tag 严格物理对齐)
                      m(Box,
                        {
                          tagName: "input[type=text]",
                          color: "brown_5",
                          noValue: true,
                          ext: {
                            placeholder: trs("聊天轨迹/搜索/提示", { cn: "搜索步骤或内容...", en: "Search steps..." })
                          },
                          style: {
                            flex: "1 1 12rem",
                            minWidth: "0",
                            height: "1.8rem",
                            lineHeight: "1.8rem",
                            margin: "0.2rem 0.5rem",
                            padding: "0 0.8rem",
                            borderRadius: "1rem",
                            outline: "none",
                            border: "none",
                            fontSize: "1.3rem"
                          },
                          oninput: (dom, e) => {
                            searchQueryStr = (dom && typeof dom.value === "string") ? dom.value : (e?.target?.value || "")
                          }
                        },
                        ""
                      ),

                      // 折叠全部
                      m(Tag,
                        {
                          isBtn: true,
                          color: "gray_4",
                          onclick: () => {
                            if (hasCollapsedBool) {
                              collapsedTurnSet.clear()
                            } else {
                              turnArr.forEach((turnObj) => collapsedTurnSet.add(turnObj.turnNum))
                            }
                          }
                        },
                        hasCollapsedBool
                          ? trs("聊天轨迹/按钮/展开全部", { cn: "展开全部", en: "Expand" })
                          : trs("聊天轨迹/按钮/折叠全部", { cn: "折叠全部", en: "Collapse" })
                      ),

                      // 刷新 (Tag 保持原生默认用法，不传 styleExt，不硬塞图标打破行高)
                      m(Tag,
                        {
                          isBtn: true,
                          color: "gray_4",
                          onclick: () => {
                            if (!isFetchingBool) {
                              fetchDataAFn()
                            }
                          }
                        },
                        isFetchingBool
                          ? trs("聊天轨迹/按钮/读取中", { cn: "读取中...", en: "Loading..." })
                          : trs("聊天轨迹/按钮/刷新", { cn: "刷新", en: "Refresh" })
                      )
                    ]
                  )
                ]
              ),

          // ---- 甘特图时序泳道时间线 (通透圆角轨道，充满全宽，消除左侧怪异文字) ----
          allStepArr.length > 0 ? m("",
            {
              style: {
                height: "3.8rem",
                borderRadius: "1rem",
                margin: "0.2rem 0 0.6rem 0",
                overflow: "hidden",
                background: "rgba(0, 0, 0, 0.12)",
                border: "0.1rem solid rgba(255, 255, 255, 0.05)",
                userSelect: "none",
                flexShrink: 0,
                position: "relative"
              }
            },
            [
              // 甘特轨道 (充满全宽，无左侧怪异挤压栏)
              m("",
                {
                  style: {
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    cursor: "crosshair",
                    userSelect: "none",
                    touchAction: "none"
                  },
                  ondblclick: (e) => {
                    e.preventDefault()
                    activeSelectionRangeObj = { start: 0, end: 1 }
                    let curr = e.currentTarget.parentNode
                    while (curr && curr !== document.body) {
                      const s = window.getComputedStyle(curr).overflowY
                      if (s === "auto" || s === "scroll") {
                        curr.scrollTo({ top: 0, behavior: "smooth" })
                        break
                      }
                      curr = curr.parentNode
                    }
                    m.redraw()
                  },
                  onpointerdown: (e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    if (rect.width <= 0) return
                    isSelectingTimelineBool = true
                    selectStartFractionNum = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                    activeSelectionRangeObj = {
                      start: selectStartFractionNum,
                      end: selectStartFractionNum
                    }
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId)
                    } catch (_) {}
                    m.redraw()
                  },
                  onpointermove: (e) => {
                    if (!isSelectingTimelineBool) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    if (rect.width <= 0) return
                    const currentFraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                    activeSelectionRangeObj = {
                      start: Math.min(selectStartFractionNum, currentFraction),
                      end: Math.max(selectStartFractionNum, currentFraction)
                    }
                    m.redraw()
                  },
                  onpointerup: (e) => {
                    if (!isSelectingTimelineBool) return
                    isSelectingTimelineBool = false
                    try {
                      e.currentTarget.releasePointerCapture(e.pointerId)
                    } catch (_) {}

                    const rangeSpan = activeSelectionRangeObj.end - activeSelectionRangeObj.start
                    if (rangeSpan < 0.005) {
                      // 单击：以点击位置定位单个步骤
                      const targetIdx = Math.min(allStepArr.length - 1, Math.floor(activeSelectionRangeObj.start * allStepArr.length))
                      const targetStep = allStepArr[targetIdx]
                      if (targetStep) {
                        scrollToStepFn(targetStep)
                        const singleSpan = 1 / Math.max(1, allStepArr.length)
                        activeSelectionRangeObj = {
                          start: targetIdx / allStepArr.length,
                          end: Math.min(1, (targetIdx / allStepArr.length) + singleSpan)
                        }
                      }
                    } else {
                      // 框选范围：松手后滚动条自动平滑定位到框选范围起始的消息处
                      const startIdx = Math.min(allStepArr.length - 1, Math.floor(activeSelectionRangeObj.start * allStepArr.length))
                      const targetStep = allStepArr[startIdx]
                      if (targetStep) {
                        scrollToStepFn(targetStep)
                      }
                    }
                    m.redraw()
                  },
                  onpointercancel: (e) => {
                    isSelectingTimelineBool = false
                    try {
                      e.currentTarget.releasePointerCapture(e.pointerId)
                    } catch (_) {}
                  }
                },
                [
                  // 1. 各步骤甘特长条
                  allStepArr.map((sObj, idxNum) => {
                    const totalNum = allStepArr.length
                    const leftPct = (idxNum / totalNum) * 100
                    const widthPct = Math.max(0.7, (1 / totalNum) * 100)

                    let topRem = "1.5rem"
                    let barColorStr = purpleColorObj.back
                    if (sObj.roleStr === "user") {
                      topRem = "0.45rem"
                      barColorStr = blueColorObj.back
                    } else if (sObj.kindStr === "toolCall" || sObj.kindStr === "toolResult" || sObj.roleStr === "tool") {
                      topRem = "2.55rem"
                      barColorStr = yellowColorObj.back
                    } else if (sObj.kindStr === "thought") {
                      topRem = "1.5rem"
                      barColorStr = purpleColorObj.back
                    }

                    return m("",
                      {
                        key: `gantt_${sObj.idStr}`,
                        title: `[${sObj.badgeStr}] ${sObj.titleStr || sObj.summaryStr.slice(0, 60)}`,
                        style: {
                          position: "absolute",
                          top: topRem,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          height: "0.65rem",
                          minWidth: "2px",
                          borderRadius: "2px",
                          background: barColorStr,
                          opacity: "0.9",
                          pointerEvents: "none"
                        }
                      }
                    )
                  }),

                  // 2. 选区高亮视窗框 (对标 Chrome DevTools Performance 范围遮罩与刻度指示)
                  m("",
                    {
                      style: {
                        position: "absolute",
                        top: "0",
                        bottom: "0",
                        left: `${(activeSelectionRangeObj.start * 100).toFixed(1)}%`,
                        width: `${Math.max(0.4, (activeSelectionRangeObj.end - activeSelectionRangeObj.start) * 100).toFixed(1)}%`,
                        background: `${blueColorObj.back}33`,
                        borderLeft: `2px solid ${blueColorObj.back}`,
                        borderRight: `2px solid ${blueColorObj.back}`,
                        pointerEvents: "none",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "center",
                        overflow: "hidden"
                      }
                    },
                    (activeSelectionRangeObj.end - activeSelectionRangeObj.start) > 0.08 ? m("span",
                      {
                        style: {
                          fontSize: "1rem",
                          lineHeight: "1.2",
                          color: blueColorObj.back,
                          background: "rgba(0, 0, 0, 0.65)",
                          padding: "0.1rem 0.35rem",
                          borderRadius: "0.2rem",
                          marginTop: "0.2rem",
                          whiteSpace: "nowrap"
                        }
                      },
                      `${Math.round(activeSelectionRangeObj.start * allStepArr.length) + 1} - ${Math.min(allStepArr.length, Math.round(activeSelectionRangeObj.end * allStepArr.length))} / ${allStepArr.length}`
                    ) : null
                  )
                ]
              )
            ]
          ) : null
        ]
      ),

          // ---- 轨迹列表 (随内容自然撑开，去除多余内边距避免左右奇怪大缝隙) ----
          m("",
            {
              style: {
                padding: "0.4rem 0 2rem 0"
              }
            },
            [
              // 空态
              shownTurnArr.length === 0 ? m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "6rem 2rem",
                    color: pageColorObj.front
                  }
                },
                [
                  m.trust(iconPark.getIcon("History", { fill: pageColorObj.front, size: "4rem" })),
                  m("",
                    {
                      style: {
                        textAlign: "center"
                      }
                    },
                    errorStr
                      ? trs("聊天轨迹/提示/读取失败", { cn: `读取失败：${errorStr}`, en: `Failed: ${errorStr}` })
                      : (isFetchingBool
                        ? trs("聊天轨迹/提示/读取中", { cn: "正在读取轨迹…", en: "Loading…" })
                        : trs("聊天轨迹/提示/空轨迹", { cn: "当前没有可展示的轨迹内容", en: "No trajectory data" }))
                  )
                ]
              ) : null,

              // 轮次列表容器
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem"
                  }
                },
                shownTurnArr.map((turnObj) => {
                const isCollapsedBool = !queryStr && collapsedTurnSet.has(turnObj.turnNum)
                return m("",
                  {
                    key: `turn_${turnObj.turnNum}`,
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      marginBottom: "1rem"
                    }
                  },
                  [
                    // 轮次头
                    m(Tag,
                      {
                        isBtn: true,
                        color: "gray_4",
                        styleExt: {
                          margin: "0",
                          fontSize: "1.2rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem"
                        },
                        onclick: () => {
                          if (isCollapsedBool) {
                            collapsedTurnSet.delete(turnObj.turnNum)
                          } else {
                            collapsedTurnSet.add(turnObj.turnNum)
                          }
                        }
                      },
                      [
                        m.trust(iconPark.getIcon(isCollapsedBool ? "ExpandRight" : "ExpandDown", { fill: cardColorObj.front, size: "1.2rem" })),
                        m("span", trs("聊天轨迹/标签/轮次", { cn: `第 ${turnObj.turnNum} 轮`, en: `Turn ${turnObj.turnNum}` })),
                        m("span",
                          {
                            style: {
                              opacity: "0.7"
                            }
                          },
                          trs("聊天轨迹/标签/步骤数", { cn: `${turnObj.stepArr.length} 步`, en: `${turnObj.stepArr.length} steps` }))
                      ]
                    ),

                    // 步骤卡片
                    !isCollapsedBool ? m("",
                      {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.6rem",
                          marginLeft: "0.6rem"
                        }
                      },
                      turnObj.stepArr.map((stepObj) => {
                        const isToolCallBool = (stepObj.kindStr === "toolCall")
                        const borderColorStr = getColor(stepObj.badgeColorStr).back

                        return m("",
                        {
                          id: stepObj.idStr,
                          key: stepObj.idStr,
                          style: {
                            display: "flex",
                            flexDirection: "column"
                          }
                        },
                        m(Box,
                        {
                          key: `box_${stepObj.idStr}`,
                          color: "brown_5",
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.4rem",
                            margin: "0",
                            padding: "0.8rem 1.2rem",
                            borderRadius: "0.5rem 1.8rem 1.8rem 0.5rem",
                            border: `0.1rem solid ${borderColorStr}25`,
                            borderLeft: `0.38rem solid ${borderColorStr}`,
                            background: isToolCallBool
                              ? `radial-gradient(ellipse 35% 8rem at 0% 0%, ${greenColorObj.back}18 0%, transparent 100%), ${stepColorObj.back}`
                              : `radial-gradient(ellipse 30% 6rem at 0% 0%, ${borderColorStr}15 0%, transparent 100%), ${stepColorObj.back}`,
                            cursor: "pointer",
                            boxShadow: "0 0 1rem rgba(0, 0, 0, 0.06)",
                            transition: "all 0.15s ease"
                          },
                          onclick: () => {
                            openDetailNoticeFn(stepObj)
                          }
                        },
                        [
                          // 卡片头：角色标签 + 工具名称/标题 + 步骤序号
                          m("",
                            {
                              style: {
                                display: "flex",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "0.6rem"
                              }
                            },
                            [
                              m(Tag,
                                {
                                  color: stepObj.badgeColorStr,
                                  styleExt: {
                                    margin: "0",
                                    fontSize: "1.15rem"
                                  }
                                },
                                stepObj.badgeStr
                              ),
                              stepObj.titleStr ? m("span",
                                {
                                  style: {
                                    fontFamily: isToolCallBool ? "Consolas, Monaco, monospace" : "inherit",
                                    fontSize: "1.35rem",
                                    color: stepColorObj.front
                                  }
                                },
                                [
                                  isToolCallBool ? m.trust(iconPark.getIcon("Code", { fill: getColor("green_1").back, size: "1.2rem" })) : null,
                                  m("span", { style: { marginLeft: isToolCallBool ? "0.3rem" : "0" } }, stepObj.titleStr)
                                ]
                              ) : null,
                              m("span",
                                {
                                  style: {
                                    marginLeft: "auto",
                                    fontSize: "1.1rem",
                                    opacity: "0.5",
                                    color: stepColorObj.front
                                  }
                                },
                                `#${stepObj.stepNum}`)
                            ]
                          ),

                          // 卡片主体：参数预览 / 正文摘要
                          m("",
                            {
                              style: {
                                color: stepColorObj.front,
                                fontSize: "1.35rem",
                                lineHeight: "1.5",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                                opacity: "0.95"
                              }
                            },
                            stepObj.summaryStr || (isToolCallBool
                              ? trs("聊天轨迹/提示/无参数", { cn: "（无参数）", en: "(no args)" })
                              : trs("聊天轨迹/提示/无内容", { cn: "（无文本内容）", en: "(empty)" }))
                          ),

                          // 卡片尾部：工具执行结果
                          stepObj.resultPreviewStr ? m("",
                            {
                              style: {
                                color: stepColorObj.front,
                                fontSize: "1.25rem",
                                opacity: "0.85",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                                padding: "0.3rem 0.6rem",
                                borderRadius: "0.4rem",
                                background: "rgba(0, 0, 0, 0.12)",
                                borderLeft: `0.25rem solid ${borderColorStr}`
                              }
                            },
                            stepObj.resultPreviewStr
                          ) : null
                        ]
                      )
                    )
                  })
                    ) : null
                  ]
                )
              })
              )
            ]
          )
        ]
      )
    }
  }
}
