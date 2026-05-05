export default {
  view: (vnode) => {
    const {
      m,
      Box,
      iconPark,
      getColor,
      inputPath,
      searchMode,
      searchKeyword,
      sortField,
      sortOrder,
      viewMode,
      onNavigate,
      onGoHistory,
      onLoadDir,
      onDoProjectSearch,
      onInputPathChange,
      onSearchModeChange,
      onSearchKeywordChange,
      onSortFieldChange,
      onSortOrderToggle,
      onViewModeToggle
    } = vnode.attrs;

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          background: getColor('gray_12').back
        }
      },
      [
        // 第一行：地址栏与基本导航
        m("",
          {
            style: {
              display: "flex",
              padding: "0.8rem",
              gap: "1rem",
              alignItems: "center"
            }
          },
          [
            m("div",
              {
                style: {
                  cursor: "pointer",
                  padding: "0.4rem",
                  borderRadius: "10rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2rem",
                  height: "2rem"
                },
                title: "后退",
                onclick: () => onGoHistory(-1)
              },
              m.trust(iconPark.getIcon("Left", {
                size: "1.2rem",
                fill: getColor('gray_12').front
              }))
            ),
            m("div",
              {
                style: {
                  cursor: "pointer",
                  padding: "0.4rem",
                  borderRadius: "10rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2rem",
                  height: "2rem"
                },
                title: "返回上级",
                onclick: () => onNavigate("..")
              },
              m.trust(iconPark.getIcon("Up", {
                size: "1.2rem",
                fill: getColor('gray_12').front
              }))
            ),
            m("form",
              {
                style: {
                  flex: 1,
                  display: "flex"
                },
                onsubmit: (e) => {
                  e.preventDefault();
                  onNavigate(inputPath);
                }
              },
              [
                m(Box,
                  {
                    tagName: "input",
                    noValue: true,
                    color: "brown_4",
                    padding: "0.5rem 1.2rem",
                    style: {
                      flex: 1,
                      borderRadius: "10rem",
                      border: `1px solid ${getColor('gray_2').back}`
                    },
                    ext: {
                      value: inputPath
                    },
                    oninput: (dom, e) => onInputPathChange(e.target.value),
                    onkeydown: (dom, e) => {
                      if (e.key === 'Enter') return;
                      e.stopPropagation();
                    }
                  }
                )
              ]
            ),
            m("div",
              {
                style: {
                  cursor: "pointer",
                  padding: "0.4rem",
                  borderRadius: "10rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2rem",
                  height: "2rem"
                },
                title: "刷新",
                onclick: () => onLoadDir()
              },
              m.trust(iconPark.getIcon("Refresh", {
                size: "1.2rem",
                fill: getColor('gray_12').front
              }))
            )
          ]
        ),

        // 第二行：工具栏（排序、视图、搜索）
        m("",
          {
            style: {
              display: "flex",
              padding: "0.6rem 1.5rem",
              gap: "1.5rem",
              alignItems: "center",
              fontSize: "1.2rem",
              borderBottom: `1px solid ${getColor('gray_2').back}`
            }
          },
          [
            // 左侧：排序与视图
            m("",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "0.8rem"
                }
              },
              [
                m("div",
                  {
                    style: {
                      color: getColor('gray_6').front,
                      marginRight: "0.4rem"
                    }
                  },
                  "排序"
                ),
                m("select",
                  {
                    style: {
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: getColor('gray_12').front,
                      cursor: "pointer",
                      fontWeight: "bold"
                    },
                    onchange: (e) => onSortFieldChange(e.target.value)
                  },
                  [
                    m("option", { value: "name" }, "名称"),
                    m("option", { value: "mtime" }, "日期"),
                    m("option", { value: "size" }, "大小"),
                    m("option", { value: "type" }, "类型")
                  ]
                ),
                m("div",
                  {
                    style: {
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: "0.4rem",
                      borderRadius: "0.4rem"
                    },
                    title: sortOrder === 1 ? "升序" : "降序",
                    onclick: onSortOrderToggle
                  },
                  m.trust(iconPark.getIcon(sortOrder === 1 ? "SortAmountUp" : "SortAmountDown", {
                    size: "1.6rem",
                    fill: getColor('gray_12').front
                  }))
                ),
                m("div",
                  {
                    style: {
                      width: "1px",
                      height: "1.6rem",
                      background: getColor('gray_2').back,
                      margin: "0 0.5rem"
                    }
                  }
                ),
                m("div",
                  {
                    style: {
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: "0.4rem",
                      borderRadius: "0.4rem"
                    },
                    title: viewMode === "grid" ? "切换到列表视图" : "切换到网格视图",
                    onclick: onViewModeToggle
                  },
                  m.trust(iconPark.getIcon(viewMode === "grid" ? "HamburgerButton" : "GridNine", {
                    size: "1.6rem",
                    fill: getColor('gray_12').front
                  }))
                )
              ]
            ),

            // 中间撑开
            m("div", { style: { flex: 1 } }),

            // 右侧：搜索
            m("form",
              {
                style: {
                  width: "28rem",
                  display: "flex",
                  alignItems: "center",
                  background: getColor('gray_1').back + '88',
                  borderRadius: "0.4rem",
                  padding: "0.4rem 1rem",
                  border: `1px solid ${getColor('gray_2').back}`
                },
                onsubmit: (e) => {
                  e.preventDefault();
                  if (searchMode === 'project') onDoProjectSearch();
                }
              },
              [
                m("select",
                  {
                    style: {
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: getColor('gray_12').front,
                      cursor: "pointer",
                      fontSize: "1.1rem",
                      marginRight: "0.5rem",
                      width: "7rem",
                      opacity: 0.7
                    },
                    onchange: (e) => onSearchModeChange(e.target.value)
                  },
                  [
                    m("option", { value: "current" }, "当前目录"),
                    m("option", { value: "project" }, "整个项目")
                  ]
                ),
                m("div",
                  {
                    style: {
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center"
                    },
                    onclick: () => {
                      if (searchMode === 'project') onDoProjectSearch();
                    }
                  },
                  m.trust(iconPark.getIcon("Search", {
                    size: "1.4rem",
                    fill: getColor('gray_12').front
                  }))
                ),
                m("input",
                  {
                    placeholder: searchMode === 'project' ? "输入搜索..." : "本页过滤...",
                    value: searchKeyword,
                    oninput: (e) => onSearchKeywordChange(e.target.value),
                    style: {
                      border: "none",
                      background: "transparent",
                      outline: "none",
                      marginLeft: "0.8rem",
                      width: "100%",
                      fontSize: "1.2rem",
                      color: getColor('gray_12').front
                    }
                  }
                )
              ]
            )
          ]
        )
      ]
    );
  }
}
