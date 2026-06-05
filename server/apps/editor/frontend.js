
import editorData from "./editorData.js"

// Editor App 前端组件 (Closure Version)
export default ({ appId, m, Notice, ioSocket, comData, commonData, chatData, settingData, Box, Tag, getColor }) => {
  // === Private State ===
  let isDiff = false
  let readOnly = false
  let isDirty = false
  let filePath = ""
  let content = ""
  let originalContent = ""
  let proposedContent = ""
  let confirmId = null
  let localComment = ""

  let activeMenu = null
  let wordWrap = false

  let editor = null
  let diffEditor = null
  let container = null
  let currentTheme = null
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
    if (!editor) return false
    let currentPath = filePath
    if (!currentPath || forceDialog) {
      const dialogRes = await settingData.fnCall("appSaveDialog", [{
        title: "另存为", filePath: currentPath,
        filters: [{ name: "文本文件", extensions: ["txt", "js", "py", "md", "html", "css", "json"] }, { name: "所有文件", extensions: ["*"] }]
      }])
      if (!dialogRes.ok || dialogRes.canceled) return false
      currentPath = dialogRes.filePath
    }
    const txt = editor.getValue()
    const res = await settingData.fnCall("appDispatch", [appId, "save", { content: txt, filePath: currentPath }])
    if (res.ok) {
      filePath = res.data.filePath
      content = txt
      isDirty = false
      redraw()
      Notice.launch({ msg: res.msg })
      return true
    } else {
      Notice.launch({ msg: res.msg })
      return false
    }
  }

  // 💡 自定义三按钮保存确认弹窗
  const AskSaveComponent = {
    view: (vnode) => m("",
      [
        m(Box, {
          isBlock: true,
        }, "文件尚未保存，是否保存窗口？"),
        m("",
          [
            m(Box,
              {
                isBtn: true,
                color: "main",
                onclick: () => vnode.attrs.onYes(vnode.attrs.delete)
              },
              "保存且关闭"
            ),
            m(Box,
              {
                isBtn: true,
                color: "gray_2",
                onclick: () => vnode.attrs.onNo(vnode.attrs.delete)
              },
              "不保存且关闭"
            ),
            m(Box,
              {
                isBtn: true,
                color: "gray_3",
                onclick: () => vnode.attrs.delete() // 物理关闭自身询问弹窗
              },
              "取消"
            )
          ]
        )
      ]
    )
  }

  const updateEditor = () => {
    if (!window.monaco || !container) return
    if (editor) { editor.dispose(); editor = null }
    if (diffEditor) { diffEditor.dispose(); diffEditor = null }
    container.innerHTML = ""

    const extension = (filePath || "").split(".").pop()
    const langMap = { js: "javascript", py: "python", md: "markdown", html: "html", css: "css", json: "json", coffee: "coffeescript" }
    const language = langMap[extension] || "text"

    const isDark = (commonData.themeColor || 0) === 0
    const monacoTheme = isDark ? "vs-dark" : "vs"
    currentTheme = monacoTheme

    if (isDiff) {
      diffEditor = monaco.editor.createDiffEditor(container, { theme: monacoTheme, automaticLayout: true, readOnly: true, renderSideBySide: true })
      diffEditor.setModel({
        original: monaco.editor.createModel(originalContent, language),
        modified: monaco.editor.createModel(proposedContent, language)
      })

      const addQuoteAction = (ed, labelPrefix = "") => {
        ed.addAction({
          id: 'quote-to-chat',
          label: `${labelPrefix}引用到聊天框`,
          contextMenuGroupId: 'navigation',
          contextMenuOrder: 1,
          run: (innerEd) => {
            const selection = innerEd.getSelection()
            if (!selection || selection.isEmpty()) return
            const startLine = selection.startLineNumber
            const endLine = selection.endLineNumber
            const range = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
            if (chatData && chatData.quoteCode) {
              chatData.quoteCode(filePath, range)
              Notice.launch({ msg: "已引用到聊天框" })
            } else {
              Notice.launch({ msg: "未找到聊天框实例" })
            }
          }
        })
      }

      addQuoteAction(diffEditor.getOriginalEditor(), "从原始文件")
      addQuoteAction(diffEditor.getModifiedEditor(), "从修改方案")
    } else {
      editor = monaco.editor.create(container, {
        value: content, language: language, theme: monacoTheme, automaticLayout: true, fontSize: 14, lineHeight: 20, wordWrap: wordWrap ? "on" : "off",
        readOnly: readOnly
      })
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { if (!readOnly) handleSave() })

      // Auto-save content state (Debounced 1s)
      let timer = null
      editor.onDidChangeModelContent(() => {
        if (readOnly) return
        content = editor.getValue()
        isDirty = true
        redraw()
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          settingData.fnCall("appUpdateData", [appId, { content: content }])
        }, 1000)
      })

      // Add Native Context Menu Action
      editor.addAction({
        id: 'quote-to-chat',
        label: '引用到聊天框',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1,
        run: (ed) => {
          const selection = ed.getSelection()
          if (!selection || selection.isEmpty()) return
          const startLine = selection.startLineNumber
          const endLine = selection.endLineNumber
          const range = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
          if (chatData && chatData.quoteCode) {
            chatData.quoteCode(filePath, range)
            Notice.launch({ msg: "已引用到聊天框" })
          } else {
            Notice.launch({ msg: "未找到聊天框实例" })
          }
        }
      })
    }
    redraw()
  }

  const handleAccept = async () => {
    const newContent = proposedContent
    const res = await settingData.fnCall("appDispatch", [appId, "acceptDiff", { proposedContent: newContent }])
    if (res.ok) {
      content = newContent
      isDiff = false
      isDirty = false
      if (confirmId) {
        await comData.data.edit(data => {
          data.chatLists.forEach(list => {
            const cmd = list.confirmCmds.find(c => c.id === confirmId);
            if (cmd) {
              cmd.comment = localComment
              cmd.confirm = "yes"
            }
          })
        })
        confirmId = null
        localComment = ""
      }
      updateEditor()
    } else {
      Notice.launch({ msg: res.msg })
    }
  }

  const handleReject = async () => {
    if (confirmId) {
      await comData.data.edit(data => {
        data.chatLists.forEach(list => {
          const cmd = list.confirmCmds.find(c => c.id === confirmId);
          if (cmd) {
            cmd.comment = localComment
            cmd.confirm = "no"
          }
        })
      })
      confirmId = null
      localComment = ""
    }
    isDiff = false
    updateEditor()
    Notice.launch({ msg: "操作已取消" })
  }

  // === Actions ===
  const actions = {
    newFile: () => { filePath = ""; content = ""; isDiff = false; isDirty = false; updateEditor() },
    openFile: async () => {
      const dialogRes = await settingData.fnCall("appOpenDialog", [{ title: "打开文件", filters: [{ name: "All", extensions: ["*"] }] }])
      if (!dialogRes.ok || dialogRes.canceled) return
      const res = await settingData.fnCall("appDispatch", [appId, "open", { filePath: dialogRes.filePath }])
      if (res.ok) { filePath = res.data.filePath; content = res.data.content; isDiff = false; isDirty = false; updateEditor() }
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
        filePath = msg.args.filePath; content = msg.args.content;
        isDiff = false; readOnly = !!msg.args.readOnly; isDirty = false;
        updateEditor()
        done({ ok: true })
      } else if (msg.action === "showDiff") {
        filePath = msg.args.filePath; originalContent = msg.args.originalContent
        proposedContent = msg.args.proposedContent; isDiff = true; confirmId = msg.args.confirmId
        updateEditor()
        done({ ok: true })
      } else if (msg.action === "acceptDiff") {
        proposedContent = msg.args.proposedContent; handleAccept(); done({ ok: true, msg: "Diff 已接受" })
      } else {
        done({ ok: false, msg: `Not supported: ${msg.action}` })
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
    view: (v) => m("",
      {
        style: {
          padding: "0.8rem 1.5rem",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          minWidth: "15.0rem",
          color: getColor('gray_4').front,
          fontSize: "1.3rem",
          transition: "background 0.1s"
        },
        onmouseenter: (e) => e.currentTarget.style.background = getColor('main').back,
        onmouseleave: (e) => e.currentTarget.style.background = "transparent",
        onclick: (e) => {
          e.stopPropagation()
          closeMenu()
          if (v.attrs.action) v.attrs.action()
        }
      },
      [
        m("span",
          {
            style: {
              pointerEvents: "none"
            }
          },
          v.attrs.label
        ),
        v.attrs.shortcut
          ? m("span",
            {
              style: {
                color: getColor('gray_2').back,
                fontSize: "1.2rem",
                marginLeft: "1.5rem",
                pointerEvents: "none"
              }
            },
            v.attrs.shortcut
          )
          : null
      ]
    )
  }

  const MenuDropdown = {
    view: (v) => m("",
      {
        style: {
          position: "absolute",
          top: "3.0rem",
          left: "0",
          background: getColor('gray_4').back,
          border: "1px solid " + getColor('gray_2').back,
          zIndex: 1000,
          borderRadius: "0.3rem",
          padding: "0.4rem 0",
          boxShadow: "0 0.2rem 0.8rem rgba(0,0,0,0.5)"
        }
      },
      v.attrs.items.map(item => item === "sep"
        ? m("",
          {
            style: {
              height: "1px",
              background: getColor('gray_2').back,
              margin: "0.4rem 0"
            }
          }
        )
        : m(MenuItem,
          {
            ...item,
            closeMenu
          }
        )
      )
    )
  }

  // === Main View ===
  return {
    oninit(vnode) {
      if (vnode.attrs.data) {
        const d = vnode.attrs.data
        isDiff = d.isDiff || false
        readOnly = !!d.readOnly
        filePath = d.filePath || ""
        content = d.content || ""
        originalContent = d.originalContent || ""
        proposedContent = d.proposedContent || ""
        confirmId = d.confirmId || null
      }

      // 💡 动态劫持 cancel 事件做未保存状态拦截
      const config = vnode.attrs.noticeConfig;
      if (config) {
        const originalCancel = config.cancel;
        config.cancel = async (dom, closeFn, tabData, event) => {
          if (isDirty && !readOnly) {
            Notice.launch({
              sign: "ask_save_prompt_" + appId,
              tip: "提示",
              hideBtn: 1, // 隐藏右上角确认与取消
              useMinus: false, // 隐藏最小化
              content: AskSaveComponent,
              contentAttrs: {
                onYes: async (closePrompt) => {
                  const saved = await handleSave(true);
                  if (saved) {
                    closePrompt();
                    if (originalCancel) {
                      await originalCancel(dom, closeFn, tabData, event);
                    } else {
                      closeFn();
                    }
                  }
                },
                onNo: async (closePrompt) => {
                  closePrompt();
                  if (originalCancel) {
                    await originalCancel(dom, closeFn, tabData, event);
                  } else {
                    closeFn();
                  }
                }
              }
            });
            return true; // 不关闭编辑器窗口，返回 true 拦截默认关闭行为
          }
          if (originalCancel) {
            return await originalCancel(dom, closeFn, tabData, event);
          } else {
            closeFn();
          }
        };
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
      // 💡 实时无缝跟随系统颜色主题
      const isDark = (commonData.themeColor || 0) === 0
      const activeTheme = isDark ? "vs-dark" : "vs"
      if (activeTheme !== currentTheme) {
        currentTheme = activeTheme
        if (window.monaco) {
          monaco.editor.setTheme(activeTheme)
        }
      }

      return m("", {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: getColor('gray_3').back,
          color: getColor('gray_3').front,
          overflow: "hidden"
        },
        onclick: closeMenu
      }, [
        // Menu Bar
        m("", {
          onpointerdown: (e) => e.stopPropagation(),
          style: {
            display: "flex",
            height: "3.5rem",
            padding: "0 1.0rem",
            background: getColor('gray_12').back,
            color: getColor('gray_12').front,
            alignItems: "center",
            fontSize: "1.3rem",
            userSelect: "none"
          }
        }, [
          m("", { style: { position: "relative" } }, [m("", { style: { padding: "0.5rem 1.0rem", cursor: "pointer", borderRadius: "0.3rem", background: activeMenu === "file" ? getColor('gray_2').back : "transparent" }, onclick: (e) => { e.stopPropagation(); toggleMenu("file") } }, "文件"), activeMenu === "file" ? m(MenuDropdown, { items: [{ label: "新建", action: actions.newFile }, { label: "打开...", action: actions.openFile, shortcut: "Ctrl+O" }, "sep", { label: "保存", action: actions.save, shortcut: "Ctrl+S" }, { label: "另存为...", action: actions.saveAs, shortcut: "Ctrl+Shift+S" }] }) : null]),
          m("", { style: { position: "relative" } }, [m("", { style: { padding: "0.5rem 1.0rem", cursor: "pointer", borderRadius: "0.3rem", background: activeMenu === "edit" ? getColor('gray_2').back : "transparent" }, onclick: (e) => { e.stopPropagation(); toggleMenu("edit") } }, "编辑"), activeMenu === "edit" ? m(MenuDropdown, { items: [{ label: "撤销", action: actions.undo, shortcut: "Ctrl+Z" }, { label: "重做", action: actions.redo, shortcut: "Ctrl+Y" }, "sep", { label: "查找", action: actions.find, shortcut: "Ctrl+F" }, { label: "替换", action: actions.replace, shortcut: "Ctrl+H" }] }) : null]),
          m("", { style: { position: "relative" } }, [m("", { style: { padding: "0.5rem 1.0rem", cursor: "pointer", borderRadius: "0.3rem", background: activeMenu === "view" ? getColor('gray_2').back : "transparent" }, onclick: (e) => { e.stopPropagation(); toggleMenu("view") } }, "视图"), activeMenu === "view" ? m(MenuDropdown, { items: [{ label: "自动换行", action: actions.toggleWordWrap, shortcut: wordWrap ? "开启" : "关闭" }] }) : null]),
          m("", { style: { flex: 1, textAlign: "center", opacity: 0.6, fontSize: "1.2rem", letterSpacing: "0.1rem" } }, (filePath ? filePath.split("/").pop() : "新文件") + (isDirty ? " *" : "")),
          m("", { style: { display: "flex", gap: "1.0rem", alignItems: "center" } }, [
            isDiff ? [
              m(Tag, {
                tagName: "input[type=text]",
                placeholder: "输入备注（可选）...",
                color: "gray_2",
                oninput: (dom, e) => localComment = dom.value,
                ext: {
                  value: localComment
                }
              }),
              m(Tag, {
                isBtn: true,
                isWide: true,
                color: "green_1",
                onclick: (dom, e) => { e.stopPropagation(); handleAccept() }
              }, "批准修改"),
              m(Tag, {
                isBtn: true,
                isWide: true,
                color: "gray_2",
                onclick: (dom, e) => { e.stopPropagation(); handleReject() }
              }, "拒绝")
            ] : m(Tag, {
              isBtn: true,
              isWide: true,
              color: "main",
              onclick: (dom, e) => { e.stopPropagation(); handleSave() }
            }, "保存")
          ])
        ]),
        // Path
        m("", { style: { display: "flex", height: "2.2rem", padding: "0 1.0rem", background: getColor('gray_1').back, alignItems: "center", fontSize: "1.1rem", color: readOnly ? getColor('pink_1').front : getColor('gray_1').front, boxShadow: "inset 0 0.1rem 0.3rem rgba(0,0,0,0.2)" } }, [
          readOnly ? m("span", { style: { fontWeight: "bold", marginRight: "0.8rem" } }, "[只读预览]") : null,
          filePath || "未选择文件"
        ]),
        // Editor
        m("", { style: { flex: 1, position: "relative", margin: "0", overflow: "hidden" } }, [
          m("", { class: "monaco-container", style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" } })
        ])
      ])
    }
  }
}
