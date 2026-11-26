import m from "/@npm/mithril.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import getAppIconUrl from "../common/getAppIconUrl.js"
import { trs } from "../common/i18n.js"
import desktopData from "./DesktopData.js"
import ClockWidget from "./ClockWidget.js"

export default () => {
  return {
    view({ attrs }) {
      const {
        tile,
        unitSize,
        isDragging,
        isDropTarget,
        isProxy,
        onPointerDown,
        onContextMenu,
        onToggleWidgetSize,
        onRemoveWidget,
        onUnpackFolder
      } = attrs

      const isFolder = Boolean(tile.isFolder)
      const isWidget = Boolean(tile.isWidget)
      const isEditing = desktopData.editingMode
      const w = isWidget ? (tile.w || 2) : 1
      const h = isWidget ? (tile.h || 2) : 1
      const gap = 14

      const pixelW = Math.max(unitSize * w - gap, 44)
      const pixelH = Math.max(unitSize * h - gap, 44)
      const posX = (tile.col || 0) * unitSize
      const posY = (tile.row || 0) * unitSize
      const iconBoxSize = Math.min(Math.floor(pixelW * 0.72), 64)

      const baseTileStyle = isProxy
        ? {
          width: `${pixelW}px`,
          height: `${pixelH}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          userSelect: "none",
          "-webkit-user-select": "none",
          touchAction: "none"
        }
        : {
          position: "absolute",
          top: "0",
          left: "0",
          width: `${pixelW}px`,
          height: `${pixelH}px`,
          transform: `translate3d(${posX}px, ${posY}px, 0)`,
          transition: isDragging ? "none" : "transform 0.3s ease",
          zIndex: isDragging ? 10 : (isDropTarget ? 100 : 1),
          opacity: isDragging ? 0.25 : 1,
          userSelect: "none",
          "-webkit-user-select": "none",
          touchAction: "none",
          cursor: isEditing ? "grab" : "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start"
        }

      const jiggleStyle = isEditing && !isDragging && !isProxy
        ? {
          animation: "owoDesktopJiggle 0.26s infinite ease-in-out alternate",
          animationDelay: `${(((tile.col || 0) + (tile.row || 0)) % 4) * 0.06}s`
        }
        : {}

      // ─── 1. 小组件磁贴（当前支持时钟小组件，可扩展） ───
      if (isWidget) {
        return m(
          "",
          {
            style: isProxy
              ? {
                width: `${pixelW}px`,
                height: `${pixelH}px`,
                userSelect: "none",
                "-webkit-user-select": "none",
                touchAction: "none"
              }
              : {
                ...baseTileStyle,
                display: "block"
              },
            onpointerdown: (e) => {
              if (onPointerDown) {
                onPointerDown(e, tile)
              }
            },
            oncontextmenu: (e) => {
              if (onContextMenu) {
                onContextMenu(e, tile)
              }
            }
          },
          [
            m(
              "",
              {
                style: {
                  width: "100%",
                  height: "100%",
                  position: "relative",
                  ...jiggleStyle
                }
              },
              [
                m(
                  "",
                  {
                    style: {
                      width: "100%",
                      height: "100%",
                      borderRadius: `${getSize(4)}rem`,
                      background: (isEditing || isProxy) ? getColor("gray_4").back : "transparent",
                      color: (isEditing || isProxy) ? getColor("gray_4").front : getColor("gray_1").front,
                      border: (isEditing || isProxy) ? `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)` : "none",
                      boxShadow: (isEditing || isProxy) ? `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.08)` : "none",
                      padding: `${getSize(3)}rem`,
                      boxSizing: "border-box",
                      overflow: "hidden"
                    }
                  },
                  [
                    tile.widgetType === "clock"
                      ? m(ClockWidget, {
                        w,
                        h,
                        isTransparent: !(isEditing || isProxy)
                      })
                      : m(
                        "",
                        {
                          style: {
                            fontSize: `${getSize(3)}rem`,
                            color: (isEditing || isProxy) ? getColor("gray_4").front : getColor("gray_1").front
                          }
                        },
                        tile.name
                      )
                  ]
                ),

                // 编辑态左上角：移除小组件按钮（位于 overflow 容器外，绝不裁切）
                isEditing && !isProxy
                  ? m(
                    "",
                    {
                      title: trs("桌面/操作/移除小组件", {
                        cn: "移除小组件",
                        en: "Remove Widget"
                      }),
                      style: {
                        position: "absolute",
                        top: `-${getSize(2)}rem`,
                        left: `-${getSize(2)}rem`,
                        width: `${getSize(6)}rem`,
                        height: `${getSize(6)}rem`,
                        borderRadius: "50%",
                        background: getColor("pink_1").back,
                        color: getColor("pink_1").front,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.15)`
                      },
                      onpointerdown: (e) => e.stopPropagation(),
                      onclick: (e) => {
                        e.stopPropagation()
                        if (onRemoveWidget) {
                          onRemoveWidget(tile.id)
                        }
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon("Minus", {
                        fill: getColor("pink_1").front,
                        size: `${getSize(4)}rem`
                      }))
                    ]
                  )
                  : null,

                // 编辑态右上角：切换小组件尺寸按钮
                isEditing && !isProxy
                  ? m(
                    "",
                    {
                      title: trs("桌面/操作/切换小组件尺寸", {
                        cn: "切换尺寸",
                        en: "Toggle Size"
                      }),
                      style: {
                        position: "absolute",
                        top: `-${getSize(2)}rem`,
                        right: `-${getSize(2)}rem`,
                        width: `${getSize(6)}rem`,
                        height: `${getSize(6)}rem`,
                        borderRadius: "50%",
                        background: getColor("main").back,
                        color: getColor("main").front,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.15)`
                      },
                      onpointerdown: (e) => e.stopPropagation(),
                      onclick: (e) => {
                        e.stopPropagation()
                        if (onToggleWidgetSize) {
                          onToggleWidgetSize(tile.id)
                        }
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon("InternalExpansion", {
                        fill: getColor("main").front,
                        size: `${getSize(4)}rem`
                      }))
                    ]
                  )
                  : null
              ]
            )
          ]
        )
      }

      // ─── 2. iOS 文件夹（1x1，内嵌 3x3 缩略图矩阵） ───
      if (isFolder) {
        const children = Array.isArray(tile.children) ? tile.children : []
        return m(
          "",
          {
            style: baseTileStyle,
            onpointerdown: (e) => {
              if (onPointerDown) {
                onPointerDown(e, tile)
              }
            },
            oncontextmenu: (e) => {
              if (onContextMenu) {
                onContextMenu(e, tile)
              }
            }
          },
          [
            m(
              "",
              {
                style: {
                  width: `${iconBoxSize}px`,
                  height: `${iconBoxSize}px`,
                  position: "relative",
                  flexShrink: 0,
                  transform: isDropTarget ? "scale(1.08)" : "scale(1)",
                  transition: "transform 0.2s ease",
                  ...jiggleStyle
                }
              },
              [
                m(
                  "",
                  {
                    style: {
                      width: "100%",
                      height: "100%",
                      borderRadius: "22.5%",
                      background: isDropTarget ? getColor("main").back : getColor("gray_3").back,
                      color: isDropTarget ? getColor("main").front : getColor("gray_3").front,
                      border: isDropTarget
                        ? `${getSize(0.5)}rem solid ${getColor("main").front}`
                        : `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                      boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.08)`,
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gridTemplateRows: "repeat(3, 1fr)",
                      gap: `${getSize(0.5)}rem`,
                      padding: `${getSize(1)}rem`,
                      boxSizing: "border-box",
                      overflow: "hidden"
                    }
                  },
                  children.slice(0, 9).map((child, idx) => {
                    if (idx === 8 && children.length > 9) {
                      return m(
                        "",
                        {
                          key: "more_badge",
                          style: {
                            width: "100%",
                            height: "100%",
                            borderRadius: "22.5%",
                            background: getColor("gray_2").back,
                            color: getColor("gray_2").front,
                            fontSize: `${getSize(2)}rem`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }
                        },
                        `+${children.length - 8}`
                      )
                    }
                    return m(
                      "img",
                      {
                        key: child.id,
                        src: getAppIconUrl(child.appId, child.icon),
                        onerror: (e) => {
                          e.target.src = "/statics/navbar/program.svg"
                        },
                        style: {
                          width: "100%",
                          height: "100%",
                          borderRadius: "22.5%",
                          objectFit: "cover",
                          pointerEvents: "none"
                        }
                      }
                    )
                  })
                ),

                // 编辑态左上角：解散文件夹按钮（不删除 App，全部放回当前页）
                isEditing && !isProxy
                  ? m(
                    "",
                    {
                      title: trs("桌面/操作/解散文件夹", {
                        cn: "解散文件夹",
                        en: "Unpack Folder"
                      }),
                      style: {
                        position: "absolute",
                        top: `-${getSize(1.5)}rem`,
                        left: `-${getSize(1.5)}rem`,
                        width: `${getSize(5)}rem`,
                        height: `${getSize(5)}rem`,
                        borderRadius: "50%",
                        background: getColor("pink_1").back,
                        color: getColor("pink_1").front,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.15)`
                      },
                      onpointerdown: (e) => e.stopPropagation(),
                      onclick: (e) => {
                        e.stopPropagation()
                        if (onUnpackFolder) {
                          onUnpackFolder(tile.id)
                        }
                      }
                    },
                    [
                      m.trust(window.iconPark.getIcon("Minus", {
                        fill: getColor("pink_1").front,
                        size: `${getSize(3)}rem`
                      }))
                    ]
                  )
                  : null
              ]
            ),
            m(
              "span",
              {
                style: {
                  fontSize: `${getSize(3)}rem`,
                  lineHeight: `${getSize(4)}rem`,
                  color: getColor("gray_1").front,
                  marginTop: `${getSize(1)}rem`,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%"
                }
              },
              tile.name || trs("桌面/文件夹/默认名", {
                cn: "文件夹",
                en: "Folder"
              })
            )
          ]
        )
      }

      // ─── 3. 普通系统 App 图标（统一 1x1，不可删除，支持拖拽整理与合体文件夹） ───
      return m(
        "",
        {
          style: baseTileStyle,
          onpointerdown: (e) => {
            if (onPointerDown) {
              onPointerDown(e, tile)
            }
          },
          oncontextmenu: (e) => {
            if (onContextMenu) {
              onContextMenu(e, tile)
            }
          }
        },
        [
          m(
            "",
            {
              style: {
                width: `${iconBoxSize}px`,
                height: `${iconBoxSize}px`,
                position: "relative",
                flexShrink: 0,
                transform: isDropTarget ? "scale(1.08)" : "scale(1)",
                transition: "transform 0.2s ease",
                ...jiggleStyle
              }
            },
            [
              m(
                "",
                {
                  style: {
                    width: "100%",
                    height: "100%",
                    borderRadius: "22.5%",
                    overflow: "hidden",
                    background: getColor("gray_4").back,
                    border: isDropTarget
                      ? `${getSize(0.5)}rem solid ${getColor("main").back}`
                      : `${getSize(0.25)}rem solid rgba(0, 0, 0, 0.15)`,
                    boxShadow: isDropTarget
                      ? `0 ${getSize(1)}rem ${getSize(4)}rem rgba(0, 0, 0, 0.15)`
                      : `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0, 0, 0, 0.08)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }
                },
                [
                  m(
                    "img",
                    {
                      src: getAppIconUrl(tile.appId, tile.icon),
                      onerror: (e) => {
                        e.target.src = "/statics/navbar/program.svg"
                      },
                      style: {
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        pointerEvents: "none"
                      }
                    }
                  )
                ]
              )
            ]
          ),
          m(
            "span",
            {
              style: {
                fontSize: `${getSize(3)}rem`,
                lineHeight: `${getSize(4)}rem`,
                color: getColor("gray_1").front,
                marginTop: `${getSize(1)}rem`,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%"
              }
            },
            tile.name || "App"
          )
        ]
      )
    }
  }
}
