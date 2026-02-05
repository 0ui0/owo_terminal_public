
import editorData from "./editorData.js"

// Editor App 前端组件 (Closure Version)
export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box }) => {
  // === Private State ===
  let isDiff = false
  let filePath = ""
  let content = ""
  let originalContent = ""
  let proposedContent = ""
  let confirmId = null

  let activeMenu = null
  let wordWrap = false

  let editor = null
  let diffEditor = null
  let container = null
  const redraw = () => m.redraw()

  // === Helpers ===
  const loadMonaco = () => {
    if (window.monaco) return Promise.resolve()
    return new Promise((resolve) => {
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"
      script.onload = () => {
        require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } })
        require(["vs/editor/editor.main"], () => resolve())
      }
      document.head.appendChild(script)
    })
  }

  const handleSave = async (forceDialog = false) => {
    if (!editor) return
    let currentPath = filePath
    if (!currentPath || forceDialog) {
      const dialogRes = await settingData.fnCall("appSaveDialog", [{
        title: "另存为", filePath: currentPath,
        filters: [{ name: "文本文件", extensions: ["txt", "js", "py", "md", "html", "css", "json"] }, { name: "所有文件", extensions: ["*"] }]
      }])
      if (!dialogRes.ok || dialogRes.canceled) return
      currentPath = dialogRes.filePath
    }
    const txt = editor.getValue()
    const res = await settingData.fnCall("appDispatch", [appId, "save", { content: txt, filePath: currentPath }])
    if (res.ok && res.data?.ok) {
      filePath = res.data.data.filePath
      content = txt
      redraw()
      Notice.launch({ msg: "文件已保存" })
    } else {
      Notice.launch({ msg: "保存失败: " + (res.data?.msg || res.data?.error || res.msg || "未知错误") })
    }
  }

  const updateEditor = () => {
    if (!window.monaco || !container) return
    if (editor) { editor.dispose(); editor = null }
    if (diffEditor) { diffEditor.dispose(); diffEditor = null }
    container.innerHTML = ""

    const extension = (filePath || "").split(".").pop()
    const langMap = { js: "javascript", py: "python", md: "markdown", html: "html", css: "css", json: "json", coffee: "coffeescript" }
    const language = langMap[extension] || "text"

    if (isDiff) {
      diffEditor = monaco.editor.createDiffEditor(container, { theme: "vs-dark", automaticLayout: true, readOnly: true, renderSideBySide: true })
      diffEditor.setModel({
        original: monaco.editor.createModel(originalContent, language),
        modified: monaco.editor.createModel(proposedContent, language)
      })
    } else {
      editor = monaco.editor.create(container, {
        value: content, language: language, theme: "vs-dark", automaticLayout: true, fontSize: 14, lineHeight: 20, wordWrap: wordWrap ? "on" : "off"
      })
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handleSave())

      // Auto-save content state (Debounced 1s)
      let timer = null
      editor.onDidChangeModelContent(() => {
        content = editor.getValue()
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          settingData.fnCall("appUpdateData", [appId, { content: content }])
        }, 1000)
      })
    }
    redraw()
  }

  const handleAccept = async () => {
    const newContent = proposedContent
    const res = await settingData.fnCall("appDispatch", [appId, "acceptDiff", { proposedContent: newContent }])
    if (res.ok && res.data?.ok) {
      content = newContent
      isDiff = false
      if (confirmId) {
        await comData.data.edit(data => { data.chatLists.forEach(list => { const cmd = list.confirmCmds.find(c => c.id === confirmId); if (cmd) cmd.confirm = "yes" }) })
        confirmId = null
      }
      updateEditor()
      Notice.launch({ msg: "修改已应用" })
    } else {
      Notice.launch({ msg: "操作失败" })
    }
  }

  const handleReject = async () => {
    if (confirmId) {
      await comData.data.edit(data => { data.chatLists.forEach(list => { const cmd = list.confirmCmds.find(c => c.id === confirmId); if (cmd) cmd.confirm = "no" }) })
      confirmId = null
    }
    isDiff = false
    updateEditor()
    Notice.launch({ msg: "操作已取消" })
  }

  // === Actions ===
  const actions = {
    newFile: () => { filePath = ""; content = ""; isDiff = false; updateEditor() },
    openFile: async () => {
      const dialogRes = await settingData.fnCall("appOpenDialog", [{ title: "打开文件", filters: [{ name: "All", extensions: ["*"] }] }])
      if (!dialogRes.ok || dialogRes.canceled) return
      const res = await settingData.fnCall("appDispatch", [appId, "open", { filePath: dialogRes.filePath }])
      if (res.ok && res.data?.ok) { filePath = res.data.data.filePath; content = res.data.data.content; isDiff = false; updateEditor() }
    },
    save: () => handleSave(),
    saveAs: () => handleSave(true),
    undo: () => editor?.trigger('menu', 'undo'),
    redo: () => editor?.trigger('menu', 'redo'),
    find: () => editor?.trigger('menu', 'actions.find'),
    replace: () => editor?.trigger('menu', 'editor.action.startFindReplaceAction'),
    toggleWordWrap: () => { wordWrap = !wordWrap; editor?.updateOptions({ wordWrap: wordWrap ? "on" : "off" }); redraw() }
  }

  const toggleMenu = (name) => {
    activeMenu = activeMenu === name ? null : name
    redraw()
  }
  const closeMenu = () => { activeMenu = null; redraw() }

  // === Instance Interface ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      const done = (res) => { if (callback) callback(res) }
      if (msg.action === "getHTML") return done({ ok: true, data: container ? container.parentNode.innerHTML : "" })
      if (msg.action === "getContent") {
        // Fix for editorPatcher
        return done({ ok: true, data: { filePath, content: editor ? editor.getValue() : content } })
      }
      if (msg.action === "open") {
        filePath = msg.args.filePath; content = msg.args.content; isDiff = false
        updateEditor()
        done({ ok: true })
      } else if (msg.action === "showDiff") {
        filePath = msg.args.filePath; originalContent = msg.args.originalContent
        proposedContent = msg.args.proposedContent; isDiff = true; confirmId = msg.args.confirmId
        updateEditor()
        done({ ok: true })
      } else if (msg.action === "acceptDiff") {
        proposedContent = msg.args.proposedContent; handleAccept(); done({ ok: true })
      } else {
        done({ error: `Not supported: ${msg.action}` })
      }
    }
  }

  // === Init ===
  const init = () => {
    editorData.addTool("commonData", commonData)
    editorData.registerInstances(appId, instanceInterface)
    if (commonData && commonData.registerApp) commonData.registerApp(appId, editorData)
  }

  init()

  // === View Components ===
  const MenuItem = {
    view: (v) => m("div", {
      style: { padding: "8px 15px", cursor: "pointer", display: "flex", justifyContent: "space-between", minWidth: "150px", color: "#ccc", fontSize: "13px", transition: "background 0.1s" },
      onmouseenter: (e) => e.currentTarget.style.background = "#094771", onmouseleave: (e) => e.currentTarget.style.background = "transparent",
      onclick: (e) => { e.stopPropagation(); closeMenu(); if (v.attrs.action) v.attrs.action() }
    }, [m("span", { style: { pointerEvents: "none" } }, v.attrs.label), v.attrs.shortcut ? m("span", { style: { color: "#888", fontSize: "12px", marginLeft: "15px", pointerEvents: "none" } }, v.attrs.shortcut) : null])
  }

  const MenuDropdown = {
    view: (v) => m("div", {
      style: { position: "absolute", top: "30px", left: "0", background: "#252526", border: "1px solid #454545", zIndex: 1000, borderRadius: "3px", padding: "4px 0", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }
    }, v.attrs.items.map(item => item === "sep" ? m("div", { style: { height: "1px", background: "#454545", margin: "4px 0" } }) : m(MenuItem, { ...item, closeMenu })))
  }

  // === Main View ===
  return {
    oninit(vnode) {
      if (vnode.attrs.data) {
        const d = vnode.attrs.data
        isDiff = d.isDiff || false
        filePath = d.filePath || ""
        content = d.content || ""
        originalContent = d.originalContent || ""
        proposedContent = d.proposedContent || ""
        confirmId = d.confirmId || null
      }
    },
    oncreate(vnode) {
      container = vnode.dom.querySelector(".monaco-container")
      loadMonaco().then(() => updateEditor())
    },
    onremove() {
      editorData.unregisterInstances(appId, commonData)
      if (editor) editor.dispose(); if (diffEditor) diffEditor.dispose()
    },
    view(vnode) {
      return m("div", {
        style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#1e1e1e", color: "#ccc", overflow: "hidden" },
        onclick: closeMenu
      }, [
        // Menu Bar
        m("div", { onpointerdown: (e) => e.stopPropagation(), style: { display: "flex", height: "35px", padding: "0 10px", background: "#333", alignItems: "center", fontSize: "13px", userSelect: "none" } }, [
          m("div", { style: { position: "relative" } }, [m("div", { style: { padding: "5px 10px", cursor: "pointer", background: activeMenu === "file" ? "#444" : "transparent" }, onclick: (e) => { e.stopPropagation(); toggleMenu("file") } }, "文件"), activeMenu === "file" ? m(MenuDropdown, { items: [{ label: "新建", action: actions.newFile }, { label: "打开...", action: actions.openFile, shortcut: "Ctrl+O" }, "sep", { label: "保存", action: actions.save, shortcut: "Ctrl+S" }, { label: "另存为...", action: actions.saveAs, shortcut: "Ctrl+Shift+S" }] }) : null]),
          m("div", { style: { position: "relative" } }, [m("div", { style: { padding: "5px 10px", cursor: "pointer", background: activeMenu === "edit" ? "#444" : "transparent" }, onclick: (e) => { e.stopPropagation(); toggleMenu("edit") } }, "编辑"), activeMenu === "edit" ? m(MenuDropdown, { items: [{ label: "撤销", action: actions.undo, shortcut: "Ctrl+Z" }, { label: "重做", action: actions.redo, shortcut: "Ctrl+Y" }, "sep", { label: "查找", action: actions.find, shortcut: "Ctrl+F" }, { label: "替换", action: actions.replace, shortcut: "Ctrl+H" }] }) : null]),
          m("div", { style: { position: "relative" } }, [m("div", { style: { padding: "5px 10px", cursor: "pointer", background: activeMenu === "view" ? "#444" : "transparent" }, onclick: (e) => { e.stopPropagation(); toggleMenu("view") } }, "视图"), activeMenu === "view" ? m(MenuDropdown, { items: [{ label: "自动换行", action: actions.toggleWordWrap, shortcut: wordWrap ? "开启" : "关闭" }] }) : null]),
          m("div", { style: { flex: 1, textAlign: "center", opacity: 0.6, fontSize: "12px", letterSpacing: "1px" } }, filePath ? filePath.split("/").pop() : "新文件"),
          m("div", { style: { display: "flex", gap: "10px" } }, [
            isDiff ? [
              m("button", { style: { padding: "4px 15px", background: "#2ea44f", color: "white", border: "none", borderRadius: "3px", cursor: "pointer", fontWeight: "bold" }, onclick: (e) => { e.stopPropagation(); handleAccept() } }, "批准修改"),
              m("button", { style: { padding: "4px 15px", background: "#444", color: "#ccc", border: "none", borderRadius: "3px", cursor: "pointer" }, onclick: (e) => { e.stopPropagation(); handleReject() } }, "拒绝")
            ] : m(Box, { isBtn: true, style: { padding: "4px 15px", background: "#007acc", color: "white", borderRadius: "3px", fontWeight: "bold" }, onclick: (dom, e) => { e.stopPropagation(); handleSave() } }, "保存")
          ])
        ]),
        // Path
        m("div", { style: { display: "flex", height: "22px", padding: "0 10px", background: "#252526", alignItems: "center", fontSize: "11px", color: "#aaa", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)" } }, filePath || "未选择文件"),
        // Editor
        m("div", { style: { flex: 1, position: "relative", margin: "0", overflow: "hidden" } }, [
          m("div", { class: "monaco-container", style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" } })
        ])
      ])
    }
  }
}
