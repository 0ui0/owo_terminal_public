import terminalData from "./terminalData.js"
import VmManagerModal from "./frontendModules/VmManagerModal.js"

export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, getColor, getSize, trs, iconPark, Box, Tag, Terminal, FitAddon, sysMenu, iconTag, Setting }) => {
  let term = null
  let fitAddon = null
  let resizeObserver = null
  let resizeTimeout = null
  let closeTabFn = null
  const vmConsoleListeners = new Set()

  const instanceInterface = {
    addVmConsoleListener(fn) {
      vmConsoleListeners.add(fn)
      return () => vmConsoleListeners.delete(fn)
    },
    onDispatch(msg, callback) {
      if (msg.action === "stream" && term) {
        term.write(msg.args.content)
      }
      if (msg.action === "vmConsoleChunk") {
        for (const fn of vmConsoleListeners) {
          try {
            fn(msg.args.text)
          } catch (e) {
            console.error("[terminal] vmConsoleChunk 广播异常:", e)
          }
        }
      }
      if (msg.action === "exit" && term) {
        term.write("\r\n" + (trs ? trs("终端/状态/进程已退出", { cn: "[进程已退出]", en: "[Process Exited]" }) : "[进程已退出]") + "\r\n")
      }
      if (callback) callback({ ok: true, msg: "ok" })
    }
  }

  let currentDom = null

  const syncSize = (targetDom) => {
    if (!term || !fitAddon) return
    const el = targetDom || currentDom
    // 容器在隐藏或未完成布局时（offsetWidth 为 0）跳过计算，避免将终端挤压为畸形尺寸
    if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0) return
    try {
      fitAddon.fit()
      if (term.cols > 0 && term.rows > 0) {
        if (resizeTimeout) clearTimeout(resizeTimeout)
        resizeTimeout = setTimeout(() => {
          if (term && el && el.offsetWidth > 0) {
            settingData.fnCall("appDispatch", [appId, "resize", {
              cols: term.cols,
              rows: term.rows
            }])
          }
        }, 50)
      }
    } catch (e) { }
  }

  terminalData.addTool("commonData", commonData)
  terminalData.registerInstances(appId, instanceInterface)
  if (commonData.registerApp) commonData.registerApp(appId, terminalData)

  const openVmManagerModal = ({ autoStartDownload = false } = {}) => {
    Notice.launch({
      sign: "terminal_vm_manager_" + appId,
      tip: trs("终端/管理/标题", { cn: "虚拟机管理", en: "Virtual Machine Manager" }),
      content: VmManagerModal,
      contentAttrs: {
        appId,
        m,
        comData,
        settingData,
        getColor,
        trs,
        iconPark,
        Box,
        Tag,
        IconTag: iconTag,
        ioSocket,
        Notice,
        autoStartDownload
      }
    })
  }

  // 全局唯一监听：收到后端未安装/未就绪信号时弹出标准授权询问，确认后统一唤起管理面板
  if (!terminalData._hasQemuAuthListener && ioSocket?.socket) {
    terminalData._hasQemuAuthListener = true

    // 用户端前台启动未就绪信号：弹窗询问确认后统一唤起管理面板并开启下载
    ioSocket.socket.on("terminal:requireVmSetup", () => {
      Notice.launch({
        sign: "terminal_qemu_auth",
        tip: trs("终端/授权/标题", { cn: "开启微虚拟机免审终端", en: "Enable MicroVM Sandbox" }),
        msg: trs("终端/授权/正文", {
          cn: "缺少 QEMU 虚拟机软件和虚拟机镜像，是否下载并让 AI 安装？",
          en: "Missing QEMU software and system image. Download assets and let AI install?"
        }),
        confirm: () => {
          openVmManagerModal({ autoStartDownload: true })
          return undefined
        }
      })
    })

    // AI 端工具联动信号：直接唤起管理面板并开启下载
    ioSocket.socket.on("terminal:openVmManager", (args) => {
      openVmManagerModal({ autoStartDownload: Boolean(args?.autoStartDownload) })
    })
  }

  return {
    oninit(vnode) {
      const config = vnode.attrs.noticeConfig
      const isVm = Boolean(vnode.attrs.data?.mode === "vm")

      // === 顶栏文件菜单气泡 (100% 对齐 Editor App 与系统 sysMenu 规范) ===
      const openFileMenu = (e) => {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation()
        const target = e?.currentTarget || e?.target
        const rect = target && typeof target.getBoundingClientRect === "function" ? target.getBoundingClientRect() : { left: 10, bottom: 40 }
        const x = Math.max(10, rect.left)
        const y = rect.bottom + 6

        const menuItems = [
          {
            name: trs("终端/菜单/新建物理终端", { cn: "新建终端 (物理系统)", en: "New Terminal (Host)" }),
            onclick: () => settingData.fnCall("appLaunch", ["terminal", { data: { mode: "host" } }])
          },
          {
            name: trs("终端/菜单/新建虚拟终端", { cn: "新建终端 (虚拟系统)", en: "New Terminal (MicroVM)" }),
            onclick: () => settingData.fnCall("appLaunch", ["terminal", { data: { mode: "vm" } }]).catch(() => {})
          },
          "sep",
          {
            name: trs("终端/菜单/虚拟机管理", { cn: "虚拟机管理...", en: "Virtual Machine Manager..." }),
            onclick: () => openVmManagerModal()
          },
          {
            name: trs("终端/菜单/终端设置", { cn: "终端设置...", en: "Terminal Settings..." }),
            onclick: () => {
              Notice.launch({
                sign: "setting_main",
                tip: trs("输入栏/提示/设置中心", { cn: "设置中心", en: "Settings" }),
                content: Setting
              })
            }
          },
          "sep",
          {
            name: trs("终端/菜单/关闭当前终端", { cn: "关闭当前终端", en: "Close Terminal" }),
            onclick: () => {
              if (typeof closeTabFn === "function") closeTabFn()
            }
          }
        ]

        Notice.launch({
          newWindow: true,
          win: { x, y },
          sign: "terminal_file_menu_" + appId,
          tip: trs("终端/菜单/文件", { cn: "文件", en: "File" }),
          content: {
            view: (v) => m(sysMenu, {
              menuItems: menuItems.map(item => {
                if (item === "sep") return "sep"
                return {
                  name: item.name,
                  onclick: () => {
                    v.attrs.delete()
                    if (item.onclick) item.onclick()
                    m.redraw()
                  }
                }
              })
            })
          }
        })
      }

      if (config) {
        const getCurrentMainCwd = () => {
          const listId = vnode.attrs.data?.listId ?? 0
          return comData?.getChatList ? comData.getChatList(listId)?.workDirs?.find(i => i.type === "main")?.path : null
        }
        const getInitialCwd = () => vnode.attrs.data?.initialCwd || vnode.attrs.data?.cwd || ""
        const formatShortCwd = (fullPath) => {
          if (!fullPath) return trs("终端/状态/未配置", { cn: "无目录", en: "No Dir" })
          let clean = fullPath.trim()
          clean = clean.replace(/^\/Users\/[^/]+/, "~").replace(/^C:\\Users\\[^\\]+/i, "~")
          const parts = clean.split(/[/\\]/).filter(Boolean)
          if (parts.length <= 2) {
            return clean.replace(/\\/g, "/")
          }
          const last = parts[parts.length - 1]
          const prev = parts[parts.length - 2]
          return `.../${prev}/${last}`
        }
        const getDirName = (p) => p ? (p.split(/[/\\]/).filter(Boolean).pop() || p) : ""

        const handleCwdBubbleClick = (e) => {
          if (e && e.stopPropagation) e.stopPropagation()
          const currentMain = getCurrentMainCwd()
          const initialCwd = getInitialCwd()
          const currentDirName = getDirName(currentMain)
          const initialDirName = getDirName(initialCwd)
          const isDrifted = Boolean(currentMain && initialCwd && currentMain !== initialCwd)

          // 无论是否漂移，均弹窗展示当前终端的完整绝对路径及虚拟映射详情
          if (!isDrifted) {
            // 一致正常态：纯展示当前完整路径详情
            Notice.launch({
              tip: trs("终端/提示/工作目录详情", { cn: "终端工作目录详情", en: "Terminal Working Directory" }),
              msg: trs("终端/提示/正常路径详情", {
                cn: `当前终端工作目录绝对路径：\n${initialCwd || "未配置"}\n` +
                    (isVm ? `\n虚拟系统内部挂载路径：\n/mnt/${initialDirName || "未配置"}\n` : "") +
                    `\n（当前与系统主工作目录配置保持一致）`,
                en: `Current terminal absolute path:\n${initialCwd || "Not configured"}\n` +
                    (isVm ? `\nVirtual guest mount path:\n/mnt/${initialDirName || "Not configured"}\n` : "") +
                    `\n(Matches current system main directory)`
              })
            })
            return
          }

          // 漂移态：展示路径对比并提供切换按钮
          if (!isVm) {
            Notice.launch({
              tip: trs("终端/提示/同步主工作目录", { cn: "同步主工作目录", en: "Sync Main Directory" }),
              msg: trs("终端/提示/物理终端同步询问", {
                cn: `系统主工作目录当前为：\n${currentMain} (${currentDirName})\n\n终端初始基准目录为：\n${initialCwd || "未配置"}\n\n是否将当前物理终端切换至新主工作目录？\n\n（说明：AI 或命令在终端内临时 cd 不会改变终端绑定的基准工作目录）`,
                en: `Current system main directory is:\n${currentMain}\n\nTerminal initial directory:\n${initialCwd || "None"}\n\nSwitch current host terminal to new main directory?\n\n(Note: manual cd inside terminal does not alter base directory)`
              }),
              confirm: async (dom, closeFn) => {
                try {
                  const res = await settingData.fnCall("appDispatch", [appId, "syncHostCwd", { targetCwd: currentMain }])
                  if (res?.ok) {
                    if (vnode.attrs.data) {
                      vnode.attrs.data.initialCwd = currentMain
                      vnode.attrs.data.cwd = currentMain
                    }
                    m.redraw()
                  }
                } catch (err) {
                  console.error("[terminal] syncHostCwd error:", err)
                }
                if (typeof closeFn === "function") closeFn()
              }
            })
          } else {
            Notice.launch({
              tip: trs("终端/提示/重启微虚机", { cn: "重启虚拟系统并重新挂载", en: "Restart VM & Remount" }),
              msg: trs("终端/提示/虚拟终端重启警告", {
                cn: `系统检测到主工作目录已修改。\n目标新目录：${currentMain} (${currentDirName})\n\n微虚拟机的硬件共享通道受启动参数绑定，切换工作目录需要【重启微虚拟机】。\n\n⚠️ 警告：重启将强行终止当前所有虚拟终端中正在运行的进程与未保存任务！是否继续？\n\n（说明：AI 或命令在终端内临时 cd 不会改变终端绑定的基准工作目录）`,
                en: `Main working directory changed to:\n${currentMain}\n\nSwitching directory requires RESTARTING the MicroVM.\n\n⚠️ WARNING: Restart will terminate all running processes and unsaved tasks in all virtual terminals! Continue?\n\n(Note: manual cd inside terminal does not alter base directory)`
              }),
              confirm: async (dom, closeFn) => {
                try {
                  const res = await settingData.fnCall("appDispatch", [appId, "remountVmWorkspace", { workspaceDir: currentMain }])
                  if (res?.ok) {
                    if (vnode.attrs.data) {
                      vnode.attrs.data.initialCwd = currentMain
                      vnode.attrs.data.cwd = currentMain
                    }
                    m.redraw()
                  }
                } catch (err) {
                  console.error("[terminal] remountVmWorkspace error:", err)
                }
                if (typeof closeFn === "function") closeFn()
              }
            })
          }
        }

        // 动态注入 Notice 顶栏单文件菜单、模式指示 Tag 与工作目录感知气泡
        config.titleBar = {
          view: () => {
            const currentMain = getCurrentMainCwd()
            const initialCwd = getInitialCwd()
            const isDrifted = Boolean(currentMain && initialCwd && currentMain !== initialCwd)
            const shortPath = formatShortCwd(initialCwd)

            return m("",
              {
                style: {
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center"
                }
              },
              [
                // 内层：四边留白 k1，元素间距由 gap 提供，窄屏可换行
                m("",
                  {
                    style: {
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: `${getSize(1)}rem`,
                      margin: `${getSize(1)}rem`,
                      flexWrap: "wrap"
                    }
                  },
                  [
                // 文件菜单胶囊按钮
                m(Box,
                  {
                    tagName: "div",
                    isBtn: true,
                    color: "main",
                    noValue: true,
                    style: {
                      padding: `${getSize(1)}rem ${getSize(3)}rem`,
                      borderRadius: `${getSize(8)}rem`,
                      fontSize: `${getSize(3)}rem`,
                      display: "inline-flex",
                      alignItems: "center",
                      cursor: "pointer",
                      margin: 0,
                      boxShadow: `0 ${getSize(0.5)}rem ${getSize(2)}rem rgba(0, 0, 0, 0.15)`,
                      "-webkit-app-region": "no-drag"
                    },
                    ext: {
                      onpointerdown: (e) => e.stopPropagation()
                    },
                    onclick: (dom, e) => openFileMenu(e)
                  },
                  trs("终端/菜单/文件", { cn: "文件", en: "File" })
                ),

                // 模式指示器胶囊 (带图标胶囊统一使用系统官方 iconTag，彻底告别手写 style)
                m(iconTag,
                  {
                    isBtn: false,
                    iconName: isVm ? "FileLock" : "Terminal",
                    bgColor: getColor(isVm ? "green_1" : "gray_2").back,
                    fgColor: getColor(isVm ? "green_1" : "gray_2").front,
                    styleExt: { margin: 0 }
                  },
                  trs(
                    isVm ? "终端/模式/虚拟系统" : "终端/模式/物理系统",
                    {
                      cn: isVm ? "虚拟系统终端" : "物理系统终端",
                      en: isVm ? "Virtual System" : "Physical System"
                    }
                  )
                ),

                // 初始工作目录感知气泡胶囊 (带图标胶囊统一使用 iconTag，点击事件严格收敛在 ext 中，零手写 style)
                m(iconTag,
                  {
                    isBtn: true,
                    iconName: isDrifted ? "Attention" : "FolderOpen",
                    bgColor: getColor(isDrifted ? "yellow_1" : "gray_2").back,
                    fgColor: getColor(isDrifted ? "yellow_1" : "gray_2").front,
                    styleExt: { margin: 0 },
                    ext: {
                      onpointerdown: (e) => e.stopPropagation(),
                      title: initialCwd || trs("终端/状态/未配置", { cn: "未设置工作目录", en: "No Working Directory" }),
                      onclick: (dom, e) => handleCwdBubbleClick(e)
                    }
                  },
                  trs("终端/路径/当前", {
                    cn: shortPath,
                    en: shortPath
                  })
                )
                  ]
                )
              ]
            )
          }
        }

        const originalCancel = config.cancel
        config.cancel = async (dom, closeFn, tabData, event) => {
          closeTabFn = closeFn
          try {
            const res = await settingData.fnCall("appDispatch", [appId, "checkRunningProcess"])
            if (res?.hasRunningProcess) {
              Notice.launch({
                tip: trs ? trs("通用/提示", { cn: "提示", en: "Notice" }) : "提示",
                msg: trs ? trs("终端/提示/有运行中进程", {
                  cn: "终端中有正在运行的进程，关闭将强行终止该进程，确定要关闭吗？",
                  en: "There are running processes in the terminal. Closing will terminate them. Are you sure?"
                }) : "终端中有正在运行的进程，关闭将强行终止该进程，确定要关闭吗？",
                confirm: async () => {
                  if (originalCancel) {
                    await originalCancel(dom, closeFn, tabData, event)
                  } else {
                    closeFn()
                  }
                },
                cancel: () => { }
              })
              return true // 阻断默认关闭
            }
          } catch (e) {
            console.error("[terminal] checkRunningProcess error:", e)
          }
          if (originalCancel) {
            return await originalCancel(dom, closeFn, tabData, event)
          }
          closeFn()
        }
      }
    },
    onremove() {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (term) term.dispose()
      currentDom = null
      terminalData.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      const { data } = vnode.attrs
      const terminalFont = (settingData.options?.get("global_terminalFontFamily") || 'Fira Code, Menlo, Monaco, "Courier New"') + ', monospace'
      return m(".terminal-wrapper",
        {
          style: {
            width: "100%",
            height: "100%",
            padding: "0.8rem 1.5rem",
            boxSizing: "border-box",
            overflow: "hidden",
            background: getColor("brown_5").back
          }
        },
        m(".terminal-host", {
          style: {
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
            fontFamily: terminalFont,
            fontSize: "14px",
            lineHeight: "1.2"
          },
          oncreate({ dom }) {
            if (!Terminal || !FitAddon) {
              dom.textContent = "[错误] xterm 依赖未注入"
              return
            }

            currentDom = dom

            term = new Terminal({
              fontFamily: terminalFont,
              fontSize: 14,
              lineHeight: 1.2,
              cursorBlink: true,
              convertEol: true,
              theme: {
                background: getColor("brown_5").back,
                foreground: getColor("brown_5").front,
                cursor: getColor("pink_1").back
              }
            })

            term.onData((chunk) => {
              ioSocket.socket.emit("chat", { tid: appId, chunk })
            })

            fitAddon = new FitAddon()
            term.loadAddon(fitAddon)
            term.open(dom)

            // 下一帧对齐尺寸，避免首帧容器宽高为 0 时计算失真
            requestAnimationFrame(() => {
              syncSize(dom)
            })

            // 监听内层宿主容器尺寸变动，自动调整列宽行高并同步 PTY
            resizeObserver = new ResizeObserver(() => {
              requestAnimationFrame(() => syncSize(dom))
            })
            resizeObserver.observe(dom)

            // 恢复历史内容并且异步获取最新完整内容，保持 raw: true 原始流解析
            if (data?.content) {
              term.write(data.content)
            }
            settingData.fnCall("appDispatch", [appId, "getContent", { limit: 1000, raw: true }]).then((res) => {
              if (res?.ok && res?.data?.content && term) {
                term.clear()
                term.write(res.data.content)
                requestAnimationFrame(() => syncSize(dom))
              }
            })
          }
        })
      )
    }
  }
}
