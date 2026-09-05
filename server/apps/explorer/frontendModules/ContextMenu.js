export default {
  view: (vnode) => {
    const {
      m,
      sysMenu,
      getColor,
      trs,
      selectedCount,
      hasItem,
      isSearchResult,
      canPaste,
      onAction
    } = vnode.attrs;

    const menuItems = [];

    if (hasItem) {
      menuItems.push({
        name: trs("资源管理器/菜单/打开", { cn: "打开", en: "Open" }),
        onclick: () => onAction("open")
      });
      if (isSearchResult && selectedCount === 1) {
        menuItems.push({
          name: trs("资源管理器/菜单/打开所在目录", { cn: "打开所在目录", en: "Open Containing Folder" }),
          onclick: () => onAction("openDir")
        });
      }
      menuItems.push({
        name: trs("资源管理器/菜单/重命名", { cn: "重命名", en: "Rename" }),
        onclick: () => onAction("rename")
      });
      menuItems.push("sep");
    }

    menuItems.push({
      name: trs("资源管理器/菜单/复制", { cn: "复制", en: "Copy" }),
      onclick: () => onAction("copy")
    });
    menuItems.push({
      name: trs("资源管理器/菜单/剪切", { cn: "剪切", en: "Cut" }),
      onclick: () => onAction("cut")
    });

    if (canPaste) {
      menuItems.push({
        name: trs("资源管理器/菜单/粘贴", { cn: "粘贴", en: "Paste" }),
        onclick: () => onAction("paste")
      });
    }

    if (hasItem) {
      menuItems.push("sep");
      menuItems.push({
        name: trs("资源管理器/菜单/删除", { cn: "删除", en: "Delete" }),
        onclick: () => onAction("delete")
      });
    }

    if (!hasItem) {
      menuItems.push("sep");
      menuItems.push({
        name: trs("资源管理器/菜单/新建文件夹", { cn: "新建文件夹", en: "New Folder" }),
        onclick: () => onAction("mkdir")
      });
    }

    return m("",
      [
        selectedCount > 0 ? m("",
          {
            style: {
              padding: "0.6rem 1.0rem",
              fontSize: "1.1rem",
              color: getColor("gray_12").front,
              opacity: 0.6,
              textAlign: "center",
              borderBottom: "1px solid rgba(128, 128, 128, 0.15)",
              marginBottom: "0.2rem"
            }
          },
          trs("资源管理器/菜单/已选择项", {
            cn: `已选择: ${selectedCount} 项`,
            en: `Selected: ${selectedCount}`
          })
        ) : null,
        m(sysMenu,
          {
            menuItems
          }
        )
      ]
    );
  }
};

