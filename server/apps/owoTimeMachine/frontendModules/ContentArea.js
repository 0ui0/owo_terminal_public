export default {
  view: (vnode) => {
    const { m, Box, getColor, isValidPath, hash, relPath, files, history, selected, isSelecting, selectStart, selectEnd, rootName, repoPath, iconPark, onContextMenu, onPointerDown, onFileDragStart, onSnapshotDragStart, onOpen, onSelect, trs } = vnode.attrs;
    return m("",
      {
        style: {
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: "1.2rem",
          padding: "1.2rem",
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
                border: `0.1rem solid ${getColor('main').front}`,
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
                opacity: 0.2,
                flexDirection: "column"
              }
            },
            [
              m("", { style: { fontSize: "4rem", marginBottom: "1rem" } }, "🪐"),
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
                    width: "11rem",
                    padding: "1rem 0.5rem",
                    textAlign: "center",
                    cursor: "pointer",
                    borderRadius: "0.8rem",
                    color: getColor('gray_4').front,
                    background: selected.has(item.hash) ? getColor('main').back + '44' : "transparent",
                    border: selected.has(item.hash) ? `0.1rem solid ${getColor('main').front}` : "0.1rem solid transparent",
                    transition: "all 0.2s",
                    userSelect: "none",
                    position: "relative"
                  },
                  ondragstart: (e) => {
                    return onSnapshotDragStart(e, item);
                  }
                },
                [
                  m("", { style: { fontSize: "3rem", marginBottom: "0.6rem" } }, "📦"),
                  m("",
                    {
                      style: {
                        fontSize: "0.8rem",
                        opacity: 0.5,
                        marginBottom: "0.4rem"
                      }
                    },
                    item.msg || "无备注"),
                  m("",
                    {
                      style: {
                        opacity: 0.8,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        "-webkit-line-clamp": "2",
                        "-webkit-box-orient": "vertical",
                        pointerEvents: "none",
                        fontWeight: "bold"
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
                    width: "9rem",
                    padding: "0.8rem 0.4rem",
                    textAlign: "center",
                    cursor: "pointer",
                    borderRadius: "0.8rem",
                    color: getColor('gray_4').front,
                    background: selected.has(file.name) ? getColor('main').back + '44' : "transparent",
                    border: selected.has(file.name) ? `0.1rem solid ${getColor('main').front}` : "0.1rem solid transparent",
                    transition: "background 0.2s",
                    userSelect: "none",
                    position: "relative"
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
                        fontSize: "2.2rem",
                        marginBottom: "0.6rem",
                        pointerEvents: "none"
                      }
                    },
                    file.name.endsWith('/') ? "📁" : (
                      (ext) => {
                        return {
                          "js": "📜", "json": "⚙️", "md": "📝", "txt": "📄", "html": "🌐",
                          "css": "🎨", "png": "🖼️", "jpg": "🖼️", "mp4": "🎬", "mp3": "🎵"
                        }[ext] || "📃";
                      }
                    )(file.name.split('.').pop().toLowerCase())),
                  m("",
                    {
                      style: {
                        opacity: 0.8,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
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
