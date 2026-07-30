import imageViewerData from "./imageViewerData.js"
import svgIcons from "./frontendModules/svgIcons.js"

export default (
  {
    appId,
    m,
    Notice,
    ioSocket,
    commonData,
    getColor,
    Box,
    Tag,
    trs,
    settingData
  }
) => {
  let initialized = false
  let currentImagePath = ""
  let currentImageDataUri = ""
  let fileName = ""
  let mimeType = ""
  let fileSize = 0
  let mtime = null
  let sisterImages = []

  let scale = 1.0
  let rotate = 0
  let flipH = false
  let flipV = false
  let isCheckerboard = true

  let isDragging = false
  let startPointerX = 0
  let startPointerY = 0
  let translateX = 0
  let translateY = 0

  let windowPointerMoveHandler = null
  let windowPointerUpHandler = null

  const resetView = () => {
    scale = 1.0
    rotate = 0
    flipH = false
    flipV = false
    translateX = 0
    translateY = 0
  }

  const loadLocalImage = async (filePath) => {
    try {
      if (!filePath) return
      const res = await settingData.fnCall("appDispatch", [
        appId,
        "openImage",
        {
          filePath
        }
      ])
      if (res && res.ok && res.data) {
        currentImagePath = res.data.filePath
        currentImageDataUri = res.data.dataUri
        fileName = res.data.fileName
        mimeType = res.data.mimeType
        fileSize = res.data.fileSize
        mtime = res.data.mtime
        sisterImages = res.data.sisterImages || []
        resetView()

        settingData.fnCall("appUpdateData", [
          appId,
          {
            currentImagePath
          }
        ])
        m.redraw()
      } else {
        Notice.launch({
          msg: res?.msg || trs("图片查看器/错误/无法读取图片", { cn: "无法读取图片文件", en: "Failed to load image file" })
        })
      }
    } catch (err) {
      console.error("[imageViewer Frontend loadLocalImage Error]", err)
      Notice.launch({
        msg: trs("图片查看器/错误/读取图片失败", { cn: "读取图片失败: ", en: "Failed to load image: " }) + err.message
      })
    }
  }

  const pickImageFile = async () => {
    try {
      const dialogRes = await settingData.fnCall("appOpenDialog", [
        {
          title: trs("图片查看器/标题/选择图片文件", { cn: "选择图片文件", en: "Select Image File" }),
          filters: [
            {
              name: trs("图片查看器/过滤器/支持的图片格式", { cn: "支持的图片格式", en: "Supported Image Formats" }),
              extensions: [
                "png",
                "jpg",
                "jpeg",
                "webp",
                "gif",
                "svg",
                "bmp"
              ]
            }
          ]
        }
      ])
      if (dialogRes && dialogRes.ok && dialogRes.filePath) {
        await loadLocalImage(dialogRes.filePath)
      }
    } catch (err) {
      console.error("[imageViewer Frontend pickImageFile Error]", err)
      Notice.launch({
        msg: err.message
      })
    }
  }

  const navigateSisterImage = (dir) => {
    try {
      if (!sisterImages || sisterImages.length <= 1 || !currentImagePath) return
      const curIdx = sisterImages.indexOf(currentImagePath)
      if (curIdx === -1) return
      let targetIdx = curIdx + dir
      if (targetIdx < 0) {
        targetIdx = sisterImages.length - 1
      } else if (targetIdx >= sisterImages.length) {
        targetIdx = 0
      }
      loadLocalImage(sisterImages[targetIdx])
    } catch (err) {
      console.error("[imageViewer navigateSisterImage Error]", err)
    }
  }

  const showImageDetailsNotice = () => {
    try {
      if (!currentImagePath) {
        Notice.launch({
          tip: trs("图片查看器/提示/提示", { cn: "提示", en: "Tip" }),
          msg: trs("图片查看器/提示/请先打开图片", { cn: "请先打开一张图片文件", en: "Please open an image file first" })
        })
        return
      }

      Notice.launch({
        tip: trs("图片查看器/面板/文件属性", { cn: "图片属性", en: "Image Details" }),
        msg: `${trs("图片查看器/属性/文件名", { cn: "文件名", en: "File Name" })}: ${fileName}\n` +
          `${trs("图片查看器/属性/文件大小", { cn: "文件大小", en: "File Size" })}: ${(fileSize / 1024).toFixed(1)} KB\n` +
          `${trs("图片查看器/属性/格式", { cn: "格式 (MIME)", en: "MIME Type" })}: ${mimeType}\n` +
          `${trs("图片查看器/属性/绝对路径", { cn: "绝对路径", en: "Absolute Path" })}: ${currentImagePath}`,
        confirm() {
          return undefined
        }
      })
    } catch (err) {
      console.error("[imageViewer showImageDetailsNotice Error]", err)
    }
  }

  const instanceInterface = {
    onDispatch: (
      msg,
      callback
    ) => {
      try {
        if (msg.action === "loadImage") {
          currentImagePath = msg.args.filePath
          currentImageDataUri = msg.args.dataUri
          fileName = msg.args.fileName
          mimeType = msg.args.mimeType
          fileSize = msg.args.fileSize
          mtime = msg.args.mtime
          sisterImages = msg.args.sisterImages || []
          resetView()

          settingData.fnCall("appUpdateData", [
            appId,
            {
              currentImagePath
            }
          ])
          m.redraw()
        }
        if (callback) {
          callback({
            ok: true,
            msg: trs("图片查看器/消息/成功接收命令", { cn: "指令处理成功", en: "Command processed successfully" })
          })
        }
      } catch (err) {
        console.error("[imageViewer instanceInterface Error]", err)
        if (callback) {
          callback({
            ok: false,
            msg: err.message
          })
        }
      }
    }
  }

  const init = () => {
    try {
      imageViewerData.addTool(
        "commonData",
        commonData
      )
      imageViewerData.registerInstances(
        appId,
        instanceInterface
      )
      if (commonData.registerApp) {
        commonData.registerApp(
          appId,
          imageViewerData
        )
      }

      windowPointerMoveHandler = (e) => {
        if (!isDragging) return
        translateX += e.clientX - startPointerX
        translateY += e.clientY - startPointerY
        startPointerX = e.clientX
        startPointerY = e.clientY
        m.redraw()
      }

      windowPointerUpHandler = () => {
        if (isDragging) {
          isDragging = false
          m.redraw()
        }
      }

      window.addEventListener("pointermove", windowPointerMoveHandler)
      window.addEventListener("pointerup", windowPointerUpHandler)
      window.addEventListener("pointercancel", windowPointerUpHandler)
    } catch (err) {
      console.error("[imageViewer init Error]", err)
    }
  }
  init()

  // 统一的 Tag 胶囊按钮基础样式
  const btnTagStyle = {
    height: "2.2rem",
    minHeight: "2.2rem",
    borderRadius: "1.1rem",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.4rem",
    padding: "0 0.8rem",
    whiteSpace: "nowrap",
    flexShrink: 0
  }

  return {
    oninit(vnode) {
      try {
        if (!initialized && vnode.attrs.data && vnode.attrs.data.currentImagePath) {
          initialized = true
          loadLocalImage(vnode.attrs.data.currentImagePath)
        }
      } catch (err) {
        console.error("[imageViewer oninit Error]", err)
      }
    },

    onremove() {
      try {
        imageViewerData.unregisterInstances(
          appId,
          commonData
        )
        if (windowPointerMoveHandler) {
          window.removeEventListener("pointermove", windowPointerMoveHandler)
        }
        if (windowPointerUpHandler) {
          window.removeEventListener("pointerup", windowPointerUpHandler)
          window.removeEventListener("pointercancel", windowPointerUpHandler)
        }
      } catch (err) {
        console.error("[imageViewer onremove Error]", err)
      }
    },

    view(vnode) {
      try {
        const primaryColor = getColor("main")
        const neutralColor = getColor("gray_3")
        const bgColor = getColor("gray_4")

        return m("",
          {
            style: {
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              background: bgColor.back,
              color: bgColor.front,
              userSelect: "none",
              overflow: "hidden",
              position: "relative"
            },
            onwheel: (e) => {
              e.preventDefault()
              if (e.deltaY < 0) {
                scale = Math.min(scale * 1.15, 15.0)
              } else {
                scale = Math.max(scale / 1.15, 0.1)
              }
              m.redraw()
            },
            ondragover: (e) => {
              e.preventDefault()
            },
            ondrop: (e) => {
              e.preventDefault()
              if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const dropFile = e.dataTransfer.files[0]
                if (dropFile && dropFile.path) {
                  loadLocalImage(dropFile.path)
                }
              }
            }
          },
          [
            // 扁平响应式 Flex 顶栏工具栏（主按钮高亮，常规按钮柔和中性色）
            m("",
              {
                style: {
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: "0.4rem",
                  background: primaryColor.back + "12",
                  borderBottom: "0.1rem solid " + primaryColor.back + "22",
                  backdropFilter: "blur(1rem)",
                  zIndex: 20
                }
              },
              [
                // 主核心按钮: 打开图片 (高亮 main 蓝色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: primaryColor.back,
                      color: primaryColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        pickImageFile()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("FolderOpen", { size: "1.1rem", fill: primaryColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "600",
                          fontSize: "0.95rem"
                        }
                      },
                      trs("图片查看器/按钮/打开图片", { cn: "打开图片", en: "Open Image" })
                    )
                  ]
                ),

                // 文件名展示 Tag (中性高对比度背景)
                fileName
                  ? m(Tag,
                    {
                      styleExt: {
                        ...btnTagStyle,
                        background: neutralColor.back,
                        color: neutralColor.front,
                        maxWidth: "11rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flexShrink: 1,
                        fontSize: "0.85rem",
                        fontWeight: "600"
                      }
                    },
                    fileName
                  )
                  : null,

                // 放大 Tag (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        scale = Math.min(scale * 1.2, 15.0)
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("ZoomIn", { size: "1.1rem", fill: neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/放大", { cn: "放大", en: "Zoom In" })
                    )
                  ]
                ),

                // 缩小 Tag (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        scale = Math.max(scale / 1.2, 0.1)
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("ZoomOut", { size: "1.1rem", fill: neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/缩小", { cn: "缩小", en: "Zoom Out" })
                    )
                  ]
                ),

                // 缩放比例 % Tag (点击重置 1:1) (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front,
                      fontWeight: "600",
                      fontSize: "0.9rem"
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        resetView()
                        m.redraw()
                      }
                    }
                  },
                  (scale * 100).toFixed(0) + "% " + trs("图片查看器/按钮/重置", { cn: "重置", en: "Reset" })
                ),

                // 向左旋转 90° Tag (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        rotate = (rotate - 90) % 360
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("RotateLeft", { size: "1.1rem", fill: neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/左转", { cn: "左转 90°", en: "Left 90°" })
                    )
                  ]
                ),

                // 向右旋转 90° Tag (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        rotate = (rotate + 90) % 360
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("RotateRight", { size: "1.1rem", fill: neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/右转", { cn: "右转 90°", en: "Right 90°" })
                    )
                  ]
                ),

                // 水平翻转 Tag (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        flipH = !flipH
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("FlipH", { size: "1.1rem", fill: neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/水平镜像", { cn: "水平镜像", en: "Flip H" })
                    )
                  ]
                ),

                // 垂直翻转 Tag (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        flipV = !flipV
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("FlipV", { size: "1.1rem", fill: neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/垂直镜像", { cn: "垂直镜像", en: "Flip V" })
                    )
                  ]
                ),

                // 切换背景 (暗黑 / 透明棋盘格) Tag (激活时高亮 main 蓝，非激活使用中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: isCheckerboard ? primaryColor.back : neutralColor.back,
                      color: isCheckerboard ? primaryColor.front : neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        isCheckerboard = !isCheckerboard
                        m.redraw()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("Grid", { size: "1.1rem", fill: isCheckerboard ? primaryColor.front : neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/棋盘格", { cn: "棋盘格", en: "Grid" })
                    )
                  ]
                ),

                // 文件元数据 Notice 触发 Tag (常规中性色)
                m(Tag,
                  {
                    styleExt: {
                      ...btnTagStyle,
                      background: neutralColor.back,
                      color: neutralColor.front
                    },
                    isBtn: true,
                    ext: {
                      onclick: () => {
                        showImageDetailsNotice()
                      }
                    }
                  },
                  [
                    m.trust(svgIcons.getSvg("Info", { size: "1.1rem", fill: neutralColor.front })),
                    m("span",
                      {
                        style: {
                          fontWeight: "500",
                          fontSize: "0.9rem"
                        }
                      },
                      trs("图片查看器/按钮/图片属性", { cn: "图片属性", en: "Details" })
                    )
                  ]
                )
              ]
            ),

            // 主工作区 Image View Canvas
            m("",
              {
                style: {
                  flex: "1",
                  minHeight: "30rem",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  backgroundImage: isCheckerboard
                    ? "linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)"
                    : "none",
                  backgroundSize: "2rem 2rem",
                  backgroundPosition: "0 0, 0 1rem, 1rem -1rem, -1rem 0",
                  backgroundColor: isCheckerboard ? "#111" : "#000",
                  cursor: isDragging ? "grabbing" : "grab"
                },
                onpointerdown: (e) => {
                  if (!currentImageDataUri) return
                  isDragging = true
                  startPointerX = e.clientX
                  startPointerY = e.clientY
                }
              },
              [
                // 未选择图片时的欢迎空白态
                !currentImageDataUri
                  ? m("",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "1.2rem",
                        opacity: "0.6",
                        padding: "1rem",
                        textAlign: "center"
                      }
                    },
                    [
                      m.trust(svgIcons.getSvg("Pic", { size: "4.5rem", fill: primaryColor.back })),
                      m("span",
                        {
                          style: {
                            fontSize: "1.2rem",
                            fontWeight: "500"
                          }
                        },
                        trs("图片查看器/提示/拖拽或打开图片", { cn: "拖拽图片至此处，或点击顶部「打开图片」按钮", en: "Drag image here or click 'Open Image' button" })
                      )
                    ]
                  )
                  : m("img",
                    {
                      src: currentImageDataUri,
                      style: {
                        transform: `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                        transition: isDragging ? "none" : "transform 0.15s ease-out",
                        maxHeight: "85vh",
                        maxWidth: "85vw",
                        objectFit: "contain",
                        pointerEvents: "none"
                      }
                    }
                  ),

                // 左右切换控制键 Tag
                sisterImages && sisterImages.length > 1
                  ? [
                    m("",
                      {
                        style: {
                          position: "absolute",
                          left: "1.2rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          zIndex: 10
                        }
                      },
                      m(Tag,
                        {
                          styleExt: {
                            ...btnTagStyle,
                            height: "2.8rem",
                            minHeight: "2.8rem",
                            borderRadius: "1.4rem",
                            background: primaryColor.back + "ee",
                            color: primaryColor.front,
                            padding: "0 0.8rem"
                          },
                          isBtn: true,
                          ext: {
                            onclick: (e) => {
                              e.stopPropagation()
                              navigateSisterImage(-1)
                            }
                          }
                        },
                        m.trust(svgIcons.getSvg("Left", { size: "1.6rem", fill: primaryColor.front }))
                      )
                    ),
                    m("",
                      {
                        style: {
                          position: "absolute",
                          right: "1.2rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          zIndex: 10
                        }
                      },
                      m(Tag,
                        {
                          styleExt: {
                            ...btnTagStyle,
                            height: "2.8rem",
                            minHeight: "2.8rem",
                            borderRadius: "1.4rem",
                            background: primaryColor.back + "ee",
                            color: primaryColor.front,
                            padding: "0 0.8rem"
                          },
                          isBtn: true,
                          ext: {
                            onclick: (e) => {
                              e.stopPropagation()
                              navigateSisterImage(1)
                            }
                          }
                        },
                        m.trust(svgIcons.getSvg("Right", { size: "1.6rem", fill: primaryColor.front }))
                      )
                    )
                  ]
                  : null
              ]
            )
          ]
        )
      } catch (err) {
        console.error("[imageViewer view Error]", err)
        return m("", "渲染异常喵: " + err.message)
      }
    }
  }
}
