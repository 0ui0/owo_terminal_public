export default {
  view: (vnode) => {
    const { m, Box, getColor, isValidPath, hash, relPath, rootName, iconPark, onBack, onOpenRepo, isMob, showSidebar, toggleSidebar, trs } = vnode.attrs;
    const compact = isMob;
    return m("",
      {
        style: {
          padding: compact ? "0.4rem 0.5rem" : "0.6rem 1rem",
          background: getColor('gray_12').back,
          color: getColor('gray_12').front,
          display: "flex",
          alignItems: "center",
          gap: compact ? "0.3rem" : "0.8rem",
          borderBottom: `0.1rem solid ${getColor('gray_2').back}`,
          overflow: "hidden"
        }
      },
      [
        // 移动端：菜单切换按钮
        isMob ? m("div",
          {
            style: {
              padding: "0.5rem",
              borderRadius: "0.6rem",
              background: showSidebar ? getColor('main').back : "transparent",
              color: showSidebar ? getColor('main').front : getColor('gray_12').front,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            },
            onclick: toggleSidebar
          },
          m.trust(iconPark.getIcon('HamburgerButton', { fill: showSidebar ? getColor('main').front : getColor('gray_12').front }))) : null,
        m("div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.6rem",
              background: getColor('gray_2').back,
              color: getColor('gray_2').front,
              cursor: (relPath || hash) ? "pointer" : "default",
              opacity: (relPath || hash) ? 1 : 0.3,
              transition: "all 0.2s",
              border: `0.1rem solid ${getColor('gray_3').back}`
            },
            onclick: () => {
              return onBack();
            }
          },
          [
            m.trust(iconPark.getIcon('Left', { fill: getColor('gray_2').front })),
            compact ? null : m("span", trs("时光机/工具栏/返回", { cn: "返回", en: "Back" }))
          ]),

        m("div",
          {
            style: {
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.5rem 1rem",
              background: getColor(isValidPath ? 'gray_1' : 'gray_2').back,
              color: getColor(isValidPath ? 'gray_1' : 'gray_2').front,
              borderRadius: "0.6rem",
              border: `0.1rem solid ${getColor('gray_3').back}`,
              cursor: "pointer",
              transition: "all 0.2s",
              overflow: "hidden"
            },
            onclick: () => {
              return onOpenRepo();
            }
          },
          [
            m.trust(iconPark.getIcon('History', { fill: getColor(isValidPath ? 'gray_1' : 'gray_2').front })),
            m("span",
              {
                style: {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }
              },
              !isValidPath ? trs("时光机/工具栏/点击打开备份目录", { cn: "点击打开备份目录", en: "Open Backup Directory" }) :
                (!hash ? `${rootName} / ${trs("时光机/工具栏/总时间轴", { cn: "总时间轴", en: "Timeline" })}` : `${rootName}${relPath ? '/' + relPath : ''}`))
          ]),

        m("div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1.2rem",
              borderRadius: "0.6rem",
              background: getColor('main').back,
              color: getColor('main').front,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 0.1rem 0.2rem rgba(0,0,0,0.05)",
              whiteSpace: "nowrap",
              flexShrink: 0
            },
            onclick: () => {
              return onOpenRepo();
            }
          },
          [
            m.trust(iconPark.getIcon('FolderOpen', { fill: getColor('main').front })),
            compact ? null : m("span", trs("时光机/工具栏/打开目录", { cn: "打开目录", en: "Open" }))
          ])
      ]);
  }
};
