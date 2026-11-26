/* CrashReportDialog.js - 崩溃报告弹窗组件（供 sys:pushMessage action.type="notice" 通过 contentPath 动态加载） */

import m from "/@npm/mithril.js"
import Box from "./box.js"
import Tag from "./tag.js"
import Notice from "./notice.js"
import Tip from "./tip.js"
import getColor from "./getColor.js"
import getSize from "./getSize.js"
import { trs } from "./i18n.js"
import settingData from "../setting/settingData.js"

const DEFAULT_FEEDBACK_URL = "https://www.o-o.space/?enter=1#!/feedback"

const formatReportTime = (tsNum) => {
  if (!tsNum) return ""
  const d = new Date(tsNum)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default () => {
  let busyBool = false
  let selectedIdxNum = 0

  return {
    oninit(vnode) {
      const noticeConfig = vnode.attrs.noticeConfig
      if (noticeConfig) {
        noticeConfig.hideBtn = 2
        noticeConfig.useMinus = false
      }
    },

    view(vnode) {
      const {
        reports = [],
        logPath = "",
        logTail = "",
        feedbackUrl = DEFAULT_FEEDBACK_URL,
        noticeConfig
      } = vnode.attrs

      const reportListArr = Array.isArray(reports) && reports.length > 0
        ? reports
        : (logPath ? [{ logPath, logTail, port: "", time: 0 }] : [])

      const safeIdxNum = selectedIdxNum < reportListArr.length ? selectedIdxNum : 0
      const activeReportObj = reportListArr[safeIdxNum] || { logPath: "", logTail: "", port: "", time: 0 }

      const closeSelf = () => {
        if (noticeConfig && noticeConfig.sign) {
          Notice.closeTab(noticeConfig.sign)
        }
      }

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: `${getSize(4)}rem`,
            padding: `${getSize(4)}rem`,
            maxWidth: `${getSize(130)}rem`,
            background: getColor("gray_1").back,
            color: getColor("gray_1").front
          }
        },
        [
          /* 顶部警示说明 */
          m("",
            {
              style: {
                display: "flex",
                alignItems: "flex-start",
                gap: `${getSize(3)}rem`
              }
            },
            [
              window.iconPark && typeof window.iconPark.getIcon === "function"
                ? m("",
                    {
                      style: {
                        flex: "none",
                        paddingTop: `${getSize(0.5)}rem`
                      }
                    },
                    m.trust(window.iconPark.getIcon("Attention", {
                      size: `${getSize(6)}rem`,
                      fill: getColor("pink_1").back
                    }))
                  )
                : null,
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: `${getSize(1)}rem`,
                    minWidth: "0",
                    flex: "1"
                  }
                },
                [
                  m("",
                    {
                      style: {
                        fontSize: `${getSize(5)}rem`,
                        lineHeight: `${getSize(6)}rem`
                      }
                    },
                    reportListArr.length > 1
                      ? trs("系统/崩溃/多实例弹窗标题", {
                          cn: `检测到上次有 ${reportListArr.length} 个实例异常退出`,
                          en: `${reportListArr.length} Previous Instances Exited Abnormally`
                        })
                      : trs("系统/崩溃/弹窗标题", { cn: "检测到上次运行异常退出", en: "Previous Run Exited Abnormally" })
                  ),
                  m("",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        opacity: 0.7
                      }
                    },
                    trs("系统/崩溃/弹窗说明", {
                      cn: "已自动记录崩溃前的错误日志（已脱敏）。你可以先用编辑器核对内容，或一键复制日志尾部并前往反馈页面提交。",
                      en: "Sanitized crash logs were saved automatically. Inspect them in the editor or copy the tail and open the feedback page."
                    })
                  )
                ]
              )
            ]
          ),

          /* 多实例崩溃切换栏（仅在认领到 2 份及以上崩溃报告时显示） */
          reportListArr.length > 1
            ? m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: `${getSize(1)}rem`,
                    flexWrap: "wrap"
                  }
                },
                reportListArr.map((item, idx) => {
                  const isActiveBool = idx === safeIdxNum
                  const portTextStr = item.port === "startup"
                    ? trs("系统/崩溃/启动阶段", { cn: "启动阶段", en: "Startup" })
                    : `${trs("系统/崩溃/端口", { cn: "端口", en: "Port" })} ${item.port}`
                  const timeTextStr = formatReportTime(item.time)
                  return m(Tag,
                    {
                      key: item.logPath || idx,
                      isBtn: true,
                      color: isActiveBool ? "main" : "gray_4",
                      styleExt: {
                        margin: "0",
                        cursor: "pointer"
                      },
                      onclick: () => {
                        selectedIdxNum = idx
                        m.redraw()
                      }
                    },
                    timeTextStr ? `${portTextStr} · ${timeTextStr}` : portTextStr
                  )
                })
              )
            : null,

          /* 当前选中的日志路径卡片 */
          activeReportObj.logPath
            ? m(Box,
                {
                  color: "gray_4",
                  style: {
                    margin: "0",
                    padding: `${getSize(2)}rem ${getSize(3)}rem`,
                    borderRadius: `${getSize(8)}rem`,
                    display: "flex",
                    flexDirection: "column",
                    gap: `${getSize(1)}rem`
                  }
                },
                [
                  m("",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        opacity: 0.6
                      }
                    },
                    trs("系统/崩溃/日志路径标签", { cn: "日志文件位置", en: "Crash Log Path" })
                  ),
                  m("",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        wordBreak: "break-all"
                      }
                    },
                    activeReportObj.logPath
                  )
                ]
              )
            : null,

          /* 底部操作按钮行 */
          m("",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: `${getSize(2)}rem`,
                flexWrap: "wrap",
                paddingTop: `${getSize(2)}rem`,
                borderTop: `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`
              }
            },
            [
              m(Box,
                {
                  isBtn: true,
                  color: "gray_4",
                  style: {
                    margin: "0",
                    padding: `${getSize(1.5)}rem ${getSize(3)}rem`,
                    borderRadius: `${getSize(8)}rem`,
                    fontSize: `${getSize(3)}rem`,
                    lineHeight: `${getSize(4)}rem`
                  },
                  onclick: () => closeSelf()
                },
                trs("系统/崩溃/忽略", { cn: "忽略", en: "Dismiss" })
              ),

              activeReportObj.logPath
                ? m(Box,
                    {
                      isBtn: true,
                      color: "gray_2",
                      style: {
                        margin: "0",
                        padding: `${getSize(1.5)}rem ${getSize(3)}rem`,
                        borderRadius: `${getSize(8)}rem`,
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        opacity: busyBool ? 0.6 : 1
                      },
                      onclick: async () => {
                        if (busyBool) return
                        busyBool = true
                        m.redraw()
                        try {
                          const res = await settingData.fnCall("appLaunch", [
                            "editor",
                            {
                              data: {
                                filePath: activeReportObj.logPath,
                                readOnly: true,
                                group: ""
                              }
                            }
                          ])
                          if (res && res.ok === false) {
                            Notice.launch({ msg: res.msg || trs("系统/崩溃/打开日志失败", { cn: "打开日志失败", en: "Failed to open log" }) })
                            return
                          }
                          closeSelf()
                        } catch (err) {
                          console.error("[CrashReportDialog] 打开日志失败:", err)
                          Notice.launch({ msg: trs("系统/错误/提示") + err.message })
                        } finally {
                          busyBool = false
                          m.redraw()
                        }
                      }
                    },
                    trs("系统/崩溃/打开日志", { cn: "用编辑器打开日志", en: "Open Log in Editor" })
                  )
                : null,

              m(Box,
                {
                  isBtn: true,
                  color: "main",
                  style: {
                    margin: "0",
                    padding: `${getSize(1.5)}rem ${getSize(3)}rem`,
                    borderRadius: `${getSize(8)}rem`,
                    fontSize: `${getSize(3)}rem`,
                    lineHeight: `${getSize(4)}rem`,
                    opacity: busyBool ? 0.6 : 1
                  },
                  onclick: async () => {
                    if (busyBool) return
                    busyBool = true
                    m.redraw()
                    try {
                      const textToCopy = activeReportObj.logTail || activeReportObj.logPath
                      if (textToCopy && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                        await navigator.clipboard.writeText(textToCopy)
                        Tip.launch(
                          trs("系统/崩溃/已复制日志", {
                            cn: activeReportObj.logTail ? "已复制最近 200 行脱敏日志，可直接粘贴反馈" : "已复制日志路径到剪贴板",
                            en: activeReportObj.logTail ? "Copied last 200 sanitized log lines to clipboard" : "Copied log path to clipboard"
                          }),
                          2000
                        )
                      }
                      await settingData.fnCall("appLaunch", [
                        "browser",
                        {
                          data: {
                            url: feedbackUrl
                          }
                        }
                      ])
                      closeSelf()
                    } catch (err) {
                      console.error("[CrashReportDialog] 跳转反馈页失败:", err)
                      Notice.launch({ msg: trs("系统/错误/提示") + err.message })
                    } finally {
                      busyBool = false
                      m.redraw()
                    }
                  }
                },
                trs("系统/崩溃/前往反馈", { cn: "复制日志并前往反馈", en: "Copy Log & Feedback" })
              )
            ]
          )
        ]
      )
    }
  }
}
