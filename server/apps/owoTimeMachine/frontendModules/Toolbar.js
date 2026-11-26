export default {
  view: (vnode) => {
    const { m, Box, getColor, getSize, iconTag, isValidPath, hash, relPath, rootName, iconPark, onBack, onOpenRepo, isMob, showSidebar, toggleSidebar, trs } = vnode.attrs;
    const compact = isMob;
    return m("",
      {
        style: {
          padding: compact ? `${getSize(1)}rem` : `${getSize(3)}rem`,
          background: getColor('gray_12').back,
          color: getColor('gray_12').front,
          display: "flex",
          alignItems: "center",
          gap: compact ? `${getSize(1)}rem` : `${getSize(3)}rem`,
          borderBottom: `${getSize(0.25)}rem solid ${getColor('gray_2').back}`,
          overflow: "hidden"
        }
      },
      [
        // 移动端：菜单切换按钮
        isMob ? m(iconTag,
          {
            iconName: "HamburgerButton",
            isBtn: true,
            bgColor: showSidebar ? getColor('main').back : "transparent",
            fgColor: showSidebar ? getColor('main').front : getColor('gray_12').front,
            styleExt: {
              margin: 0
            },
            ext: {
              onclick: toggleSidebar
            }
          }) : null,
        m(iconTag,
          {
            iconName: "Left",
            isBtn: true,
            bgColor: getColor('gray_2').back,
            fgColor: getColor('gray_2').front,
            styleExt: {
              margin: 0,
              padding: `${getSize(2)}rem`,
              opacity: (relPath || hash) ? 1 : 0.3
            },
            ext: {
              onclick: onBack
            }
          },
          compact ? null : trs("时光机/工具栏/返回", { cn: "返回", en: "Back" })),

        m("div",
          {
            style: {
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: `${getSize(1.5)}rem`,
              padding: `${getSize(2)}rem ${getSize(2.5)}rem`,
              background: getColor(isValidPath ? 'gray_1' : 'gray_2').back,
              color: getColor(isValidPath ? 'gray_1' : 'gray_2').front,
              borderRadius: `${getSize(8)}rem`,
              border: `${getSize(0.25)}rem solid ${getColor('gray_3').back}`,
              cursor: "pointer",
              transition: "all 0.2s",
              fontSize: `${getSize(3)}rem`,
              lineHeight: `${getSize(4)}rem`,
              overflow: "hidden"
            },
            onclick: () => {
              return onOpenRepo();
            }
          },
          [
            m.trust(iconPark.getIcon('History', {
              size: `${getSize(4)}rem`,
              fill: getColor(isValidPath ? 'gray_1' : 'gray_2').front
            })),
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

        m(iconTag,
          {
            iconName: "FolderOpen",
            isBtn: true,
            bgColor: getColor('main').back,
            fgColor: getColor('main').front,
            styleExt: {
              margin: 0,
              flexShrink: 0,
              padding: `${getSize(2)}rem`
            },
            ext: {
              onclick: onOpenRepo
            }
          },
          compact ? null : trs("时光机/工具栏/打开目录", { cn: "打开目录", en: "Open" }))
      ]);
  }
};
