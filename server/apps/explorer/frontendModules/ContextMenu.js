export default {
  view: (vnode) => {
    const {
      m,
      Box,
      getColor,
      selectedCount,
      hasItem,
      canPaste,
      onAction
    } = vnode.attrs;

    return m(Box,
      {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      },
      [
        selectedCount > 0 ? m(Box,
          {
            style: {
              padding: "0.8rem",
              fontSize: "1.1rem",
              borderBottom: `1px solid ${getColor('gray_1').front}22`,
              marginBottom: "0.4rem",
              fontWeight: "bold",
              textAlign: "center"
            }
          },
          `已选择: ${selectedCount} 项`
        ) : null,

        hasItem ? [
          m(Box, { isBtn: true, onclick: () => onAction('open') }, "打开"),
          m(Box, { isBtn: true, onclick: () => onAction('rename') }, "重命名")
        ] : null,

        m(Box, { isBtn: true, onclick: () => onAction('copy') }, "复制"),
        m(Box, { isBtn: true, onclick: () => onAction('cut') }, "剪切"),
        
        canPaste ? m(Box, { isBtn: true, onclick: () => onAction('paste') }, "粘贴") : null,

        hasItem ? m(Box, { 
          isBtn: true, 
          color: "pink_1", 
          onclick: () => onAction('delete') 
        }, "删除") : null,

        !hasItem ? m(Box, { isBtn: true, onclick: () => onAction('mkdir') }, "新建文件夹") : null
      ]
    );
  }
}
