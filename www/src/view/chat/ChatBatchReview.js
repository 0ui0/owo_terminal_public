import m from "mithril"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import Notice from "../common/notice.js"
import comData from "../../comData/comData.js"
import getColor from "../common/getColor.js"
import settingData from "../setting/settingData.js"
import DiffFoldView from "../common/DiffFoldView.js"

export default () => {
  let localGlobalComment = ""
  const expandedDiffs = {}

  // 批注查看与删除组件（「查看批注」弹窗主体）
  // 批注查看与删除组件（「查看批注」弹窗主体）
  // 严格遵循《样式设计指南.md》：少即是多，一切皆是Box，统一 3rem 经典圆角与自然内容流
  const NoteViewerComponent = {
    view(vnode) {
      const { file, chatList, confirmCmd } = vnode.attrs

      return m(Box,
        {
          style: {
            background: "none",
            margin: "0",
            padding: "0"
          }
        },
        [
          // 顶部文件信息卡片（第一行文件名，第二行完整路径折行）
          m(Box,
            {
              isBlock: true,
              color: "gray_2",
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem"
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
                  m(Tag,
                    {
                      color: file.type === "add" ? "green_1" : (file.type === "delete" ? "pink_1" : "blue_1")
                    },
                    file.type === "add" ? "新增" : (file.type === "delete" ? "删除" : "修改")
                  ),
                  m("span",
                    (file.relativePath || file.path).split("/").pop()
                  )
                ]
              ),
              m("",
                {
                  style: {
                    fontSize: "1.2rem",
                    opacity: 0.6,
                    wordBreak: "break-all"
                  }
                },
                file.relativePath || file.path
              )
            ]
          ),

          // 行批注卡片
          file.notes
            ? m(Box,
              {
                isBlock: true,
                color: "blue_1"
              },
              [
                m(Tag,
                  {
                    color: "blue_1"
                  },
                  "行批注"
                ),
                m("",
                  {
                    style: {
                      marginTop: "0.5rem",
                      whiteSpace: "pre-wrap"
                    }
                  },
                  file.notes
                )
              ]
            )
            : null,

          // 文件备注卡片
          file.comment
            ? m(Box,
              {
                isBlock: true,
                color: "yellow_1"
              },
              [
                m(Tag,
                  {
                    color: "yellow_1"
                  },
                  "文件备注"
                ),
                m("",
                  {
                    style: {
                      marginTop: "0.5rem",
                      whiteSpace: "pre-wrap"
                    }
                  },
                  file.comment
                )
              ]
            )
            : null,

          // 空状态
          (!file.notes && !file.comment)
            ? m(Box,
              {
                color: "gray_2"
              },
              "暂无批注内容"
            )
            : null,

          // 底部删除按钮
          m("",
            {
              style: {
                display: "flex",
                justifyContent: "flex-end"
              }
            },
            [
              m(Box,
                {
                  isBtn: true,
                  color: "pink_1",
                  onclick: async () => {
                    try {
                      await comData.data.edit(data => {
                        const list = data.chatLists?.find(l => l.id === chatList.id)
                        const cmd = list?.confirmCmds?.find(c => c.id === confirmCmd.id)
                        const target = cmd?.ext?.files?.find(f => f.fileId === file.fileId)
                        if (target) {
                          target.notes = null
                          target.comment = null
                        }
                      })
                      vnode.attrs.delete()
                    } catch (err) {
                      console.error("删除批注失败:", err)
                    }
                  }
                },
                "删除批注"
              )
            ]
          )
        ]
      )
    }
  }

  // 简易统一 Diff 生成器
  function renderSimpleDiff(originalContent = "", proposedContent = "") {
    const origLines = (originalContent || "").split(/\r?\n/)
    const propLines = (proposedContent || "").split(/\r?\n/)
    const diffRows = []

    for (let i = 0; i < propLines.length; i++) {
      const pLine = propLines[i]
      if (i >= origLines.length) {
        diffRows.push({
          type: "add",
          text: pLine
        })
      } else if (pLine !== origLines[i]) {
        diffRows.push({
          type: "del",
          text: origLines[i]
        })
        diffRows.push({
          type: "add",
          text: pLine
        })
      } else {
        diffRows.push({
          type: "same",
          text: pLine
        })
      }
    }

    return m(Box,
      {
        style: {
          display: "block",
          margin: "0.5rem 0",
          padding: "1rem",
          borderRadius: "1rem",
          background: getColor("确认框输入背景"),
          maxHeight: "15rem",
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: "1.2rem",
          border: `1px solid ${getColor("确认框输入边框")}`
        }
      },
      diffRows.map(row => {
        let tagColor = "none"
        let prefix = " "
        if (row.type === "add") {
          tagColor = "green_1"
          prefix = "+"
        } else if (row.type === "del") {
          tagColor = "pink_1"
          prefix = "-"
        }

        // 彻底修复 Diff 行配色违规：
        // 如果是相同行，用容器的文字色和纯透明底。
        // 如果有变化，直接复用整个 Tag，让框架的 getColor 处理成对逻辑！
        if (tagColor === "none") {
          return m("",
            {
              style: {
                padding: "0.2rem 0.4rem",
                color: getColor("确认框文字"),
                borderRadius: "0.5rem",
                margin: "0.1rem 0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all"
              }
            },
            `${prefix} ${row.text}`
          )
        } else {
          return m(Tag,
            {
              color: tagColor,
              styleExt: {
                display: "block",
                padding: "0.2rem 0.4rem",
                borderRadius: "0.5rem",
                margin: "0.1rem 0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontSize: "1.2rem" // 确保它作为文本行的字号不膨胀
              }
            },
            `${prefix} ${row.text}`
          )
        }
      })
    )
  }

  return {
    oninit(vnode) {
      localGlobalComment = vnode.attrs.confirmCmd?.comment || ""
    },
    view({ attrs }) {
      const confirmCmd = attrs.confirmCmd
      const chatList = attrs.chatList
      const files = confirmCmd?.ext?.files || []

      const approvedCount = files.filter(f => f.status === "approved").length
      const rejectedCount = files.filter(f => f.status === "rejected").length
      const pendingCount = files.filter(f => !f.status || f.status === "pending").length
      const allDecided = files.length > 0 && pendingCount === 0

      const setAllStatus = async (status) => {
        try {
          await comData.data.edit(data => {
            const list = data.chatLists?.find(l => l.id === chatList.id)
            const cmd = list?.confirmCmds?.find(c => c.id === confirmCmd.id)
            if (cmd?.ext?.files) {
              cmd.ext.files.forEach(f => f.status = status)
            }
          })
        } catch (err) {
          console.error("setAllStatus failed:", err)
        }
      }

      const setFileStatus = async (fileId, status) => {
        try {
          await comData.data.edit(data => {
            const list = data.chatLists?.find(l => l.id === chatList.id)
            const cmd = list?.confirmCmds?.find(c => c.id === confirmCmd.id)
            const target = cmd?.ext?.files?.find(f => f.fileId === fileId)
            if (target) {
              target.status = status
            }
          })
        } catch (err) {
          console.error("setFileStatus failed:", err)
        }
      }

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            borderRadius: "0.5rem 2rem 2rem 0.5rem",
            margin: "1rem",
            padding: "1rem",
            boxShadow: `0.1rem 0.1rem 1rem ${getColor("确认框背景") === "#ffffffee" ? "#ccc" : "#333"}`,
            background: getColor("确认框背景"),
            color: getColor("确认框文字"),
            maxWidth: "60rem",
            zIndex: 100,
            position: "relative",
            borderLeft: `0.4rem solid ${getColor("确认框标题边框")}`
          }
        },
        [
          // 顶部标题与状态统计
          m("span",
            {
              style: {
                marginBottom: "0.5rem",
                color: getColor("确认框标题"),
                fontSize: "1.8rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem"
              }
            },
            [
              m("span", confirmCmd.title || `核对代码变更 (${files.length} 个文件)`),
              m("",
                {
                  style: {
                    display: "flex",
                    alignItems: "center"
                  }
                },
                [
                  m(Tag,
                    {
                      color: "green_1",
                      styleExt: {
                        margin: "0.2rem 0.3rem"
                      }
                    },
                    `${approvedCount} 批准`
                  ),
                  m(Tag,
                    {
                      color: "pink_1",
                      styleExt: {
                        margin: "0.2rem 0.3rem"
                      }
                    },
                    `${rejectedCount} 拒绝`
                  ),
                  pendingCount > 0
                    ? m(Tag,
                      {
                        color: "yellow_1",
                        styleExt: {
                          margin: "0.2rem 0.3rem"
                        }
                      },
                      `${pendingCount} 待定`
                    )
                    : null
                ]
              )
            ]
          ),

          // 内容主卡片 (深色内嵌 Box)
          m(Box,
            {
              style: {
                margin: "0.5rem 0 1rem",
                padding: "1rem",
                borderRadius: "1rem",
                background: getColor("确认框内容背景"),
                overflowWrap: "break-word",
                wordBreak: "break-all",
                whiteSpace: "pre-wrap",
                display: "flex",
                flexDirection: "column"
              }
            },
            [
              // 修改原因与意图
              confirmCmd.content
                ? m("",
                  {
                    style: {
                      fontSize: "1.5rem",
                      marginBottom: "1rem"
                    }
                  },
                  confirmCmd.content
                )
                : null,

              // 待审批列表头部与全选全拒
              m("",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.8rem"
                  }
                },
                [
                  m("span",
                    {
                      style: {
                        fontSize: "1.5rem"
                      }
                    },
                    `待审批文件列表 (${files.length}):`
                  ),
                  m("",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center"
                      }
                    },
                    [
                      m(Tag,
                        {
                          isBtn: true,
                          color: "main",
                          styleExt: {
                            cursor: "pointer",
                            margin: "0.2rem 0.3rem"
                          },
                          onclick: async () => {
                            for (let i = files.length - 1; i >= 0; i--) {
                              const file = files[i]
                              try {
                                await settingData.fnCall("appLaunch", ["editor", {
                                  data: {
                                    confirmId: confirmCmd.id,
                                    fileId: file.fileId,
                                    filePath: file.path,
                                    originalContent: file.originalContent,
                                    proposedContent: file.proposedContent,
                                    isDiff: true,
                                    reason: confirmCmd.ext?.reason
                                  }
                                }])
                              } catch (launchErr) {
                                console.error("依次打开编辑器审阅失败:", launchErr)
                              }
                            }
                          }
                        },
                        "依次审阅"
                      ),
                      m(Tag,
                        {
                          isBtn: true,
                          color: "green_1",
                          styleExt: {
                            cursor: "pointer",
                            margin: "0.2rem 0.3rem"
                          },
                          onclick: () => setAllStatus("approved")
                        },
                        "全部批准"
                      ),
                      m(Tag,
                        {
                          isBtn: true,
                          color: "pink_1",
                          styleExt: {
                            cursor: "pointer",
                            margin: "0.2rem 0.3rem"
                          },
                          onclick: () => setAllStatus("rejected")
                        },
                        "全部拒绝"
                      )
                    ]
                  )
                ]
              ),

              // 文件条目清单
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.8rem",
                    maxHeight: "30rem",
                    overflowY: "auto"
                  }
                },
                files.map((file, idx) => {
                  const isApproved = file.status === "approved"
                  const isRejected = file.status === "rejected"
                  const hasDiffExpanded = !!expandedDiffs[file.fileId]
                  const hasNotesOrComment = !!(file.notes || file.comment)

                  return m(Box,
                    {
                      key: file.fileId || idx,
                      isBlock: true,
                      color: "gray_1",
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        padding: "0.8rem 1rem",
                        borderRadius: "2rem",
                        margin: "0"
                      }
                    },
                    [
                      // 第一行：类型Tag + 文件名 + 行数增减 + 批注入口 + 右侧操作按钮组
                      m("",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "0.5rem"
                          }
                        },
                        [
                          // 左侧：类型Tag + 文件名 + 行数 + 批注入口
                          m("",
                            {
                              style: {
                                display: "flex",
                                alignItems: "center",
                                flexWrap: "wrap"
                              }
                            },
                            [
                              m(Tag,
                                {
                                  color: file.type === "add" ? "green_1" : (file.type === "delete" ? "pink_1" : "blue_1"),
                                  styleExt: {
                                    margin: "0.2rem 0.3rem"
                                  }
                                },
                                file.type === "add" ? "新增" : (file.type === "delete" ? "删除" : "修改")
                              ),
                              m("span",
                                {
                                  title: file.path,
                                  style: {
                                    fontSize: "1.5rem",
                                    margin: "0 0.3rem",
                                    fontWeight: "bold",
                                    color: getColor("gray_1").front
                                  }
                                },
                                file.path ? file.path.split(/[/\\]/).pop() : (file.relativePath || "未命名文件")
                              ),
                              file.addLines > 0
                                ? m(Tag,
                                  {
                                    color: "green_1",
                                    styleExt: {
                                      margin: "0.2rem 0.3rem"
                                    }
                                  },
                                  `+${file.addLines}`
                                )
                                : null,
                              file.delLines > 0
                                ? m(Tag,
                                  {
                                    color: "pink_1",
                                    styleExt: {
                                      margin: "0.2rem 0.3rem"
                                    }
                                  },
                                  `-${file.delLines}`
                                )
                                : null,

                              // 查看批注按钮
                              hasNotesOrComment
                                ? m(Tag,
                                  {
                                    isBtn: true,
                                    color: "yellow_1",
                                    styleExt: {
                                      cursor: "pointer",
                                      margin: "0.2rem 0.3rem"
                                    },
                                    onclick: () => {
                                      Notice.launch({
                                        tip: "审阅批注",
                                        content: NoteViewerComponent,
                                        contentAttrs: {
                                          file,
                                          chatList,
                                          confirmCmd
                                        }
                                      })
                                    }
                                  },
                                  "查看批注"
                                )
                                : null
                            ]
                          ),

                          // 右侧操作按钮组
                          m("",
                            {
                              style: {
                                display: "flex",
                                alignItems: "center"
                              }
                            },
                            [
                              // 编辑器审阅按钮（Diff 审批模式）
                              m(Tag,
                                {
                                  isBtn: true,
                                  color: "main",
                                  styleExt: {
                                    cursor: "pointer",
                                    margin: "0.2rem 0.3rem"
                                  },
                                  onclick: async () => {
                                    try {
                                      await settingData.fnCall("appLaunch", ["editor", {
                                        data: {
                                          confirmId: confirmCmd.id,
                                          fileId: file.fileId,
                                          filePath: file.path,
                                          originalContent: file.originalContent,
                                          proposedContent: file.proposedContent,
                                          isDiff: true,
                                          reason: confirmCmd.ext?.reason
                                        }
                                      }])
                                    } catch (launchErr) {
                                      console.error("打开编辑器审阅失败:", launchErr)
                                    }
                                  }
                                },
                                "编辑器审阅"
                              ),

                              // 源文件按钮（直接打开当前磁盘文件）
                              m(Tag,
                                {
                                  isBtn: true,
                                  color: "gray_2",
                                  styleExt: {
                                    cursor: "pointer",
                                    margin: "0.2rem 0.3rem"
                                  },
                                  onclick: async () => {
                                    try {
                                      await settingData.fnCall("appLaunch", ["editor", {
                                        data: {
                                          filePath: file.path
                                        }
                                      }])
                                    } catch (launchErr) {
                                      console.error("打开源文件失败:", launchErr)
                                    }
                                  }
                                },
                                "源文件"
                              ),

                              // 查看 Diff 按钮
                              m(Tag,
                                {
                                  isBtn: true,
                                  color: hasDiffExpanded ? "gray_2" : "gray_4",
                                  styleExt: {
                                    cursor: "pointer",
                                    margin: "0.2rem 0.3rem"
                                  },
                                  onclick: () => {
                                    expandedDiffs[file.fileId] = !expandedDiffs[file.fileId]
                                  }
                                },
                                hasDiffExpanded ? "收起 Diff" : "查看 Diff"
                              ),

                              // 胶囊开关
                              m("",
                                {
                                  style: {
                                    display: "inline-flex",
                                    borderRadius: "3rem",
                                    background: getColor("确认框输入背景"),
                                    padding: "2px",
                                    margin: "0.2rem 0.3rem"
                                  }
                                },
                                [
                                  m(Tag,
                                    {
                                      isBtn: true,
                                      // 修复：未选中时使用灰调 gray_2 而不是 "none" 以保持成色完整，且借助透明度区分
                                      color: isApproved ? "green_1" : "gray_2",
                                      styleExt: {
                                        margin: "0",
                                        borderRadius: "3rem 0 0 3rem",
                                        cursor: "pointer",
                                        opacity: isApproved ? 1 : 0.6
                                      },
                                      onclick: () => setFileStatus(file.fileId, "approved")
                                    },
                                    "批准"
                                  ),
                                  m(Tag,
                                    {
                                      isBtn: true,
                                      // 修复：未选中时使用灰调 gray_2 而不是 "none"
                                      color: isRejected ? "pink_1" : "gray_2",
                                      styleExt: {
                                        margin: "0",
                                        borderRadius: "0 3rem 3rem 0",
                                        cursor: "pointer",
                                        opacity: isRejected ? 1 : 0.6
                                      },
                                      onclick: () => setFileStatus(file.fileId, "rejected")
                                    },
                                    "拒绝"
                                  )
                                ]
                              )
                            ]
                          )
                        ]
                      ),

                      // 第二行：小字显示完整路径，支持自动折行
                      m("div",
                        {
                          title: file.path,
                          style: {
                            fontSize: "1.2rem",
                            opacity: 0.6,
                            margin: "0.3rem 0.3rem 0",
                            wordBreak: "break-all",
                            overflowWrap: "break-word",
                            lineHeight: "1.6rem",
                            color: getColor("gray_1").front
                          }
                        },
                        file.relativePath || file.path
                      ),

                      // 展开的内嵌 Diff
                      hasDiffExpanded
                        ? m(DiffFoldView, { originalContent: file.originalContent, proposedContent: file.proposedContent, fileId: file.fileId })
                        : null
                    ]
                  )
                })
              ),

              // 全局备注输入框
              m("textarea",
                {
                  placeholder: "输入备注（可选，例如拒绝原因）...",
                  value: localGlobalComment,
                  oninput: (e) => localGlobalComment = e.target.value,
                  style: {
                    width: "auto",
                    padding: "0.8rem",
                    margin: "1rem 0.5rem 0.5rem",
                    background: getColor("确认框输入背景"),
                    border: `1px solid ${getColor("确认框输入边框")}`,
                    borderRadius: "0.8rem",
                    color: getColor("确认框输入文字"),
                    outline: "none",
                    minHeight: "6rem",
                    resize: "vertical",
                    fontSize: "1.5rem"
                  }
                }
              )
            ]
          ),

          // 底部动作按钮栏 (右对齐)
          m("",
            {
              style: {
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "0.5rem"
              }
            },
            [
              !allDecided
                ? m("",
                  {
                    style: {
                      marginRight: "auto",
                      display: "flex",
                      alignItems: "center"
                    }
                  },
                  [
                    // 修复：彻底使用 Tag 来确保带有完整色系的 back 和 front，并在视觉上变成一个醒目的微章
                    m(Tag,
                      {
                        color: "yellow_1",
                        styleExt: {
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem"
                        }
                      },
                      [
                        window.iconPark
                          ? m.trust(window.iconPark.getIcon("Attention", { size: "1.5rem", fill: getColor("yellow_1").front }))
                          : null,
                        m("span", `尚有 ${pendingCount} 个文件未明确批准或拒绝`)
                      ]
                    )
                  ]
                )
                : null,

              // 执行按钮
              m(Box,
                {
                  isBtn: true,
                  style: {
                    marginRight: "0",
                    background: allDecided ? getColor("确认框按钮执行背景") : getColor("gray_2").back,
                    color: allDecided ? getColor("确认框按钮执行文字") : getColor("gray_2").front,
                    cursor: allDecided ? "pointer" : "not-allowed"
                  },
                  async onclick() {
                    if (!allDecided) return
                    try {
                      await comData.data.edit(data => {
                        const list = data.chatLists?.find(l => l.id === chatList.id)
                        if (list?.confirmCmds) {
                          const _confirmCmd = list.confirmCmds.find(c => c.id === confirmCmd.id)
                          if (_confirmCmd) {
                            _confirmCmd.comment = localGlobalComment
                            _confirmCmd.confirm = "yes"
                          }
                        }
                      })
                    } catch (err) {
                      console.error("执行修改失败:", err)
                    }
                  }
                },
                "执行"
              ),

              // 拒绝按钮
              m(Box,
                {
                  isBtn: true,
                  style: {
                    marginRight: "0",
                    background: getColor("确认框按钮拒绝背景"),
                    color: getColor("确认框按钮拒绝文字")
                  },
                  async onclick() {
                    // 矛盾检测：总框拒绝前，检查是否存在已标记为「批准」的文件
                    const curList = comData.data.get()?.chatLists?.find(l => l.id === chatList.id)
                    const curCmd = curList?.confirmCmds?.find(c => c.id === confirmCmd.id)
                    const hasApproved = Array.isArray(curCmd?.ext?.files) && curCmd.ext.files.some(f => f.status === "approved")

                    const applyReject = async () => {
                      try {
                        await comData.data.edit(data => {
                          const list = data.chatLists?.find(l => l.id === chatList.id)
                          if (list?.confirmCmds) {
                            const _confirmCmd = list.confirmCmds.find(c => c.id === confirmCmd.id)
                            if (_confirmCmd) {
                              // 总框拒绝时，将所有文件状态归一化为 rejected，消除与单文件批准的矛盾
                              if (Array.isArray(_confirmCmd.ext?.files)) {
                                _confirmCmd.ext.files.forEach(f => f.status = "rejected")
                              }
                              _confirmCmd.comment = localGlobalComment
                              _confirmCmd.confirm = "no"
                            }
                          }
                        })
                      } catch (err) {
                        console.error("全部拒绝失败:", err)
                      }
                    }

                    if (hasApproved) {
                      // 存在矛盾：弹窗询问用户是否继续
                      Notice.launch({
                        tip: "检测到审批矛盾",
                        msg: "部分文件已被标记为「批准」，但你选择了整体拒绝。继续将把这些文件也一并标记为拒绝，是否继续？",
                        confirm: async () => {
                          await applyReject()
                          // 返回 undefined，窗口自动关闭
                        }
                      })
                    } else {
                      await applyReject()
                    }
                  }
                },
                "拒绝"
              )
            ]
          )
        ]
      )
    }
  }
}
