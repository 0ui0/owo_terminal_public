export default {
  view: (vnode) => {
    const {
      m,
      Box,
      title = "文件冲突",
      fileName,
      onDecision,
      onGlobalDecision,
      onCancel
    } = vnode.attrs;

    return m(Box,
      {
        style: {
          display: "flex",
          flexDirection: "column",
          padding: "10px"
        }
      },
      [
        m("", { style: { marginBottom: "15px", fontWeight: "bold" } }, title),
        m("", { style: { marginBottom: "20px" } }, `目标位置已包含名为 "${fileName}" 的文件。`),
        m("",
          {
            style: {
              display: "flex",
              gap: "10px",
              justifyContent: "flex-end",
              flexWrap: "wrap"
            }
          },
          [
            m(Box, { isBtn: true, onclick: () => onDecision('rename') }, "重命名"),
            m(Box, { isBtn: true, onclick: () => onDecision('override') }, "覆盖"),
            m(Box, { isBtn: true, onclick: () => onDecision('skip') }, "跳过"),
            
            onGlobalDecision && [
              m(Box, { isBtn: true, onclick: () => onGlobalDecision('rename') }, "全部重命名"),
              m(Box, { isBtn: true, onclick: () => onGlobalDecision('override') }, "全部覆盖"),
              m(Box, { isBtn: true, onclick: () => onGlobalDecision('skip') }, "全部跳过")
            ],

            m(Box, { isBtn: true, color: "pink_1", onclick: onCancel }, "取消")
          ]
        )
      ]
    );
  }
}
