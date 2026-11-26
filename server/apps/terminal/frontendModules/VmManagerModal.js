import terminalData from "../terminalData.js"

export default () => {
  let vmStatus = null
  let isActionLoading = false
  let consoleLogs = ""
  let cmdInput = ""
  let isSendingCmd = false
  let autoScroll = true
  let unsubscribeConsole = null
  let unsubscribeProgress = null
  let downloadProgress = {
    image: null,
    qemuSrc: null
  }

  const fetchConsoleLogs = async (appId, settingData, m) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "getVmConsoleLogs"])
      if (res?.ok && typeof res.data === "string") {
        consoleLogs = res.data
        if (m && typeof m.redraw === "function") m.redraw()
      }
    } catch (e) {
      console.error("[VmManagerModal] 获取控制台日志失败:", e)
    }
  }

  const sendCommand = async (appId, settingData, m, Notice, textToSend) => {
    const text = textToSend !== undefined ? textToSend : cmdInput
    if (!text && text !== "\n" && text !== "\x03") return
    isSendingCmd = true
    if (m && typeof m.redraw === "function") m.redraw()
    try {
      const payload = text.endsWith("\n") ? text : text + "\n"
      const res = await settingData.fnCall("appDispatch", [appId, "sendVmConsoleInput", { input: payload }])
      if (textToSend === undefined) {
        cmdInput = ""
      }
      if (res?.msg && !res.ok) {
        Notice.launch({
          tip: trs("通用/提示", { cn: "提示", en: "Notice" }),
          msg: res.msg
        })
      }
    } catch (e) {
      console.error("[VmManagerModal] 发送控制台指令失败:", e)
    } finally {
      isSendingCmd = false
      if (m && typeof m.redraw === "function") m.redraw()
    }
  }

  const fetchStatus = async (appId, settingData, m) => {
    try {
      const res = await settingData.fnCall("appDispatch", [appId, "getVmStatus"])
      if (res?.ok) {
        vmStatus = res.data
        if (m && typeof m.redraw === "function") m.redraw()
      }
    } catch (e) {
      console.error("[VmManagerModal] 获取虚拟机状态失败:", e)
    }
  }

  return {
    oninit(vnode) {
      const { appId, settingData, m } = vnode.attrs
      fetchStatus(appId, settingData, m)
      fetchConsoleLogs(appId, settingData, m)

      const instance = terminalData.instances.get(appId)
      if (instance?.addVmConsoleListener) {
        unsubscribeConsole = instance.addVmConsoleListener((chunk) => {
          consoleLogs += chunk
          if (m && typeof m.redraw === "function") {
            m.redraw()
          }
        })
      }

      // 监听云端资产下载进度广播 (按指南唯一确定从 vnode.attrs 获取父组件注入的 ioSocket)
      const io = vnode.attrs.ioSocket
      if (io?.socket) {
        const handleProgressMsg = (msg) => {
          if (msg?.action === "vmDownloadProgress" && msg.args?.assetType) {
            downloadProgress[msg.args.assetType] = msg.args
            if (msg.args.status === "completed") {
              setTimeout(() => {
                downloadProgress[msg.args.assetType] = null
                fetchStatus(appId, settingData, m)
              }, 1000)
            }
            if (msg.args.status === "failed" || msg.args.status === "cancelled") {
              downloadProgress[msg.args.assetType] = null
              fetchStatus(appId, settingData, m)
            }
            if (m && typeof m.redraw === "function") {
              m.redraw()
            }
          }
        }
        io.socket.on("app:dispatch", handleProgressMsg)
        unsubscribeProgress = () => {
          io.socket.off("app:dispatch", handleProgressMsg)
        }
      }

      // 启动前门禁授权联动：若传入 autoStartDownload，自动触发缺失资产的多轨下载
      if (vnode.attrs.autoStartDownload) {
        setTimeout(async () => {
          try {
            const res = await settingData.fnCall("appDispatch",
              [
                appId,
                "getVmStatus"
              ]
            )
            if (res?.ok) {
              vmStatus = res.data
              if (!vmStatus.isImageReady && !downloadProgress.image) {
                settingData.fnCall("appDispatch",
                  [
                    appId,
                    "startVmAssetDownload",
                    {
                      assetType: "image"
                    }
                  ]
                ).catch((err) => {
                  console.error("[VmManagerModal] 自动下载镜像异常:", err)
                })
              }
              if (!vmStatus.isSrcReady && !downloadProgress.qemuSrc) {
                settingData.fnCall("appDispatch",
                  [
                    appId,
                    "startVmAssetDownload",
                    {
                      assetType: "qemuSrc"
                    }
                  ]
                ).catch((err) => {
                  console.error("[VmManagerModal] 自动下载源码异常:", err)
                })
              }
            }
          } catch (err) {
            console.error("[VmManagerModal] 门禁自动下载检查异常:", err)
          }
        }, 300)
      }
    },
    onremove() {
      if (typeof unsubscribeConsole === "function") {
        unsubscribeConsole()
        unsubscribeConsole = null
      }
      if (typeof unsubscribeProgress === "function") {
        unsubscribeProgress()
        unsubscribeProgress = null
      }
    },
    view(vnode) {
      const {
        appId,
        m,
        comData,
        settingData,
        getColor,
        trs,
        Box,
        Tag,
        IconTag,
        iconPark,
        Notice
      } = vnode.attrs

      const isRunning = vmStatus?.status === "running"
      const currentCpus = Number(vmStatus?.cpus) || 2
      const currentMem = Number(vmStatus?.memory) || 2048

      return m("",
        [
          // ==================== 卡片 1：微虚拟机运行看板与控制 ====================
          m(Box,
            {
              isBlock: true,
              color: "gray_4"
            },
            [
              // 状态标头
              m(IconTag,
                {
                  iconName: "Terminal",
                  bgColor: getColor("main").back,
                  fgColor: getColor("main").front,
                  isBtn: false
                },
                trs("终端/管理/微虚机沙箱", { cn: "微虚拟机沙箱", en: "MicroVM Sandbox" })
              ),

              m(Tag,
                {
                  color: isRunning ? "green_1" : (vmStatus?.status === "error" ? "pink_1" : "gray_2"),
                  isWide: true
                },
                (() => {
                  if (isRunning) return trs("终端/状态/运行中", { cn: "运行中", en: "Running" })
                  if (vmStatus?.status === "starting") return trs("终端/状态/启动中", { cn: "启动中", en: "Starting" })
                  if (vmStatus?.status === "error") return trs("终端/状态/异常", { cn: "异常", en: "Error" })
                  return trs("终端/状态/已停止", { cn: "已停止", en: "Stopped" })
                })()
              ),

              m("br"),

              // 端口与架构详情（直接平铺Tag，杜绝内部嵌套Box）
              m(Tag,
                {
                  color: "gray_3",
                  isWide: true
                },
                trs("终端/管理/本地端口", { cn: "端口: ", en: "Port: " }) + (vmStatus?.port ? `127.0.0.1:${vmStatus.port}` : "-")
              ),

              vmStatus?.pid
                ? m(Tag,
                    {
                      color: "gray_3",
                      isWide: true
                    },
                    `PID: ${vmStatus.pid}`
                  )
                : null,

              m(Tag,
                {
                  color: "gray_3",
                  isWide: true
                },
                "macOS (Apple Silicon · HVF)"
              ),

              m("br"),

              // 启停控制按钮（直接平铺IconTag）
              m(IconTag,
                {
                  iconName: "Right",
                  bgColor: isRunning ? getColor("gray_2").back : getColor("main").back,
                  fgColor: isRunning ? getColor("gray_2").front : getColor("main").front,
                  isBtn: true,
                  disabled: isRunning || isActionLoading,
                  ext: {
                    onclick: async () => {
                      if (isRunning || isActionLoading) return
                      isActionLoading = true
                      m.redraw()
                      try {
                        const res = await settingData.fnCall("appDispatch", [appId, "startVm"])
                        if (res?.msg) {
                          Notice.launch({
                            msg: res.msg
                          })
                        }
                      } finally {
                        isActionLoading = false
                        await fetchStatus(appId, settingData, m)
                      }
                    }
                  }
                },
                trs("终端/管理/启动", { cn: "启动", en: "Start" })
              ),

              m(IconTag,
                {
                  iconName: "CloseOne",
                  bgColor: isRunning ? getColor("pink_1").back : getColor("gray_2").back,
                  fgColor: isRunning ? getColor("pink_1").front : getColor("gray_2").front,
                  isBtn: true,
                  disabled: !isRunning || isActionLoading,
                  ext: {
                    onclick: async () => {
                      if (!isRunning || isActionLoading) return
                      isActionLoading = true
                      m.redraw()
                      try {
                        const res = await settingData.fnCall("appDispatch", [appId, "stopVm"])
                        if (res?.msg) {
                          Notice.launch({
                            msg: res.msg
                          })
                        }
                      } finally {
                        isActionLoading = false
                        await fetchStatus(appId, settingData, m)
                      }
                    }
                  }
                },
                trs("终端/管理/停止", { cn: "停止", en: "Stop" })
              ),

              m(IconTag,
                {
                  iconName: "Refresh",
                  bgColor: getColor("gray_2").back,
                  fgColor: getColor("gray_2").front,
                  isBtn: true,
                  disabled: !isRunning || isActionLoading,
                  ext: {
                    onclick: async () => {
                      if (!isRunning || isActionLoading) return
                      isActionLoading = true
                      m.redraw()
                      try {
                        const res = await settingData.fnCall("appDispatch", [appId, "restartVm"])
                        if (res?.msg) {
                          Notice.launch({
                            msg: res.msg
                          })
                        }
                      } finally {
                        isActionLoading = false
                        await fetchStatus(appId, settingData, m)
                      }
                    }
                  }
                },
                trs("终端/管理/重启", { cn: "重启", en: "Restart" })
              )
            ]
          ),

          // ==================== 卡片 2：硬件规格配置 ====================
          m(Box,
            {
              isBlock: true,
              color: "gray_4"
            },
            [
              // CPU 行
              m(Tag,
                {
                  color: "gray_3",
                  isWide: true
                },
                trs("终端/管理/CPU核心", { cn: "CPU 核心分配", en: "CPU Cores" })
              ),

              [1, 2, 4].map(cpuNum => {
                const isSelected = currentCpus === cpuNum
                return m(Tag,
                  {
                    isBtn: true,
                    color: isSelected ? "main" : "gray_2",
                    ext: {
                      onclick: async () => {
                        if (isSelected) return
                        const res = await settingData.fnCall("appDispatch", [appId, "saveVmHardware", { cpus: cpuNum }])
                        if (res?.msg) Notice.launch({ msg: res.msg })
                        await fetchStatus(appId, settingData, m)
                      }
                    }
                  },
                  `${cpuNum} ` + trs("终端/管理/核", { cn: "核", en: "Cores" }) + (cpuNum === 2 ? trs("通用/推荐后缀", { cn: " (推荐)", en: " (Recommended)" }) : "")
                )
              }),

              m("br"),

              // 内存行
              m(Tag,
                {
                  color: "gray_3",
                  isWide: true
                },
                trs("终端/管理/内存容量", { cn: "内存容量分配", en: "Memory Size" })
              ),

              [
                { mem: 1024, label: "1 GB" },
                { mem: 2048, label: "2 GB" + trs("通用/推荐后缀", { cn: " (推荐)", en: " (Recommended)" }) },
                { mem: 4096, label: "4 GB" }
              ].map(item => {
                const isSelected = currentMem === item.mem
                return m(Tag,
                  {
                    isBtn: true,
                    color: isSelected ? "main" : "gray_2",
                    ext: {
                      onclick: async () => {
                        if (isSelected) return
                        const res = await settingData.fnCall("appDispatch", [appId, "saveVmHardware", { memory: item.mem }])
                        if (res?.msg) Notice.launch({ msg: res.msg })
                        await fetchStatus(appId, settingData, m)
                      }
                    }
                  },
                  item.label
                )
              })
            ]
          ),

          // ==================== 卡片 3：云端资产与下载运维 (100% 遵照四大指南重构) ====================
          m(Box,
            {
              isBlock: true,
              color: "gray_4"
            },
            [
              // 标头行：环境自适应探测
              m(IconTag,
                {
                  iconName: "Planet",
                  bgColor: getColor("main").back,
                  fgColor: getColor("main").front,
                  isBtn: false
                },
                trs("终端/管理/云端资产",
                  {
                    cn: "云端镜像与组件资产",
                    en: "Cloud Assets"
                  }
                )
              ),

              m(Tag,
                {
                  color: "gray_3",
                  isWide: true
                },
                trs("终端/管理/多源择优",
                  {
                    cn: "🧭 下载策略: 起下实测各源速度并锁定单一源",
                    en: "🧭 Strategy: measure, then lock one source"
                  }
                )
              ),

              // 上次实测锁定的源（数据来自后端最近一次起下时的采样结果）
              vmStatus?.lastProbe?.image || vmStatus?.lastProbe?.qemuSrc
                ? m(Tag,
                    {
                      color: "gray_3",
                      isWide: true
                    },
                    (() => {
                      const lastProbe = vmStatus.lastProbe.image || vmStatus.lastProbe.qemuSrc
                      return `🔒 上次锁定源: ${lastProbe.label} · 实测 ${lastProbe.speedText}`
                    })()
                  )
                : null,

              m("br"),

              // 1. Alpine 镜像行
              m(Tag,
                {
                  color: vmStatus?.isImageReady ? "green_1" : "orange_1",
                  isWide: true
                },
                vmStatus?.isImageReady
                  ? trs("终端/管理/镜像就绪",
                      {
                        cn: `Alpine 镜像 (v${vmStatus?.imageVersion || "3.20.9"}) 已就绪`,
                        en: `Alpine Image (v${vmStatus?.imageVersion || "3.20.9"}) Ready`
                      }
                    )
                  : trs("终端/管理/镜像未下载",
                      {
                        cn: "Alpine 系统镜像 (未下载)",
                        en: "Alpine Image (Not Downloaded)"
                      }
                    )
              ),

              m(IconTag,
                {
                  iconName: vmStatus?.isImageReady ? "History" : "Download",
                  bgColor: vmStatus?.isImageReady ? getColor("gray_2").back : getColor("main").back,
                  fgColor: vmStatus?.isImageReady ? getColor("gray_2").front : getColor("main").front,
                  isBtn: true,
                  disabled: Boolean(downloadProgress.image),
                  ext: {
                    onclick: async () => {
                      if (downloadProgress.image) return
                      isActionLoading = true
                      m.redraw()
                      try {
                        const res = await settingData.fnCall("appDispatch",
                          [
                            appId,
                            "startVmAssetDownload",
                            {
                              assetType: "image"
                            }
                          ]
                        )
                        if (res?.msg && !res.ok) {
                          Notice.launch({
                            msg: res.msg
                          })
                        }
                      } catch (err) {
                        console.error("[VmManagerModal] 下载镜像异常:", err)
                      } finally {
                        isActionLoading = false
                        await fetchStatus(appId, settingData, m)
                      }
                    }
                  }
                },
                vmStatus?.isImageReady
                  ? trs("终端/管理/重新下载镜像",
                      {
                        cn: "重新下载",
                        en: "Redownload"
                      }
                    )
                  : trs("终端/管理/一键下载镜像",
                      {
                        cn: "一键下载",
                        en: "Download"
                      }
                    )
              ),

              // 镜像独立下载进度槽位 (测速与下载中动态展开，完成自动隐藏)
              downloadProgress.image && (downloadProgress.image.status === "probing" || downloadProgress.image.status === "downloading")
                ? m(Box,
                    {
                      color: "gray_2",
                      style: {
                        margin: "0.5rem 0",
                        padding: "0.5rem 1rem"
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            display: "flex",
                            justifyContent: "space-between"
                          }
                        },
                        [
                          downloadProgress.image.status === "probing"
                            ? trs("终端/管理/镜像测速中",
                                {
                                  cn: "正在实测各源速度…",
                                  en: "Measuring mirror speeds"
                                }
                              )
                            : trs("终端/管理/下载镜像中",
                                {
                                  cn: "正在下载 Alpine 镜像",
                                  en: "Downloading Alpine Image"
                                }
                              ) + `: ${Math.round((downloadProgress.image.loaded || 0) / 1048576)}MB / ${Math.round((downloadProgress.image.total || 0) / 1048576)}MB (${downloadProgress.image.percent || 0}%)`,
                          downloadProgress.image.status === "probing" ? "" : (downloadProgress.image.speed || "0 KB/s")
                        ]
                      ),

                      // 状态留言行：锁定源 / 同源续传 / 硬失败换源，全部如实写出来
                      downloadProgress.image.notice
                        ? m("",
                            {
                              style: {
                                fontSize: "0.85em",
                                opacity: 0.75,
                                marginTop: "0.2rem"
                              }
                            },
                            downloadProgress.image.notice
                          )
                        : null,
                      m("",
                        {
                          style: {
                            height: "0.6rem",
                            borderRadius: "3rem",
                            overflow: "hidden",
                            background: getColor("gray_3").back,
                            margin: "0.4rem 0"
                          }
                        },
                        [
                          m("",
                            {
                              style: {
                                height: "100%",
                                width: `${downloadProgress.image.percent || 0}%`,
                                background: getColor("main").back,
                                transition: "width 0.2s ease"
                              }
                            }
                          )
                        ]
                      ),
                      m(IconTag,
                        {
                          iconName: "Close",
                          bgColor: getColor("pink_1").back,
                          fgColor: getColor("pink_1").front,
                          isBtn: true,
                          ext: {
                            onclick: async () => {
                              try {
                                await settingData.fnCall("appDispatch",
                                  [
                                    appId,
                                    "cancelVmAssetDownload",
                                    {
                                      assetType: "image"
                                    }
                                  ]
                                )
                                downloadProgress.image = null
                              } catch (err) {
                                console.error("[VmManagerModal] 取消下载镜像异常:", err)
                              } finally {
                                await fetchStatus(appId, settingData, m)
                              }
                            }
                          }
                        },
                        trs("终端/管理/取消下载",
                          {
                            cn: "取消下载",
                            en: "Cancel"
                          }
                        )
                      )
                    ]
                  )
                : null,

              m("br"),

              // 2. QEMU 源码行
              m(Tag,
                {
                  color: vmStatus?.isSrcReady ? "green_1" : "orange_1",
                  isWide: true
                },
                vmStatus?.isSrcReady
                  ? trs("终端/管理/源码就绪",
                      {
                        cn: `QEMU 源码包 (v${vmStatus?.qemuVersion || "11.1.3"}) 已就绪`,
                        en: `QEMU Source (v${vmStatus?.qemuVersion || "11.1.3"}) Ready`
                      }
                    )
                  : trs("终端/管理/源码未下载",
                      {
                        cn: "QEMU 官方源码包 (未下载)",
                        en: "QEMU Source (Not Downloaded)"
                      }
                    )
              ),

              m(IconTag,
                {
                  iconName: vmStatus?.isSrcReady ? "History" : "Download",
                  bgColor: vmStatus?.isSrcReady ? getColor("gray_2").back : getColor("main").back,
                  fgColor: vmStatus?.isSrcReady ? getColor("gray_2").front : getColor("main").front,
                  isBtn: true,
                  disabled: Boolean(downloadProgress.qemuSrc),
                  ext: {
                    onclick: async () => {
                      if (downloadProgress.qemuSrc) return
                      isActionLoading = true
                      m.redraw()
                      try {
                        const res = await settingData.fnCall("appDispatch",
                          [
                            appId,
                            "startVmAssetDownload",
                            {
                              assetType: "qemuSrc"
                            }
                          ]
                        )
                        if (res?.msg && !res.ok) {
                          Notice.launch({
                            msg: res.msg
                          })
                        }
                      } catch (err) {
                        console.error("[VmManagerModal] 下载源码异常:", err)
                      } finally {
                        isActionLoading = false
                        await fetchStatus(appId, settingData, m)
                      }
                    }
                  }
                },
                vmStatus?.isSrcReady
                  ? trs("终端/管理/重新下载源码",
                      {
                        cn: "重新下载",
                        en: "Redownload"
                      }
                    )
                  : trs("终端/管理/一键下载源码",
                      {
                        cn: "一键下载",
                        en: "Download"
                      }
                    )
              ),

              // 源码独立下载进度槽位 (测速与下载中动态展开，完成自动隐藏)
              downloadProgress.qemuSrc && (downloadProgress.qemuSrc.status === "probing" || downloadProgress.qemuSrc.status === "downloading")
                ? m(Box,
                    {
                      color: "gray_2",
                      style: {
                        margin: "0.5rem 0",
                        padding: "0.5rem 1rem"
                      }
                    },
                    [
                      m("",
                        {
                          style: {
                            display: "flex",
                            justifyContent: "space-between"
                          }
                        },
                        [
                          downloadProgress.qemuSrc.status === "probing"
                            ? trs("终端/管理/源码测速中",
                                {
                                  cn: "正在实测各源速度…",
                                  en: "Measuring mirror speeds"
                                }
                              )
                            : trs("终端/管理/下载源码中",
                                {
                                  cn: "正在下载 QEMU 源码包",
                                  en: "Downloading QEMU Source"
                                }
                              ) + `: ${Math.round((downloadProgress.qemuSrc.loaded || 0) / 1048576)}MB / ${Math.round((downloadProgress.qemuSrc.total || 0) / 1048576)}MB (${downloadProgress.qemuSrc.percent || 0}%)`,
                          downloadProgress.qemuSrc.status === "probing" ? "" : (downloadProgress.qemuSrc.speed || "0 KB/s")
                        ]
                      ),

                      // 状态留言行：锁定源 / 同源续传 / 硬失败换源，全部如实写出来
                      downloadProgress.qemuSrc.notice
                        ? m("",
                            {
                              style: {
                                fontSize: "0.85em",
                                opacity: 0.75,
                                marginTop: "0.2rem"
                              }
                            },
                            downloadProgress.qemuSrc.notice
                          )
                        : null,
                      m("",
                        {
                          style: {
                            height: "0.6rem",
                            borderRadius: "3rem",
                            overflow: "hidden",
                            background: getColor("gray_3").back,
                            margin: "0.4rem 0"
                          }
                        },
                        [
                          m("",
                            {
                              style: {
                                height: "100%",
                                width: `${downloadProgress.qemuSrc.percent || 0}%`,
                                background: getColor("main").back,
                                transition: "width 0.2s ease"
                              }
                            }
                          )
                        ]
                      ),
                      m(IconTag,
                        {
                          iconName: "Close",
                          bgColor: getColor("pink_1").back,
                          fgColor: getColor("pink_1").front,
                          isBtn: true,
                          ext: {
                            onclick: async () => {
                              try {
                                await settingData.fnCall("appDispatch",
                                  [
                                    appId,
                                    "cancelVmAssetDownload",
                                    {
                                      assetType: "qemuSrc"
                                    }
                                  ]
                                )
                                downloadProgress.qemuSrc = null
                              } catch (err) {
                                console.error("[VmManagerModal] 取消下载源码异常:", err)
                              } finally {
                                await fetchStatus(appId, settingData, m)
                              }
                            }
                          }
                        },
                        trs("终端/管理/取消下载",
                          {
                            cn: "取消下载",
                            en: "Cancel"
                          }
                        )
                      )
                    ]
                  )
                : null,

              m("br"),

              // 3. QEMU 二进制可执行文件行
              m(Tag,
                {
                  color: vmStatus?.isBinReady ? "green_1" : "orange_1",
                  isWide: true
                },
                vmStatus?.isBinReady
                  ? trs("终端/管理/引擎就绪",
                      {
                        cn: "QEMU 引擎已就绪",
                        en: "QEMU Ready"
                      }
                    )
                  : trs("终端/管理/引擎未编译",
                      {
                        cn: "QEMU 引擎未安装",
                        en: "QEMU Not Installed"
                      }
                    )
              ),

              // 💡 核心设计：源码就绪而未编译时，管理面板下方动态浮现醒目高亮大按钮
              vmStatus?.isSrcReady && !vmStatus?.isBinReady
                ? m(Box,
                    {
                      isBtn: true,
                      color: "main",
                      style: {
                        margin: "1rem 0",
                        padding: "0.8rem 1.6rem",
                        borderRadius: "3rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.8rem",
                        cursor: "pointer"
                      },
                      onclick: async () => {
                        try {
                          let targetListId = 0
                          try {
                            targetListId = comData.getChatList(comData.data.get().targetChatListId).id
                          } catch (e) {
                            targetListId = 0
                          }
                          await settingData.fnCall("sendChatMessage",
                            [
                              {
                                targetChatListId: targetListId ?? 0,
                                inputText: "微虚拟机系统镜像和 QEMU 源码已在管理面板下载校验就绪！请阅读 qemu_install 技能规约，立即在宿主物理终端内完成 QEMU 引擎的编译与安装。编译产物归位后往虚拟终端发送一条 echo 命令激活微虚机。",
                                sendMode: "agent",
                                isSystemCall: true
                              }
                            ]
                          )
                          Notice.launch({
                            tip: trs("通用/提示",
                              {
                                cn: "提示",
                                en: "Notice"
                              }
                            ),
                            msg: trs("终端/管理/已召唤AI提示",
                              {
                                cn: "已向 AI 发送指令，正在物理终端为您编译构建 QEMU 引擎！",
                                en: "Instruction sent to AI, compiling QEMU in host terminal now!"
                              }
                            )
                          })
                        } catch (err) {
                          console.error("[VmManagerModal] 召唤 AI 编译异常:", err)
                        }
                      }
                    },
                    [
                      m.trust(
                        iconPark.getIcon("RobotOne",
                          {
                            size: "1.6rem",
                            fill: getColor("main").front
                          }
                        )
                      ),
                      trs("终端/管理/立即召唤AI",
                        {
                          cn: "立即召唤 AI 安装/重装虚拟机软件",
                          en: "Summon AI to Install/Rebuild VM Engine"
                        }
                      )
                    ]
                  )
                : null
            ]
          ),

          // ==================== 卡片 4：微虚拟机应急启动台 (非 SSH 直通) ====================
          m(Box,
            {
              isBlock: true,
              color: "gray_4"
            },
            [
              // 标头行：标题 + 自动滚动开关 + 刷新 + 清屏
              m(IconTag,
                {
                  iconName: "Terminal",
                  bgColor: getColor("main").back,
                  fgColor: getColor("main").front,
                  isBtn: false
                },
                trs("终端/管理/应急启动台", { cn: "应急启动台 (非 SSH 直通)", en: "Emergency Console (Non-SSH)" })
              ),

              m(Tag,
                {
                  isBtn: true,
                  color: autoScroll ? "green_1" : "gray_2",
                  ext: {
                    onclick: () => {
                      autoScroll = !autoScroll
                    }
                  }
                },
                autoScroll
                  ? trs("终端/管理/自动滚动开", { cn: "自动滚动: 开", en: "Auto Scroll: On" })
                  : trs("终端/管理/自动滚动关", { cn: "自动滚动: 关", en: "Auto Scroll: Off" })
              ),

              m(IconTag,
                {
                  iconName: "Refresh",
                  bgColor: getColor("gray_2").back,
                  fgColor: getColor("gray_2").front,
                  isBtn: true,
                  ext: {
                    onclick: () => fetchConsoleLogs(appId, settingData, m)
                  }
                },
                trs("通用/刷新", { cn: "刷新", en: "Refresh" })
              ),

              m(IconTag,
                {
                  iconName: "Delete",
                  bgColor: getColor("gray_2").back,
                  fgColor: getColor("gray_2").front,
                  isBtn: true,
                  ext: {
                    onclick: async () => {
                      try {
                        await settingData.fnCall("appDispatch", [appId, "clearVmConsoleLogs"])
                        consoleLogs = ""
                        if (m && typeof m.redraw === "function") m.redraw()
                      } catch (e) {
                        console.error("[VmManagerModal] 清屏失败:", e)
                      }
                    }
                  }
                },
                trs("通用/清屏", { cn: "清屏", en: "Clear" })
              ),

              // 控制台日志视口：纯原生 pre 标签，等宽字体，支持划词复制与触底
              m("pre",
                {
                  onupdate({ dom }) {
                    if (autoScroll) {
                      dom.scrollTop = dom.scrollHeight
                    }
                  },
                  style: {
                    background: "#181a1f",
                    color: "#abb2bf",
                    fontFamily: "'SF Mono', Consolas, Menlo, monospace",
                    fontSize: "1.1rem",
                    lineHeight: "1.5",
                    padding: "1rem",
                    borderRadius: "0.4rem",
                    maxHeight: "16rem",
                    overflowY: "auto",
                    userSelect: "text",
                    margin: "0.8rem 0",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all"
                  }
                },
                consoleLogs || trs("终端/管理/暂无日志", { cn: "(暂无硬件控制台输出)", en: "(No console output)" })
              ),

              // 快捷按键行
              m("",
                {
                  style: {
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    marginBottom: "0.6rem"
                  }
                },
                [
                  m(Tag,
                    {
                      color: "gray_3",
                      isWide: true
                    },
                    trs("终端/管理/快捷键", { cn: "救援快捷键: ", en: "Rescue Keys: " })
                  ),

                  m(Tag,
                    {
                      isBtn: true,
                      color: "gray_2",
                      ext: {
                        onclick: () => sendCommand(appId, settingData, m, Notice, "\n")
                      }
                    },
                    "↵ Enter"
                  ),

                  m(Tag,
                    {
                      isBtn: true,
                      color: "pink_1",
                      ext: {
                        onclick: () => sendCommand(appId, settingData, m, Notice, "\x03")
                      }
                    },
                    "^C Ctrl+C"
                  ),

                  m(Tag,
                    {
                      isBtn: true,
                      color: "gray_2",
                      ext: {
                        onclick: () => sendCommand(appId, settingData, m, Notice, "\x04")
                      }
                    },
                    "^D Ctrl+D"
                  )
                ]
              ),

              // 指令发送表单：W3C 原生标准 <form onsubmit>，彻底免疫输入法 IME 选词回车提前发射
              m("form",
                {
                  onsubmit: (e) => {
                    e.preventDefault()
                    sendCommand(appId, settingData, m, Notice)
                  },
                  style: {
                    display: "flex",
                    gap: "0.6rem",
                    alignItems: "center"
                  }
                },
                [
                  m("input",
                    {
                      type: "text",
                      value: cmdInput,
                      oninput: (e) => {
                        cmdInput = e.target.value
                      },
                      placeholder: trs("终端/管理/输入指令", {
                        cn: "输入应急指令按回车 (直通硬件串口)...",
                        en: "Enter rescue command and press Enter..."
                      }),
                      style: {
                        flex: "1",
                        padding: "0.4rem 0.8rem",
                        borderRadius: "3rem",
                        border: "1px solid rgba(128, 128, 128, 0.2)",
                        background: getColor("gray_3").back,
                        color: getColor("gray_3").front,
                        fontSize: "1.2rem",
                        outline: "none"
                      }
                    }
                  ),

                  m("button",
                    {
                      type: "submit",
                      style: {
                        display: "none"
                      }
                    }
                  ),

                  m(IconTag,
                    {
                      iconName: "Send",
                      bgColor: getColor("main").back,
                      fgColor: getColor("main").front,
                      isBtn: true,
                      disabled: isSendingCmd,
                      ext: {
                        onclick: () => sendCommand(appId, settingData, m, Notice)
                      }
                    },
                    trs("通用/发送", { cn: "发送", en: "Send" })
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
