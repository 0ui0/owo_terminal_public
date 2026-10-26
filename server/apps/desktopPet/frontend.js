import desktopPetData from "./desktopPetData.js"

export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box, Tag, iconPark, getColor, trs, sysMenu }) => {
  let isClickThroughBool = true
  let customActionStr = ""
  let handlePointerMove = null

  const instanceInterface = {
    onDispatch(msg, callback) {
      if (msg.action === "updateAction") {
        customActionStr = msg.args?.action || ""
        m.redraw()
        if (callback) callback({ ok: true })
      }
    }
  }

  return {
    async oninit({ attrs }) {
      desktopPetData.registerInstances(appId, instanceInterface)
      if (commonData?.registerApp) {
        commonData.registerApp(appId, desktopPetData)
      }

      // 💡 双模形态自适应：若是脱壳独立原生子窗口，自动激活透明桌宠形态
      const noticeConfig = attrs.noticeConfig
      if (window.opener && noticeConfig) {
        noticeConfig.transparentContent = true
        noticeConfig.isMini = true
        noticeConfig.useFloatBall = true
        noticeConfig.hideBtn = 2
        const winId = m.route.param("winId") || noticeConfig._winConfig?.id
        if (winId) {
          settingData.fnCall("sysWinControl", ["pin", winId])
          settingData.fnCall("sysWinControl", ["ignoreMouse", winId])
        }
      }

      // 💡 穿透开关控制
      const toggleClickThrough = () => {
        isClickThroughBool = !isClickThroughBool
        const winId = m.route.param("winId") || noticeConfig?._winConfig?.id
        if (window.opener && winId) {
          settingData.fnCall("sysWinControl", [isClickThroughBool ? "ignoreMouse" : "unignoreMouse", winId])
        }
        m.redraw()
      }

      // 💡 唤起【视图】下拉菜单（对齐 editor 与系统菜单规范）
      const openViewMenu = (e) => {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation()
        const target = e?.currentTarget || e?.target
        const rect = target && typeof target.getBoundingClientRect === "function" ? target.getBoundingClientRect() : { left: 10, bottom: 40 }
        const x = Math.max(10, rect.left)
        const y = rect.bottom + 6

        Notice.launch({
          newWindow: true,
          sign: "desktop_pet_menu_view_" + appId,
          win: { x, y },
          tip: "视图",
          width: 0,
          closeOnClickOutside: true,
          hideBtn: 2,
          content: {
            view: (v) => m(".desktop-pet-menu-view", [
              m(sysMenu, {
                menuItems: [
                  {
                    name: "点击穿透",
                    shortcut: isClickThroughBool ? "开启" : "关闭",
                    keepOpen: true,
                    onclick: () => {
                      toggleClickThrough()
                    }
                  }
                ]
              })
            ])
          }
        })
      }

      // 💡 自定义菜单栏：标准【视图】下拉菜单入口（参考 editorapp）
      if (noticeConfig) {
        noticeConfig.titleBar = {
          view: () => m("", {
            onpointerdown: (e) => e.stopPropagation(),
            style: {
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              height: "100%"
            }
          }, [
            m(Box, {
              tagName: "div",
              isBtn: true,
              color: "main",
              noValue: true,
              style: {
                padding: "0.3rem 0.8rem",
                borderRadius: "3rem",
                fontSize: "1.2rem",
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                boxShadow: "0 0.2rem 0.6rem rgba(0, 0, 0, 0.15)",
                "-webkit-app-region": "no-drag",
                userSelect: "none"
              },
              onclick: (dom, e) => openViewMenu(e || dom)
            }, "视图")
          ])
        }
      }

      // 穿透状态下的智能区域防锁死感应（滑入UI时恢复点击，滑出UI时穿透桌面）
      let isIgnoredState = true
      let pendingRpc = false

      const updateIgnoreState = async (shouldIgnore) => {
        if (shouldIgnore === isIgnoredState || pendingRpc) return
        const winId = m.route.param("winId") || noticeConfig?._winConfig?.id
        if (!winId || !window.opener) return
        isIgnoredState = shouldIgnore
        pendingRpc = true
        try {
          await settingData.fnCall("sysWinControl", [shouldIgnore ? "ignoreMouse" : "unignoreMouse", winId])
        } finally {
          pendingRpc = false
        }
      }

      handlePointerMove = (e) => {
        if (!isClickThroughBool || !window.opener) return
        const winId = m.route.param("winId") || noticeConfig?._winConfig?.id
        const isInteractive = Boolean(
          e.target && typeof e.target.closest === "function" && (
            e.target.closest(".float-ball-capsule, .float-ball-menu-box, .control-panel-box, .desktop-pet-menu-view, .owo-nav-bar, .win-btn, .tab-item, [class*='sysMenu'], [class*='sys-menu']") ||
            (() => {
              const winBox = e.target.closest(".window-box")
              return Boolean(winBox && winId && winBox.getAttribute("data-win-id") !== winId)
            })()
          )
        )
        updateIgnoreState(!isInteractive)
      }
      document.addEventListener("pointermove", handlePointerMove)

      // 确保独立子窗口下同步拉取全局角色配置与数据
      try {
        await comData.pullData()
        if (settingData.options?.pull) {
          await settingData.options.pull()
        }
      } catch (e) {
        console.warn("[DesktopPet pullData error]", e)
      }
      m.redraw()
    },

    onremove() {
      desktopPetData.unregisterInstances(appId, commonData)
      if (handlePointerMove) {
        document.removeEventListener("pointermove", handlePointerMove)
      }
      const winId = m.route.param("winId")
      if (window.opener && winId) {
        settingData.fnCall("sysWinControl", ["unignoreMouse", winId])
      }
    },

    view({ attrs }) {
      const comDataObj = comData.data.get()
      const playFacesObj = comDataObj?.playFaces
      const defaultPetStr = comDataObj?.defaultPet || "default"
      // 只要用户未在设置里显式关闭(0)，就坚决保持动态视频立绘开启
      const isActorOnBool = settingData.options?.get ? (settingData.options.get("global_actorSwitch") !== 0) : true

      // 目标视频播放源 (优先特定动作，其次系统流式动作)
      const currentVideoSrc = (customActionStr || playFacesObj?.current)
        ? `./statics/petPkgs/${defaultPetStr}/pet2/${customActionStr || playFacesObj.current}.webm`
        : ""

      return m(".desktop-pet-app", {
        style: {
          width: "100%",
          height: "100%",
          minHeight: window.opener ? "100%" : "560px",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: "center",
          overflow: "hidden",
          userSelect: "none",
          "-webkit-user-select": "none",
        }
      }, [
        // 1. 角色动效立绘舞台（固定包裹层，防止单节点与列表数组突变导致Mithril Diff撕裂removeChild报错）
        m(".actor-stage", {
          key: "actor-stage",
          style: {
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            pointerEvents: "none"
          }
        }, [
          isActorOnBool ? (
            currentVideoSrc ? m("video", {
                key: `cur-${currentVideoSrc}`,
                style: {
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center bottom",
                  pointerEvents: "none"
                },
                controls: false,
                muted: true,
                autoplay: true,
                playsinline: true,
                src: currentVideoSrc,
                oncreate({ dom }) {
                  dom.play().catch(e => console.warn("[DesktopPet play current]", e))
                },
                onended: async () => {
                  customActionStr = ""
                  try {
                    await comData.data.edit((data) => {
                      if (data.playFaces) data.playFaces.current = ""
                    })
                    m.redraw()
                  } catch (err) {
                    console.warn("[DesktopPet clear current]", err)
                  }
                },
                onerror: async () => {
                  customActionStr = ""
                  try {
                    await comData.data.edit((data) => {
                      if (data.playFaces) data.playFaces.current = ""
                    })
                    m.redraw()
                  } catch (err) {
                    console.warn("[DesktopPet clear current error]", err)
                  }
                }
              }) : (
              (playFacesObj?.list || []).map((faceStr, idxNum) => {
                const isCurrentPlaying = idxNum === (playFacesObj.index || 0)
                return m("video", {
                  key: `lst-${defaultPetStr}-${faceStr}-${idxNum}`,
                  style: {
                    width: "100%",
                    height: "100%",
                    position: "absolute",
                    top: "0",
                    left: "0",
                    objectFit: "contain",
                    objectPosition: "center bottom",
                    display: isCurrentPlaying ? "block" : "none",
                    pointerEvents: "none"
                  },
                  controls: false,
                  muted: true,
                  autoplay: isCurrentPlaying,
                  playsinline: true,
                  src: `/statics/petPkgs/${defaultPetStr}/pet2/${faceStr}.webm`,
                  oncreate({ dom }) {
                    if (isCurrentPlaying) dom.play().catch(e => console.warn("[DesktopPet play list]", e))
                  },
                  onupdate({ dom }) {
                    if (isCurrentPlaying) dom.play().catch(e => console.warn("[DesktopPet play list update]", e))
                  },
                  onended: async () => {
                    try {
                      await comData.data.edit((data) => {
                        if (data.playFaces && data.playFaces.list?.length) {
                          data.playFaces.index = ((data.playFaces.index || 0) + 1) % data.playFaces.list.length
                        }
                      })
                      m.redraw()
                    } catch (err) {
                      console.warn("[DesktopPet auto-advance]", err)
                    }
                  },
                  onerror: async () => {
                    try {
                      await comData.data.edit((data) => {
                        if (data.playFaces && data.playFaces.list?.length) {
                          data.playFaces.index = ((data.playFaces.index || 0) + 1) % data.playFaces.list.length
                        }
                      })
                      m.redraw()
                    } catch (err) {
                      console.warn("[DesktopPet skip]", err)
                    }
                  }
                })
              })
            )
          ) : m("img", {
              key: "static-img",
              src: `/statics/petPkgs/${defaultPetStr}/pet/${comDataObj?.faceAction || "smile"}.png`,
              style: {
                width: "80%",
                height: "80%",
                objectFit: "contain",
                objectPosition: "center bottom",
                pointerEvents: "none"
              }
            })
        ]),

        // 2. 窗口物理视窗右下角真实边界尺寸小标记
        m(".pet-boundary-corner", {
          key: "pet-boundary-corner",
          style: {
            position: "fixed",
            right: "6px",
            bottom: "6px",
            zIndex: 1000001,
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 6px",
            borderRadius: "10px",
            background: "rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "rgba(255, 255, 255, 0.7)",
            fontSize: "10px",
            fontFamily: "monospace",
            userSelect: "none",
            pointerEvents: "none",
            opacity: 0.75
          }
        }, [
          m("span", `${window.innerWidth} × ${window.innerHeight}`),
          m("span", { style: { marginLeft: "3px", fontSize: "11px", fontWeight: "bold" } }, "⌟")
        ])
      ])
    }
  }
}
