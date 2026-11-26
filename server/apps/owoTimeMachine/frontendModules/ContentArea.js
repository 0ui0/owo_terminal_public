export default {
  view: (vnode) => {
    const { m, Box, getColor, getSize, isValidPath, hash, relPath, files, history, selected, isSelecting, selectStart, selectEnd, rootName, repoPath, iconPark, onContextMenu, onPointerDown, onFileDragStart, onSnapshotDragStart, onOpen, onSelect, trs } = vnode.attrs;

    // 文件类型图标来源：与资源管理器 App 同一套 SVG 资源（已复制到本 App icons/ 目录）
    const getFileIconSrc = (name) => {
      if (name.endsWith("/")) return "/api/apps/owoTimeMachine/icons/folder.svg"
      const extStr = name.split(".").pop().toLowerCase()
      if (["js", "json", "css", "html", "coffee", "ts", "mjs"].includes(extStr)) return "/api/apps/owoTimeMachine/icons/file_code.svg"
      if (["md", "txt", "log", "owo"].includes(extStr)) return "/api/apps/owoTimeMachine/icons/file_text.svg"
      if (["png", "jpg", "jpeg", "gif", "svg", "ico", "icns", "webp"].includes(extStr)) return "/api/apps/owoTimeMachine/icons/file_image.svg"
      if (["mp4", "mp3", "wav", "avi", "mov", "flac"].includes(extStr)) return "/api/apps/owoTimeMachine/icons/file_media.svg"
      return "/api/apps/owoTimeMachine/icons/file_default.svg"
    }

    return m("",
      {
        style: {
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: `${getSize(3)}rem`,
          padding: `${getSize(3)}rem`,
          overflowY: "auto",
          alignContent: "flex-start",
          background: getColor('gray_4').back,
          color: getColor('gray_4').front,
          position: "relative"
        },
        oncontextmenu: (e) => {
          return onContextMenu(e);
        },
        onpointerdown: (e) => {
          return onPointerDown(e);
        },
        onpointerup: (e) => {
          if (vnode.attrs.onPointerUp) return vnode.attrs.onPointerUp(e);
        }
      },
      [
        // 框选指示器
        isSelecting ?
          m("",
            {
              style: {
                position: "absolute",
                left: Math.min(selectStart.x, selectEnd.x) + "px",
                top: Math.min(selectStart.y, selectEnd.y) + "px",
                width: Math.abs(selectEnd.x - selectStart.x) + "px",
                height: Math.abs(selectEnd.y - selectStart.y) + "px",
                background: getColor('main').back + '33',
                border: `${getSize(0.25)}rem solid ${getColor('main').front}`,
                pointerEvents: "none",
                zIndex: 10
              }
            }) : null,

        // 内容展示区
        !isValidPath ?
          m("",
            {
              style: {
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.55,
                flexDirection: "column"
              }
            },
            [
              m("", {
                style: {
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: `${getSize(2.5)}rem`
                }
              }, m.trust(iconPark.getIcon("Planet", {
                size: `${getSize(12)}rem`,
                fill: getColor("gray_4").front
              }))),
              m("", trs("时光机/内容区/尚未配置有效的工作路径", { cn: "尚未配置有效的工作路径", en: "No valid working path configured" }))
            ]) :
          (!hash ?
            // === 总览/时间轴模式 (快照文件夹) ===
            history.map((item) => {
              return m("",
                {
                  key: item.hash,
                  "data-name": item.hash,
                  draggable: true,
                  style: {
                    width: `${getSize(24)}rem`,
                    padding: `${getSize(2)}rem ${getSize(1)}rem`,
                    textAlign: "center",
                    cursor: "pointer",
                    borderRadius: `${getSize(8)}rem`,
                    color: selected.has(item.hash) ? getColor("main").front : getColor('gray_4').front,
                    background: selected.has(item.hash) ? getColor('main').back : "transparent",
                    border: `${getSize(0.25)}rem solid ${selected.has(item.hash) ? getColor('main').back : 'transparent'}`,
                    transition: "background 0.2s",
                    userSelect: "none",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: `${getSize(1)}rem`
                  },
                  ondragstart: (e) => {
                    return onSnapshotDragStart(e, item);
                  }
                },
                [
                  m("", {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: `${getSize(10)}rem`,
                      flexShrink: 0,
                      pointerEvents: "none"
                    }
                  }, m.trust(iconPark.getIcon("History", {
                    size: `${getSize(8)}rem`,
                    fill: selected.has(item.hash) ? getColor("main").front : getColor("main").back
                  }))),
                  m("",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        height: `${getSize(8)}rem`,
                        opacity: 0.65,
                        overflow: "hidden",
                        display: "-webkit-box",
                        "-webkit-line-clamp": "2",
                        "-webkit-box-orient": "vertical",
                        pointerEvents: "none"
                      }
                    },
                    item.msg || "无备注"),
                  m("",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        height: `${getSize(8)}rem`,
                        opacity: 0.8,
                        overflow: "hidden",
                        display: "-webkit-box",
                        "-webkit-line-clamp": "2",
                        "-webkit-box-orient": "vertical",
                        pointerEvents: "none"
                      }
                    },
                    rootName)
                ]);
            }) :
            // === 文件列表模式 ===
            files.map((file) => {
              return m("",
                {
                  key: relPath ? `${relPath}/${file.name}` : file.name,
                  "data-name": file.name,
                  draggable: true,
                  style: {
                    width: `${getSize(24)}rem`,
                    padding: `${getSize(2)}rem ${getSize(1)}rem`,
                    textAlign: "center",
                    cursor: "pointer",
                    borderRadius: `${getSize(8)}rem`,
                    color: selected.has(file.name) ? getColor("main").front : getColor('gray_4').front,
                    background: selected.has(file.name) ? getColor('main').back : "transparent",
                    border: `${getSize(0.25)}rem solid ${selected.has(file.name) ? getColor('main').back : 'transparent'}`,
                    transition: "background 0.2s",
                    userSelect: "none",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: `${getSize(1)}rem`
                  },
                  ondragstart: (e) => {
                    return onFileDragStart(e, file);
                  }
                },
                [
                  // 图标解析内联化
                  m("",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: `${getSize(10)}rem`,
                        marginBottom: `${getSize(1)}rem`,
                        flexShrink: 0,
                        pointerEvents: "none"
                      }
                    },
                    m("img", {
                      src: getFileIconSrc(file.name),
                      style: {
                        width: `${getSize(8)}rem`,
                        height: `${getSize(8)}rem`,
                        objectFit: "contain",
                        display: "block",
                        transform: file.name.endsWith("/") ? "scale(0.86)" : "none"
                      }
                    })),
                  m("",
                    {
                      style: {
                        fontSize: `${getSize(3)}rem`,
                        lineHeight: `${getSize(4)}rem`,
                        height: `${getSize(8)}rem`,
                        opacity: 0.8,
                        overflow: "hidden",
                        display: "-webkit-box",
                        "-webkit-line-clamp": "2",
                        "-webkit-box-orient": "vertical",
                        pointerEvents: "none"
                      }
                    },
                    file.name.endsWith('/') ? file.name.slice(0, -1) : file.name)
                ]);
            }))
      ]);
  }
};
