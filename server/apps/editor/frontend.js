
import editorData from "./editorData.js"
import { themes as noctisThemeList, defineAllThemes } from "./frontendModules/noctisThemes.js"

// Editor App 前端组件 (Closure Version)
export default ({ appId, m, Notice, ioSocket, comData, commonData, chatData, settingData, Box, Tag, getColor, trs, sysMenu }) => {
  const t = (key, dict) => (typeof trs === "function" ? trs(key, dict) : (dict?.cn || key))

  // 💡 跨窗口共享状态：在前端全局唯一的 commonData 上挂载并初始化
  if (commonData.editorSendDiff === undefined) {
    commonData.editorSendDiff = true
  }
  if (commonData.editorOpenFileAfterAccept === undefined) {
    commonData.editorOpenFileAfterAccept = false
  }
  if (commonData.editorFontSize === undefined) {
    commonData.editorFontSize = 16
  }
  if (commonData.editorTheme === undefined) {
    commonData.editorTheme = "noctis-bordo"
  }

  // === Private State ===
  let isDiff = false
  let readOnly = false
  let isCheckoutMode = true
  let isDirty = false
  let filePath = ""
  let content = ""
  let originalContent = ""
  let proposedContent = ""
  let confirmId = null
  let fileId = null
  let pendingLine = 0 // 打开文件后待定位的行号（0 表示无需定位）
  let localComment = ""
  let isConflictDiff = false
  let annotations = []
  let diffChanges = []
  let currentDiffIndex = 0
  let reason = ""

  let wordWrap = false
  let currentFontSize = commonData.editorFontSize || 16
  let currentTabSize = 2
  let showMinimap = true

  const applyEditorOptions = () => {
    const opts = {
      fontSize: currentFontSize,
      lineHeight: Math.round(currentFontSize * 1.5),
      wordWrap: wordWrap ? "on" : "off",
      tabSize: currentTabSize,
      minimap: { enabled: showMinimap }
    }
    editor?.updateOptions(opts)
    diffEditor?.updateOptions(opts)
  }

  let editor = null
  let diffEditor = null
  let container = null
  let currentTheme = null
  const redraw = () => m.redraw()

  // === Helpers ===
  const loadMonaco = () => {
    if (window.monaco) {
      defineAllThemes(window.monaco)
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const script = document.createElement("script")
      script.src = "/api/apps/editor/monaco/loader.js"
      script.onload = () => {
        require.config({ paths: { vs: "/api/apps/editor/monaco/vs" } })
        require(["vs/editor/editor.main"], () => {
          defineAllThemes(window.monaco)
          resolve()
        })
      }
      document.head.appendChild(script)
    })
  }

  const getActiveMonacoTheme = () => {
    if (commonData.editorTheme) return commonData.editorTheme
    const isDark = (commonData.themeColor || 0) === 0
    return isDark ? "noctis-bordo" : "vs"
  }

  const applyTheme = (themeId) => {
    commonData.editorTheme = themeId
    currentTheme = themeId
    if (window.monaco) {
      monaco.editor.setTheme(themeId)
    }
    m.redraw()
  }

  const openThemeSelector = () => {
    Notice.launch({
      newWindow: true,
      sign: "editor_theme_selector_" + appId,
      width: 250,
      tip: t("编辑器/菜单/颜色主题", { cn: "选择颜色主题", en: "Select Color Theme" }),
      content: {
        view: (v) => {
          const activeId = getActiveMonacoTheme()
          const darkThemes = noctisThemeList.filter(th => th.type === "dark")
          const lightThemes = noctisThemeList.filter(th => th.type === "light")
          const defaultThemes = [
            { id: "vs-dark", name: "VS Code Dark" },
            { id: "vs", name: "VS Code Light" }
          ]

          const menuItems = []

          darkThemes.forEach(th => {
            const isSelected = th.id === activeId
            menuItems.push({
              name: (isSelected ? "✓ " : "  ") + th.name,
              onclick: () => {
                applyTheme(th.id)
              }
            })
          })

          menuItems.push("sep")

          lightThemes.forEach(th => {
            const isSelected = th.id === activeId
            menuItems.push({
              name: (isSelected ? "✓ " : "  ") + th.name,
              onclick: () => {
                applyTheme(th.id)
              }
            })
          })

          menuItems.push("sep")

          defaultThemes.forEach(th => {
            const isSelected = th.id === activeId
            menuItems.push({
              name: (isSelected ? "✓ " : "  ") + th.name,
              onclick: () => {
                applyTheme(th.id)
              }
            })
          })

          return m(sysMenu,
            {
              menuItems
            }
          )
        }
      }
    })
  }

  // 💡 自定义保存冲突确认弹窗
  const ConflictResolveComponent = {
    view: (vnode) => m("",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem"
        }
      },
      [
        m(Box,
          {
            isBlock: true,
            style: {
              marginBottom: "1rem"
            }
          },
          "该文件在外部已被修改，直接保存将覆盖外部的修改！是否强行覆盖，或重新加载最新内容？"
        ),
        m("",
          {
            style: {
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem"
            }
          },
          [
            m(Box,
              {
                isBtn: true,
                color: "main",
                onclick: async () => {
                  try {
                    vnode.attrs.delete()
                    const readRes = await settingData.fnCall("appDispatch", [
                      appId,
                      "readDiskContent",
                      {
                        filePath: filePath
                      }
                    ])
                    if (readRes.ok) {
                      originalContent = readRes.data.content
                      proposedContent = content
                      isDiff = true
                      isConflictDiff = true
                      updateEditor()
                    } else {
                      Notice.launch({
                        msg: readRes.msg
                      })
                    }
                  } catch (err) {
                    console.error(err)
                    Notice.launch({
                      msg: err.message
                    })
                  }
                }
              },
              "对比差异"
            ),
            m(Box,
              {
                isBtn: true,
                color: "pink_1",
                onclick: async () => {
                  try {
                    vnode.attrs.delete()
                    await handleSave(false, true)
                  } catch (err) {
                    console.error(err)
                    Notice.launch({
                      msg: err.message
                    })
                  }
                }
              },
              "强行覆盖"
            ),
            m(Box,
              {
                isBtn: true,
                color: "main",
                onclick: async () => {
                  try {
                    vnode.attrs.delete()
                    const openRes = await settingData.fnCall("appDispatch", [
                      appId,
                      "open",
                      {
                        filePath: filePath
                      }
                    ])
                    if (openRes.ok) {
                      content = openRes.data.content
                      if (editor) {
                        editor.setValue(content)
                      }
                      isDirty = false
                      redraw()
                      Notice.launch({
                        msg: "文件内容已重新加载喵！"
                      })
                    } else {
                      Notice.launch({
                        msg: openRes.msg
                      })
                    }
                  } catch (err) {
                    console.error(err)
                    Notice.launch({
                      msg: err.message
                    })
                  }
                }
              },
              "重新加载"
            ),
            m(Box,
              {
                isBtn: true,
                color: "gray_2",
                onclick: () => vnode.attrs.delete()
              },
              "取消"
            )
          ]
        )
      ]
    )
  }

  const handleSave = async (forceDialog = false, forceWrite = false) => {
    // 冲突差异对比模式下，主编辑器已 dispose（走 diffEditor），
    // 此时"保留我的修改"应保存用户本地 content，而非从 editor 取值
    if (!editor && !isDiff) {
      return false
    }
    let currentPath = filePath
    try {
      if (!currentPath || forceDialog) {
        const dialogRes = await settingData.fnCall("appSaveDialog", [
          {
            title: "另存为",
            filePath: currentPath,
            filters: [
              {
                name: "文本文件",
                extensions: [
                  "txt",
                  "js",
                  "py",
                  "md",
                  "html",
                  "css",
                  "json"
                ]
              },
              {
                name: "所有文件",
                extensions: [
                  "*"
                ]
              }
            ]
          }
        ])
        if (!dialogRes.ok || dialogRes.canceled) {
          return false
        }
        currentPath = dialogRes.filePath
      }
      // diff 模式下 editor 为 null，使用用户本地 content；否则从主编辑器取当前值
      const txt = editor ? editor.getValue() : content
      const res = await settingData.fnCall("appDispatch", [
        appId,
        "save",
        {
          content: txt,
          filePath: currentPath,
          force: forceWrite
        }
      ])
      if (res.ok) {
        filePath = res.data.filePath
        content = txt
        isDirty = false
        redraw()
        Notice.launch({
          msg: res.msg
        })
        return true
      } else if (res.code === "MODIFIED_EXTERNALLY") {
        Notice.launch({
          sign: "conflict_save_prompt_" + appId,
          tip: "保存冲突",
          hideBtn: 1,
          useMinus: false,
          content: ConflictResolveComponent
        })
        return false
      } else {
        Notice.launch({
          msg: res.msg
        })
        return false
      }
    } catch (err) {
      console.error(err)
      Notice.launch({
        msg: `保存发生异常: ${err.message}`
      })
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
    diffChanges = []
    currentDiffIndex = 0

    const extension = (filePath || "").split(".").pop()
    const langMap = { js: "javascript", py: "python", md: "markdown", html: "html", css: "css", json: "json", coffee: "coffeescript" }
    const language = langMap[extension] || "text"

    const monacoTheme = getActiveMonacoTheme()
    currentTheme = monacoTheme

    if (isDiff) {
      diffEditor = monaco.editor.createDiffEditor(container, {
        theme: monacoTheme,
        automaticLayout: true,
        readOnly: true,
        renderSideBySide: true,
        fontSize: 16,
        lineHeight: 24,
        fontFamily: 'Menlo, Monaco, "Courier New", Consolas, monospace'
      })
      diffEditor.setModel({
        original: monaco.editor.createModel(originalContent, language),
        modified: monaco.editor.createModel(proposedContent, language)
      })

      diffEditor.onDidUpdateDiff(() => {
        const changes = diffEditor.getLineChanges()
        if (changes && changes.length > 0) {
          diffChanges = changes
          const firstChange = changes[0]
          diffEditor.getModifiedEditor().revealLineInCenter(firstChange.modifiedStartLineNumber)
          redraw()
        }
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

      // Add Annotation Action to Modified Editor (where user reviews AI changes)
      diffEditor.getModifiedEditor().addAction({
        id: 'add-annotation',
        label: '添加行批注',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2,
        run: (innerEd) => {
          const selection = innerEd.getSelection()
          if (!selection || selection.isEmpty()) {
            return Notice.launch({
              msg: "请先选择需要批注的行范围喵！"
            })
          }
          const startLine = selection.startLineNumber
          const endLine = selection.endLineNumber

          let tempComment = ""
          const InputComponent = {
            view: () => m(Box,
              {
                tagName: "textarea",
                oninput: (dom, e) => {
                  tempComment = e.target.value
                },
                ext: {
                  placeholder: "输入批注内容..."
                },
              }
            )
          }

          Notice.launch({
            tip: `添加第 ${startLine} - ${endLine} 行的批注`,
            hideBtn: 0,
            useMinus: false,
            content: InputComponent,
            confirm: async (dom, closeFn) => {
              try {
                if (!tempComment.trim()) {
                  Notice.launch({
                    msg: "批注内容不能为空喵！"
                  })
                  return true
                }
                annotations.push({
                  startLine: startLine,
                  endLine: endLine,
                  comment: tempComment.trim()
                })
                redraw()
                closeFn()
              } catch (err) {
                console.error(err)
                Notice.launch({
                  msg: err.message
                })
              }
            }
          })
        }
      })
    } else {
      editor = monaco.editor.create(container, {
        value: content,
        language: language,
        theme: monacoTheme,
        automaticLayout: true,
        fontSize: 16,
        lineHeight: 24,
        fontFamily: 'Menlo, Monaco, "Courier New", Consolas, monospace',
        wordWrap: wordWrap ? "on" : "off",
        readOnly: readOnly
      })
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { if (!readOnly) handleSave() })

      // 打开文件后定位到指定行（来自 quickOpen 全文搜索等场景）
      if (pendingLine > 0) {
        const targetLine = Math.min(pendingLine, editor.getModel()?.getLineCount() || pendingLine)
        editor.setPosition({ lineNumber: targetLine, column: 1 })
        editor.revealLineInCenter(targetLine)
        pendingLine = 0
      }

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
      // 💡 批量审批的临时 diff 窗口（经 ChatBatchReview「打开编辑器」或 waitConfirm autoLaunch 打开，携带 fileId）：
      // 批准后应销毁自身，否则会残留为普通编辑窗口，叠加「同时打开」新窗口导致多开
      const isBatchTempDiff = !!fileId
      if (confirmId) {
        let diffBlock = ""
        if (commonData.editorSendDiff && diffChanges.length > 0) {
          const originalLines = originalContent.split("\n")
          const modifiedLines = proposedContent.split("\n")
          const diffLines = []
          diffChanges.forEach(change => {
            diffLines.push(`@@ -${change.originalStartLineNumber},${change.originalEndLineNumber - change.originalStartLineNumber + 1} +${change.modifiedStartLineNumber},${change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1} @@`)
            if (change.originalEndLineNumber >= change.originalStartLineNumber) {
              for (let l = change.originalStartLineNumber; l <= change.originalEndLineNumber; l++) {
                diffLines.push(`-${originalLines[l - 1]}`)
              }
            }
            if (change.modifiedEndLineNumber >= change.modifiedStartLineNumber) {
              for (let l = change.modifiedStartLineNumber; l <= change.modifiedEndLineNumber; l++) {
                diffLines.push(`+${modifiedLines[l - 1]}`)
              }
            }
          })

          if (diffLines.length > 0) {
            diffBlock = `\`\`\`diff\n${diffLines.join("\n")}\n\`\`\``
          }
        }

        let notesText = ""
        if (annotations.length > 0) {
          notesText = annotations.map(a => `- 行 L${a.startLine}-L${a.endLine}: ${a.comment}`).join("\n")
        }

        const editorComment = localComment ? localComment.trim() : ""

        await comData.data.edit(data => {
          data.chatLists.forEach(list => {
            const cmd = list.confirmCmds.find(c => c.id === confirmId);
            if (cmd) {
              // 💡 批量文件审查模式支持
              if (Array.isArray(cmd.ext?.files) && (fileId || filePath)) {
                const targetFile = cmd.ext.files.find(f => (fileId && f.fileId === fileId) || (filePath && f.path === filePath))
                if (targetFile) {
                  targetFile.status = "approved"
                  targetFile.diff = diffBlock || null
                  targetFile.notes = notesText || null
                  targetFile.comment = editorComment
                }
              } else {
                let parts = []
                if (diffBlock) parts.push(`批准修改的 Diff 变动详情如下：\n${diffBlock}`)
                if (notesText) parts.push(`具体行批注反馈如下：\n${notesText}`)
                if (editorComment) parts.push(editorComment)
                cmd.comment = parts.join("\n\n")
                cmd.confirm = "yes"
              }
            }
          })
        })
        confirmId = null
        fileId = null
        localComment = ""
        annotations = []
      }
      if (isBatchTempDiff) {
        // 临时 diff 窗口：先按「同时打开」开关决定是否新开编辑窗口，再关闭自身
        if (commonData.editorOpenFileAfterAccept && filePath) {
          settingData.fnCall("appLaunch", ["editor", { data: { filePath: filePath, content: newContent, singleInstance: true } }])
        }
        settingData.fnCall("appClose", [appId])
      } else {
        // 单文件场景（editorPatcher showDiff）：原地恢复普通编辑，保留窗口
        if (commonData.editorOpenFileAfterAccept && filePath) {
          settingData.fnCall("appLaunch", ["editor", { data: { filePath: filePath, content: newContent, singleInstance: true } }])
        }
        updateEditor()
      }
    } else {
      Notice.launch({ msg: res.msg })
    }
  }

  const handleReject = async () => {
    // 💡 批量审批的临时 diff 窗口（fileId 有值）：拒绝后应销毁自身，避免残留为普通编辑窗口
    const isBatchTempDiff = !!fileId
    if (confirmId) {
      let notesText = ""
      if (annotations.length > 0) {
        notesText = annotations.map(a => `- 行 L${a.startLine}-L${a.endLine}: ${a.comment}`).join("\n")
      }
      const editorComment = localComment ? localComment.trim() : ""

      await comData.data.edit(data => {
        data.chatLists.forEach(list => {
          const cmd = list.confirmCmds.find(c => c.id === confirmId);
          if (cmd) {
            if (Array.isArray(cmd.ext?.files) && (fileId || filePath)) {
              const targetFile = cmd.ext.files.find(f => (fileId && f.fileId === fileId) || (filePath && f.path === filePath))
              if (targetFile) {
                targetFile.status = "rejected"
                targetFile.notes = notesText || null
                targetFile.comment = editorComment || "用户在编辑器中拒绝此文件修改"
              }
            } else {
              let parts = []
              if (notesText) parts.push(`具体行批注反馈如下：\n${notesText}`)
              if (editorComment) parts.push(editorComment)
              cmd.comment = parts.join("\n\n")
              cmd.confirm = "no"
            }
          }
        })
      })
      confirmId = null
      fileId = null
      localComment = ""
      annotations = []
    }
    if (isBatchTempDiff) {
      // 临时 diff 窗口：拒绝后关闭自身（拒绝不新开窗口）
      settingData.fnCall("appClose", [appId])
    } else {
      isDiff = false
      updateEditor()
    }
  }

  // === Actions ===
  const actions = {
    newFile: () => { filePath = ""; content = ""; isDiff = false; isDirty = false; updateEditor() },
    openFile: async () => {
      const dialogRes = await settingData.fnCall("appOpenDialog", [{ title: t("编辑器/标题/打开文件", { cn: "打开文件", en: "Open File" }), filters: [{ name: "All", extensions: ["*"] }] }])
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
    formatDocument: () => {
      editor?.getAction('editor.action.formatDocument')?.run()
    },
    revealInExplorer: async () => {
      if (!filePath) return
      const dir = filePath.substring(0, filePath.lastIndexOf("/")) || "/"
      await settingData.fnCall("appLaunch", ["explorer", { dir }])
    },
    toggleWordWrap: () => {
      wordWrap = !wordWrap
      applyEditorOptions()
      redraw()
    },
    toggleMinimap: () => {
      showMinimap = !showMinimap
      applyEditorOptions()
      redraw()
    },
    zoomIn: () => {
      if (currentFontSize < 36) {
        currentFontSize += 2
        commonData.editorFontSize = currentFontSize
        applyEditorOptions()
        redraw()
      }
    },
    zoomOut: () => {
      if (currentFontSize > 10) {
        currentFontSize -= 2
        commonData.editorFontSize = currentFontSize
        applyEditorOptions()
        redraw()
      }
    },
    zoomReset: () => {
      currentFontSize = 16
      commonData.editorFontSize = currentFontSize
      applyEditorOptions()
      redraw()
    },
    toggleTabSize: () => {
      currentTabSize = currentTabSize === 2 ? 4 : 2
      applyEditorOptions()
      redraw()
    }
  }

  // === Notice 菜单系统 (对齐 FileMenu.js 与样式设计指南) ===
  const openNoticeMenu = (menuKey, e) => {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation()
    const target = e?.currentTarget || e?.target
    const rect = target && typeof target.getBoundingClientRect === "function" ? target.getBoundingClientRect() : { left: 10, bottom: 40 }
    const x = Math.max(10, rect.left)
    const y = rect.bottom + 6

    const menuConfigs = {
      file: {
        tip: t("编辑器/菜单/文件", { cn: "文件", en: "File" }),
        items: [
          {
            label: t("编辑器/菜单/新建", { cn: "新建文件", en: "New File" }),
            action: actions.newFile
          },
          {
            label: t("编辑器/菜单/打开", { cn: "打开文件...", en: "Open File..." }),
            shortcut: "Ctrl+O",
            action: actions.openFile
          },
          "sep",
          {
            label: t("编辑器/菜单/保存", { cn: "保存", en: "Save" }),
            shortcut: "Ctrl+S",
            action: actions.save
          },
          {
            label: t("编辑器/菜单/另存为", { cn: "另存为...", en: "Save As..." }),
            shortcut: "Ctrl+Shift+S",
            action: actions.saveAs
          },
          ...(filePath ? [
            "sep",
            {
              label: t("编辑器/菜单/在文件管理器中定位", { cn: "在文件管理器中打开", en: "Reveal in Explorer" }),
              action: actions.revealInExplorer
            }
          ] : [])
        ]
      },
      edit: {
        tip: t("编辑器/菜单/编辑", { cn: "编辑", en: "Edit" }),
        items: [
          {
            label: t("编辑器/菜单/撤销", { cn: "撤销", en: "Undo" }),
            shortcut: "Ctrl+Z",
            action: actions.undo
          },
          {
            label: t("编辑器/菜单/重做", { cn: "重做", en: "Redo" }),
            shortcut: "Ctrl+Y",
            action: actions.redo
          },
          "sep",
          {
            label: t("编辑器/菜单/查找", { cn: "查找", en: "Find" }),
            shortcut: "Ctrl+F",
            action: actions.find
          },
          {
            label: t("编辑器/菜单/替换", { cn: "替换", en: "Replace" }),
            shortcut: "Ctrl+H",
            action: actions.replace
          },
          "sep",
          {
            label: t("编辑器/菜单/格式化文档", { cn: "格式化代码", en: "Format Code" }),
            shortcut: "Shift+Alt+F",
            action: actions.formatDocument
          }
        ]
      },
      view: {
        tip: t("编辑器/菜单/视图", { cn: "视图", en: "View" }),
        getItems: () => [
          {
            label: t("编辑器/菜单/自动换行", { cn: "自动换行", en: "Word Wrap" }),
            shortcut: wordWrap ? t("系统/状态/开启", { cn: "开启", en: "ON" }) : t("系统/状态/关闭", { cn: "关闭", en: "OFF" }),
            keepOpen: true,
            action: actions.toggleWordWrap
          },
          {
            label: t("编辑器/菜单/小地图", { cn: "代码小地图", en: "Minimap" }),
            shortcut: showMinimap ? t("系统/状态/显示", { cn: "显示", en: "ON" }) : t("系统/状态/隐藏", { cn: "隐藏", en: "OFF" }),
            keepOpen: true,
            action: actions.toggleMinimap
          },
          "sep",
          {
            label: t("编辑器/菜单/放大字体", { cn: "放大字体 (+2px)", en: "Zoom In" }),
            shortcut: `${currentFontSize}px`,
            keepOpen: true,
            action: actions.zoomIn
          },
          {
            label: t("编辑器/菜单/缩小字体", { cn: "缩小字体 (-2px)", en: "Zoom Out" }),
            shortcut: `${currentFontSize}px`,
            keepOpen: true,
            action: actions.zoomOut
          },
          {
            label: t("编辑器/菜单/重置字体", { cn: "重置字号 (16px)", en: "Reset Zoom" }),
            action: actions.zoomReset
          },
          "sep",
          {
            label: t("编辑器/菜单/缩进空格", { cn: "切换缩进大小", en: "Indent Size" }),
            shortcut: `${currentTabSize} ` + t("编辑器/菜单/空格", { cn: "空格", en: "Spaces" }),
            action: actions.toggleTabSize
          },
          "sep",
          {
            label: t("编辑器/菜单/颜色主题", { cn: "颜色主题...", en: "Color Theme..." }),
            shortcut: noctisThemeList.find(th => th.id === getActiveMonacoTheme())?.name || "Noctis Bordo",
            action: openThemeSelector
          }
        ]
      }
    }

    const currentMenu = menuConfigs[menuKey]
    if (!currentMenu) return

    Notice.launch({
      newWindow: true,
      sign: "editor_menu_" + appId + "_" + menuKey,
      win: { x, y },
      tip: currentMenu.tip,
      content: {
        view: (v) => {
          const rawItems = currentMenu.getItems ? currentMenu.getItems() : currentMenu.items
          return m(sysMenu,
            {
              menuItems: rawItems.map(item => {
                if (item === "sep") return "sep"
                return {
                  name: item.label,
                  shortcut: item.shortcut,
                  onclick: () => {
                    if (!item.keepOpen) {
                      v.attrs.delete()
                    }
                    if (item.action) item.action()
                    m.redraw()
                  }
                }
              })
            }
          )
        }
      }
    })
  }

  // === Instance Interface ===
  const instanceInterface = {
    get filePath() { return filePath },
    get isDirty() { return isDirty },
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
        isConflictDiff = false;
        annotations = [];
        reason = "";
        updateEditor()
        done({ ok: true })
      } else if (msg.action === "showDiff") {
        filePath = msg.args.filePath; originalContent = msg.args.originalContent
        proposedContent = msg.args.proposedContent; isDiff = true; confirmId = msg.args.confirmId
        isConflictDiff = false;
        annotations = [];
        reason = msg.args.reason || "";
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

  // === Main View ===
  return {
    oninit(vnode) {
      if (vnode.attrs.data) {
        const d = vnode.attrs.data
        isDiff = d.isDiff || false
        readOnly = !!d.readOnly
        isCheckoutMode = d.isCheckoutMode !== false
        filePath = d.filePath || ""
        content = d.content || ""
        originalContent = d.originalContent || ""
        proposedContent = d.proposedContent || ""
        confirmId = d.confirmId || null
        fileId = d.fileId || null
        isConflictDiff = d.isConflictDiff || false
        annotations = d.annotations || []
        reason = d.reason || ""
        pendingLine = d.line ? parseInt(d.line, 10) : 0
      }

      // 💡 运行时重复检测与静默置顶销毁逻辑 (如果指定了 singleInstance)
      if (filePath && !isDiff && vnode.attrs.data?.singleInstance) {
        const resolvedPath = filePath.toLowerCase()
        let existingAppId = null

        // 🚀 通过 Notice 窗口管理器的全局 Tab 数组进行查重（即使标签被 unmount 隐藏也依然存在于 dataArr 中）
        const dataArr = Notice.data?.dataArr || []
        for (const tab of dataArr) {
          if (tab.group === "editor" && tab.contentAttrs && tab.contentAttrs.appId !== appId) {
            // 排除临时的 Diff 对比窗口（批准/拒绝后会自动关闭，不算"已打开"）
            if (tab.contentAttrs.data?.isDiff) continue
            const otherPath = tab.contentAttrs.data?.filePath
            if (otherPath && otherPath.toLowerCase() === resolvedPath) {
              existingAppId = tab.contentAttrs.appId
              break
            }
          }
        }

        if (existingAppId) {
          // 💡 用 appActive 轻量激活（只 emit app:active 激活窗口，不重建组件），
          // 避免 appGuiRestore 的 app:launch 重新 import frontend.js 执行组件工厂，
          // 覆盖 commonData.appsData 注册表为未挂载的新实例（container=null），导致 open 刷新静默失败
          // 🔄 并配合 await sleep 确保警告窗口在置顶后弹出，避免被原窗口遮住
          ; (async () => {
            await settingData.fnCall("appActive", [existingAppId])
            await new Promise(resolve => setTimeout(resolve, 100))

            // 🔄 单例命中：旧窗口可能未感知磁盘最新内容（如批准 Diff 后文件已变更）
            // 标准软件行为：无未保存修改 → 静默重新加载；有未保存修改 → 弹窗询问，避免静默覆盖丢失数据
            // 💡 关键：editorData 因前端子模块缓存穿透(时间戳重写)是每Tab独立实例，必须通过共享的 commonData.appsData 访问其他窗口实例
            const existingEditorData = commonData?.appsData?.[existingAppId]
            const existingInstance = existingEditorData?.instances?.get(existingAppId)
            if (existingInstance && existingInstance.isDirty) {
              Notice.launch({
                sign: "ask_reload_" + existingAppId,
                tip: "文件已在外部被修改",
                msg: "当前窗口存在未保存的修改，且该文件在磁盘上已被外部更新（如 AI 批准修改）。重新加载将丢失未保存的修改，是否继续？",
                confirm: async () => {
                  await settingData.fnCall("appDispatch", [existingAppId, "open", { filePath: filePath }])
                  return undefined
                }
              })
            } else {
              settingData.fnCall("appDispatch", [existingAppId, "open", { filePath: filePath }])
            }
          })()

          setTimeout(() => {
            if (vnode.attrs.delete) vnode.attrs.delete()
            settingData.fnCall("appClose", [appId])
          }, 0)
          return
        }
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
      if (editor) {
        editor.dispose()
      }
      if (diffEditor) {
        diffEditor.dispose()
      }
    },
    view(vnode) {
      // 💡 实时无缝跟随系统颜色主题
      const activeTheme = getActiveMonacoTheme()
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
        }
      }, [
        // Menu Bar
        m("", {
          onpointerdown: (e) => e.stopPropagation(),
          style: {
            display: "flex",
            height: "3.5rem",
            padding: "0 0.8rem",
            background: getColor('gray_12').back,
            color: getColor('gray_12').front,
            alignItems: "center",
            fontSize: "1.3rem",
            userSelect: "none",
            borderBottom: "1px solid " + getColor('gray_3').back,
            gap: "0.5rem"
          }
        }, [
          m("",
            {
              style: {
                padding: "0.4rem 1.2rem",
                borderRadius: "3rem",
                cursor: "pointer",
                userSelect: "none",
                background: "transparent",
                color: getColor("gray_12").front,
                display: "inline-flex",
                alignItems: "center",
                transition: "background 0.2s ease"
              },
              onpointerenter: function () {
                this.style.background = "rgba(128, 128, 128, 0.15)"
              },
              onpointerleave: function () {
                this.style.background = "transparent"
              },
              onclick: (e) => openNoticeMenu("file", e)
            },
            t("编辑器/菜单/文件",
              {
                cn: "文件",
                en: "File"
              }
            )
          ),

          m("",
            {
              style: {
                padding: "0.4rem 1.2rem",
                borderRadius: "3rem",
                cursor: "pointer",
                userSelect: "none",
                background: "transparent",
                color: getColor("gray_12").front,
                display: "inline-flex",
                alignItems: "center",
                transition: "background 0.2s ease"
              },
              onpointerenter: function () {
                this.style.background = "rgba(128, 128, 128, 0.15)"
              },
              onpointerleave: function () {
                this.style.background = "transparent"
              },
              onclick: (e) => openNoticeMenu("edit", e)
            },
            t("编辑器/菜单/编辑",
              {
                cn: "编辑",
                en: "Edit"
              }
            )
          ),

          m("",
            {
              style: {
                padding: "0.4rem 1.2rem",
                borderRadius: "3rem",
                cursor: "pointer",
                userSelect: "none",
                background: "transparent",
                color: getColor("gray_12").front,
                display: "inline-flex",
                alignItems: "center",
                transition: "background 0.2s ease"
              },
              onpointerenter: function () {
                this.style.background = "rgba(128, 128, 128, 0.15)"
              },
              onpointerleave: function () {
                this.style.background = "transparent"
              },
              onclick: (e) => openNoticeMenu("view", e)
            },
            t("编辑器/菜单/视图",
              {
                cn: "视图",
                en: "View"
              }
            )
          ),

          m("", {
            style: {
              flex: 1,
              textAlign: "center",
              opacity: 0.6,
              fontSize: "1.2rem",
              letterSpacing: "0.1rem"
            }
          }, (filePath ? filePath.split("/").pop() : t("编辑器/顶栏/新文件", { cn: "新文件", en: "新文件" })) + (isDirty ? " *" : ""))
        ]),

        // Row 2: Action Bar (Always visible to keep layout consistent and give space to save/approve buttons)
        m("", {
          style: {
            display: "flex",
            height: "3.5rem",
            padding: "0 1.0rem",
            background: getColor('gray_12').back,
            color: getColor('gray_12').front,
            alignItems: "center",
            gap: "1.0rem",
            borderBottom: "1px solid " + getColor('gray_3').back,
            flexShrink: 0
          }
        }, [
          isConflictDiff
            ? [
              m(Tag,
                {
                  isBtn: true,
                  isWide: true,
                  color: "pink_1",
                  onclick: async (dom, e) => {
                    e.stopPropagation()
                    const saved = await handleSave(false, true)
                    if (saved) {
                      isConflictDiff = false
                      isDiff = false
                      updateEditor()
                    }
                  }
                },
                "保留我的修改"
              ),
              m(Tag,
                {
                  isBtn: true,
                  isWide: true,
                  color: "main",
                  onclick: async (dom, e) => {
                    e.stopPropagation()
                    try {
                      const openRes = await settingData.fnCall("appDispatch", [
                        appId,
                        "open",
                        {
                          filePath: filePath
                        }
                      ])
                      if (openRes.ok) {
                        content = openRes.data.content
                        isConflictDiff = false
                        isDiff = false
                        isDirty = false
                        updateEditor()
                        Notice.launch({
                          msg: "已放弃本地修改，加载外部内容"
                        })
                      } else {
                        Notice.launch({
                          msg: openRes.msg
                        })
                      }
                    } catch (err) {
                      console.error(err)
                      Notice.launch({
                        msg: err.message
                      })
                    }
                  }
                },
                "加载外部修改"
              ),
              m(Tag,
                {
                  isBtn: true,
                  isWide: true,
                  color: "gray_2",
                  onclick: (dom, e) => {
                    e.stopPropagation()
                    isConflictDiff = false
                    isDiff = false
                    updateEditor()
                  }
                },
                "返回编辑"
              )
            ]
            : (isDiff && isCheckoutMode
              ? [
                m(Tag,
                  {
                    color: "gray_2",
                    styleExt: {
                      display: "inline-flex",
                      alignItems: "center",
                      height: "2.5rem",
                      padding: "0 0.8rem",
                      borderRadius: "3.0rem"
                    }
                  },
                  [
                    m(
                      Box,
                      {
                        color: "pink_1",
                        isSwitch: true,
                        value: commonData.editorSendDiff,
                        style: {
                          margin: "0",
                          marginRight: "0.5rem"
                        },
                        onclick: (el, e, v, box_this) => {
                          commonData.editorSendDiff = box_this.data.value
                          redraw()
                        }
                      }
                    ),
                    "发送 Diff"
                  ]
                ),
                m(Tag,
                  {
                    color: "gray_2",
                    styleExt: {
                      display: "inline-flex",
                      alignItems: "center",
                      height: "2.5rem",
                      padding: "0 0.8rem",
                      borderRadius: "3.0rem"
                    }
                  },
                  [
                    m(
                      Box,
                      {
                        color: "pink_1",
                        isSwitch: true,
                        value: commonData.editorOpenFileAfterAccept,
                        style: {
                          margin: "0",
                          marginRight: "0.5rem"
                        },
                        onclick: (el, e, v, box_this) => {
                          commonData.editorOpenFileAfterAccept = box_this.data.value
                          redraw()
                        }
                      }
                    ),
                    "同时打开"
                  ]
                ),
                m(Tag,
                  {
                    tagName: "input[type=text]",
                    placeholder: "输入备注（可选）...",
                    color: "gray_2",
                    oninput: (dom, e) => {
                      localComment = dom.value
                    },
                    ext: {
                      value: localComment
                    },
                    styleExt: {
                      flex: 1,
                      maxWidth: "30rem"
                    }
                  }
                ),
                m(Tag,
                  {
                    isBtn: true,
                    isWide: true,
                    color: "green_1",
                    onclick: (dom, e) => {
                      e.stopPropagation()
                      handleAccept()
                    }
                  },
                  "批准修改"
                ),
                m(Tag,
                  {
                    isBtn: true,
                    isWide: true,
                    color: "gray_2",
                    onclick: (dom, e) => {
                      e.stopPropagation()
                      handleReject()
                    }
                  },
                  "拒绝"
                )
              ]
              : (isDiff
                ? m(Tag,
                  {
                    color: "gray_2",
                    styleExt: {
                      display: "inline-flex",
                      alignItems: "center",
                      height: "2.5rem",
                      padding: "0 0.8rem",
                      borderRadius: "3.0rem"
                    }
                  },
                  "只读查看"
                )
                : m(Tag,
                  {
                    isBtn: true,
                    isWide: true,
                    color: "main",
                    onclick: (dom, e) => {
                      e.stopPropagation()
                      handleSave()
                    }
                  },
                  "保存"
                )
              )
            )
        ]),
        // Reason Bar
        (isDiff && reason)
          ? m("",
            {
              style: {
                display: "flex",
                padding: "0.8rem 1.2rem",
                background: getColor('gray_12').back,
                borderBottom: "1px solid " + getColor('gray_3').back,
                fontSize: "1.2rem",
                alignItems: "flex-start",
                gap: "0.5rem",
                maxHeight: "6.0rem",
                overflowY: "auto"
              }
            },
            [
              m("span", { style: { fontWeight: "bold", color: getColor('main').back } }, "💡 修改理由："),
              m("span", { style: { flex: 1, color: getColor('gray_4').front } }, reason)
            ]
          )
          : null,
        // Path
        m("", { style: { display: "flex", height: "2.2rem", padding: "0 1.0rem", background: getColor('gray_1').back, alignItems: "center", fontSize: "1.1rem", color: readOnly ? getColor('pink_1').front : getColor('gray_1').front, boxShadow: "inset 0 0.1rem 0.3rem rgba(0,0,0,0.2)" } }, [
          readOnly ? m("span", { style: { fontWeight: "bold", marginRight: "0.8rem" } }, "[只读预览]") : null,
          filePath || "未选择文件"
        ]),
        // Editor
        m("",
          {
            style: {
              flex: 1,
              position: "relative",
              margin: "0",
              overflow: "hidden"
            }
          },
          [
            m("",
              {
                class: "monaco-container",
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: "100%",
                  height: "100%"
                }
              }
            ),
            (isDiff && diffChanges.length > 0)
              ? m("",
                {
                  style: {
                    position: "absolute",
                    bottom: "2.0rem",
                    right: "2.0rem",
                    zIndex: 100,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: getColor('gray_1').back,
                    color: getColor('gray_1').front,
                    border: "1px solid " + getColor('gray_3').back,
                    padding: "0.5rem 1.0rem",
                    borderRadius: "2.0rem",
                    boxShadow: "0 0.4rem 1.2rem rgba(0,0,0,0.3)"
                  }
                },
                [
                  m("span",
                    {
                      style: {
                        fontSize: "1.1rem",
                        opacity: 0.8,
                        userSelect: "none"
                      }
                    },
                    `差异: ${currentDiffIndex + 1} / ${diffChanges.length}`
                  ),
                  m(Box,
                    {
                      isBtn: true,
                      color: "gray_3",
                      style: {
                        margin: "0",
                        padding: "0.3rem 0.6rem",
                        borderRadius: "1.0rem",
                        fontSize: "1.1rem",
                        display: "inline-flex",
                        alignItems: "center"
                      },
                      onclick: (dom, e) => {
                        e.stopPropagation()
                        if (currentDiffIndex > 0) {
                          currentDiffIndex--
                        } else {
                          currentDiffIndex = diffChanges.length - 1
                        }
                        const change = diffChanges[currentDiffIndex]
                        diffEditor.getModifiedEditor().revealLineInCenter(change.modifiedStartLineNumber)
                        redraw()
                      }
                    },
                    "◀"
                  ),
                  m(Box,
                    {
                      isBtn: true,
                      color: "gray_3",
                      style: {
                        margin: "0",
                        padding: "0.3rem 0.6rem",
                        borderRadius: "1.0rem",
                        fontSize: "1.1rem",
                        display: "inline-flex",
                        alignItems: "center"
                      },
                      onclick: (dom, e) => {
                        e.stopPropagation()
                        if (currentDiffIndex < diffChanges.length - 1) {
                          currentDiffIndex++
                        } else {
                          currentDiffIndex = 0
                        }
                        const change = diffChanges[currentDiffIndex]
                        diffEditor.getModifiedEditor().revealLineInCenter(change.modifiedStartLineNumber)
                        redraw()
                      }
                    },
                    "▶"
                  )
                ]
              )
              : null
          ]
        ),
        // Bottom Annotations Bar
        (isDiff && !isConflictDiff && annotations.length > 0)
          ? m("",
            {
              style: {
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                padding: "0.5rem 1.0rem",
                background: getColor('gray_2').back,
                borderTop: "1px solid " + getColor('gray_3').back,
                maxHeight: "8.0rem",
                overflowY: "auto",
                alignItems: "center"
              }
            },
            [
              m("span",
                {
                  style: {
                    fontSize: "1.1rem",
                    opacity: 0.6,
                    marginRight: "0.5rem"
                  }
                },
                "已添加批注:"
              ),
              annotations.map((item, idx) => m(Tag,
                {
                  styleExt: {
                    padding: "0.2rem 0.6rem",
                    fontSize: "1.1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: getColor('gray_4').back,
                    color: getColor('gray_4').front,
                    borderRadius: "0.3rem"
                  }
                },
                [
                  m("span",
                    {
                      title: item.comment,
                      style: {
                        cursor: "help"
                      }
                    },
                    `L${item.startLine}-L${item.endLine}: ${item.comment.length > 15 ? item.comment.slice(0, 15) + "..." : item.comment}`
                  ),
                  m("span",
                    {
                      style: {
                        cursor: "pointer",
                        fontWeight: "bold",
                        marginLeft: "0.2rem",
                        color: getColor('pink_1').back
                      },
                      onclick: (e) => {
                        e.stopPropagation()
                        annotations.splice(idx, 1)
                        redraw()
                      }
                    },
                    "×"
                  )
                ]
              ))
            ]
          )
          : null
      ])
    }
  }
}
