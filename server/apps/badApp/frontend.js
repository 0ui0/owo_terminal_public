export default ({ m }) => {
  return {
    oninit(vnode) {
      vnode.state.onDispatch = (msg, callback) => {
        if (msg.action === "getHTML") {
          if (callback) callback({ ok: true, data: vnode.state.dom?.innerHTML || "无法获取 DOM" })
        }
      }
    },
    view: (vnode) => m("div", {
      oncreate: (vn) => { vnode.state.dom = vn.dom }
    }, "如果你能看到我，说明初始化没报错（但这不符合测试预期）")
  }
}
