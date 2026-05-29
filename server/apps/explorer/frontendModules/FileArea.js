export default {
  view: (vnode) => {
    const {
      m,
      getColor,
      iconPark,
      viewMode,
      processedFiles,
      selected,
      isSelecting,
      selectStart,
      selectEnd,
      onContextMenu,
      onPointerDown,
      onPointerUp,
      onDragOver,
      onDrop,
      onDragStart,
      onOpenItem,
      onHeaderClick,
      sortField,
      sortOrder,
      getIcon,
      formatDate,
      formatSize,
      renderHighlightedText,
      currentPath,
      isProjectSearching
    } = vnode.attrs;

    const renderSortIcon = (field) => {
      if (sortField !== field) return null;
      return m("span",
        {
          style: {
            marginLeft: "0.4rem"
          }
        },
        m.trust(iconPark.getIcon(sortOrder === 1 ? "SortAmountUp" : "SortAmountDown", {
          size: "1.2rem"
        }))
      );
    };

    return m("",
      {
        id: "explorer-container",
        style: {
          display: "flex",
          flexDirection: viewMode === "grid" ? "row" : "column",
          flexWrap: viewMode === "grid" ? "wrap" : "nowrap",
          flex: 1,
          gap: viewMode === "grid" ? "1rem" : "0",
          padding: "1rem",
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          alignContent: "flex-start",
          boxSizing: "border-box"
        },
        oncontextmenu: onContextMenu,
        onpointerdown: onPointerDown,
        onpointerup: onPointerUp,
        ondragover: onDragOver,
        ondrop: onDrop
      },
      [
        // 拖拽选择框
        isSelecting ? m("",
          {
            style: {
              position: "absolute",
              left: Math.min(selectStart.x, selectEnd.x) + "px",
              top: Math.min(selectStart.y, selectEnd.y) + "px",
              width: Math.abs(selectEnd.x - selectStart.x) + "px",
              height: Math.abs(selectEnd.y - selectStart.y) + "px",
              background: getColor('main').back + '33',
              border: `1px solid ${getColor('main').front}`,
              pointerEvents: "none",
              zIndex: 10
            }
          }
        ) : null,

        // 列表视图的表头
        viewMode === "list" ? m("",
          {
            style: {
              display: "flex",
              alignItems: "center",
              padding: "0.8rem 1.5rem",
              width: "100%",
              position: "sticky",
              top: 0,
              background: getColor('gray_12').back,
              borderBottom: `1px solid ${getColor('gray_2').back}`,
              zIndex: 2,
              fontSize: "1.1rem",
              color: getColor('gray_6').front,
              fontWeight: "bold",
              boxSizing: "border-box"
            }
          },
          [
            m("div", { style: { width: "3rem" } }),
            m("div",
              {
                style: {
                  flex: 4,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center"
                },
                onclick: () => onHeaderClick("name")
              },
              ["名称", renderSortIcon("name")]
            ),
            m("div",
              {
                style: {
                  flex: 1,
                  textAlign: "right",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end"
                },
                onclick: () => onHeaderClick("size")
              },
              ["大小", renderSortIcon("size")]
            ),
            m("div",
              {
                style: {
                  flex: 2,
                  textAlign: "right",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end"
                },
                onclick: () => onHeaderClick("mtime")
              },
              ["修改日期", renderSortIcon("mtime")]
            )
          ]
        ) : null,

        // 文件项渲染
        (() => {
          const listItems = [];
          
          // 搜索中状态提示
          if (isProjectSearching) {
            listItems.push(m("div", {
              style: {
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
                padding: "3rem 0",
                fontSize: "1.4rem",
                color: getColor('gray_6').front,
                gap: "0.6rem"
              }
            }, [
              m("span", "⏳"),
              "搜索中..."
            ]));
            return listItems;
          }
          
          let lastFilePath = null;
      processedFiles.forEach((item) => {
            const itemId = item.isSearchResult ? `${item.path}:${item.line}` : item.name;
            const isSelected = selected.has(itemId);
            const fullPath = item.isSearchResult ? item.path : (currentPath + (currentPath.endsWith("/") ? "" : "/") + item.name);

            // 全项目搜索时的文件分组标题
            if (item.isSearchResult && item.path !== lastFilePath) {
              listItems.push(m("",
                {
                  style: {
                    padding: "0.8rem 1.5rem",
                    background: getColor('gray_1').back + '44',
                    fontSize: "1.1rem",
                    fontWeight: "bold",
                    color: getColor('main').front,
                    borderBottom: `1px solid ${getColor('gray_2').back}`,
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    boxSizing: "border-box"
                  }
                },
                [
                  m("span", { style: { marginRight: "0.8rem" } }, "📂"),
                  item.relPath
                ]
              ));
              lastFilePath = item.path;
            }

            // 单个文件项
            listItems.push(m("",
              {
                class: "file-item hover-bg", // 恢复 hover-bg 类名
                "data-name": itemId,
                "data-path": fullPath,
                "data-type": item.isDirectory ? "folder" : "file",
                draggable: true,
                ondragstart: (e) => onDragStart(e, item),
                style: viewMode === "grid" ? {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "10rem",
                  padding: "1rem",
                  borderRadius: "0.8rem",
                  background: isSelected ? getColor('main').back + '44' : "transparent",
                  border: isSelected ? `2px solid ${getColor('main').front}` : "2px solid transparent",
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "background 0.2s"
                } : {
                  display: "flex",
                  alignItems: "center",
                  padding: "0.6rem 1.5rem",
                  width: "100%",
                  background: isSelected ? getColor('main').back + '44' : "transparent",
                  borderLeft: isSelected ? `4px solid ${getColor('main').front}` : "4px solid transparent",
                  cursor: "pointer",
                  userSelect: "none",
                  boxSizing: "border-box",
                  paddingLeft: item.isSearchResult ? "4rem" : "1.5rem"
                }
              },
              [
                // 图标
                m("div",
                  {
                    style: {
                      fontSize: viewMode === "grid" ? "3.2rem" : "2rem",
                      marginBottom: viewMode === "grid" ? "0.5rem" : "0",
                      marginRight: viewMode === "grid" ? "0" : "1rem",
                      pointerEvents: "none"
                    }
                  },
                  getIcon(item)
                ),
                // 详情
                viewMode === "grid" 
                  ? m("div",
                      {
                        style: {
                          fontSize: "1.2rem",
                          textAlign: "center",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                          whiteSpace: "nowrap",
                          pointerEvents: "none"
                        }
                      },
                      item.name
                    )
                  : [
                      m("div",
                        {
                          style: {
                            flex: 4,
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden"
                          }
                        },
                        [
                          m("div",
                            {
                              style: {
                                fontSize: "1.3rem",
                                fontWeight: item.isSearchResult ? "bold" : "normal",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.6rem"
                              }
                            },
                            item.isFileNameMatch
                              ? [
                                  item.name,
                                  m("span",
                                    {
                                      style: {
                                        fontSize: "1rem",
                                        padding: "0.1rem 0.5rem",
                                        borderRadius: "0.3rem",
                                        background: getColor('main').back + "55",
                                        color: getColor('main').front,
                                        flexShrink: 0
                                      }
                                    },
                                    "文件名"
                                  )
                                ]
                              : item.isSearchResult ? `行 ${item.line}:` : item.name
                          ),
                          item.isSearchResult && !item.isFileNameMatch ? m("div",

                            {
                              style: {
                                fontSize: "1.1rem",
                                opacity: 0.7,
                                whiteSpace: "pre-wrap",
                                marginTop: "0.2rem"
                              }
                            },
                            renderHighlightedText(item.content, item.submatches)
                          ) : null
                        ]
                      ),
                      m("div",
                        {
                          style: {
                            flex: 1,
                            fontSize: "1.1rem",
                            color: getColor('gray_6').front,
                            textAlign: "right",
                            pointerEvents: "none"
                          }
                        },
                        formatSize(item.size, item)
                      ),
                      m("div",
                        {
                          style: {
                            flex: 2,
                            fontSize: "1.1rem",
                            color: getColor('gray_6').front,
                            textAlign: "right",
                            pointerEvents: "none"
                          }
                        },
                        formatDate(item.mtime)
                      )
                    ]
              ]
            ));
          });
          return listItems;
        })()
      ]
    );
  }
}

