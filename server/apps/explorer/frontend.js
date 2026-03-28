import explorerData from "./explorerData.js"

// Explorer 前端组件 (Closure Component)
export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box, iconPark, getColor }) => {
  console.log("Explorer app launched with getColor:", typeof getColor);
  // === 私有状态 (Private State) ===
  let currentPath = ""
  let inputPath = ""
  let files = []
  let selected = new Set()
  //let historyIndex = 0
  //let historyLen = 1
  let clipboard = { files: [], mode: null }

  // 拖拽多选状态
  let isSelecting = false
  let selectStart = { x: 0, y: 0 }
  let selectEnd = { x: 0, y: 0 }
  let pivotIndex = undefined

  // DOM 引用
  let dom = null

  // === 业务逻辑 (Business Logic) ===

  const redraw = () => {
    /* 
       由于是闭包组件，m.redraw() 会触发 view() 
       重新执行，从而读取到最新的闭包变量。
    */
    m.redraw()
  }

  const navigate = async (path) => {
    await settingData.fnCall("appDispatch", [appId, "navigate", { path }])
  }

  const loadDir = async (path = null) => {
    const res = await settingData.fnCall("appDispatch", [appId, "ls", { path }])
    if (!res.ok) Notice.launch({ msg: res.error || "无法加载目录" })
  }

  const openItem = async (item) => {
    if (item.isDirectory) {
      await navigate(item.name)
    } else {
      await settingData.fnCall("appDispatch", [appId, "open", { filename: item.name }])
    }
  }

  const goHistory = async (delta) => {
    await settingData.fnCall("appDispatch", [appId, "history", { delta }])
  }

  const resolveConflictsUI = (conflicts, index, decisions, performPaste) => {
    // Conflict resolution logic (moved from view)
    if (index >= conflicts.length) {
      performPaste(decisions)
      return
    }
    const file = conflicts[index]
    const sign = "conflict_" + Date.now() + "_" + index
    redraw()

    Notice.launch({
      sign, width: 400,
      content: {
        view: (v) => m(Box, { style: { display: "flex", flexDirection: "column", padding: "10px" } }, [
          m("div", { style: { marginBottom: "15px", fontWeight: "bold" } }, "文件冲突"),
          m("div", { style: { marginBottom: "20px" } }, `目标位置已包含名为 "${file}" 的文件。`),
          m("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" } }, [
            m(Box, { isBtn: true, onclick: () => { v.attrs.delete(); decisions[file] = 'rename'; resolveConflictsUI(conflicts, index + 1, decisions, performPaste) } }, "重命名"),
            m(Box, { isBtn: true, onclick: () => { v.attrs.delete(); decisions[file] = 'override'; resolveConflictsUI(conflicts, index + 1, decisions, performPaste) } }, "覆盖"),
            m(Box, { isBtn: true, onclick: () => { v.attrs.delete(); decisions[file] = 'skip'; resolveConflictsUI(conflicts, index + 1, decisions, performPaste) } }, "跳过"),
            m("div", { style: { width: "100%", height: "1px", background: getColor('gray_1').back, margin: "5px 0", opacity: 0.1 } }),
            m(Box, { isBtn: true, onclick: () => { v.attrs.delete(); conflicts.slice(index).forEach(f => decisions[f] = 'rename'); performPaste(decisions) } }, "全部重命名"),
            m(Box, { isBtn: true, onclick: () => { v.attrs.delete(); conflicts.slice(index).forEach(f => decisions[f] = 'override'); performPaste(decisions) } }, "全部覆盖"),
            m(Box, { isBtn: true, onclick: () => { v.attrs.delete(); conflicts.slice(index).forEach(f => decisions[f] = 'skip'); performPaste(decisions) } }, "全部跳过"),
            m(Box, { isBtn: true, color: "pink_1", onclick: () => v.attrs.delete() }, "取消"),
          ])
        ])
      }
    })
  }

  const doPaste = async (targetPath) => {
    if (!clipboard || !clipboard.files.length) return Notice.launch({ msg: "剪贴板为空" })

    const performPaste = async (decisions = {}) => {
      try {
        const rawRes = await settingData.fnCall("appDispatch", [
          appId, "paste",
          { mode: clipboard.mode, files: clipboard.files, targetPath, decisions }
        ])
        if (!rawRes.ok) return Notice.launch({ msg: rawRes.error || "请求失败" })

        const res = rawRes.data
        if (res.status === "conflict") {
          resolveConflictsUI(res.files, 0, decisions, performPaste)
        } else if (res.ok) {
          if (clipboard.mode === 'cut') clipboard = { files: [], mode: null }
          redraw()
        } else {
          Notice.launch({ msg: res.error || "粘贴失败" })
        }
      } catch (e) {
        console.error(e)
        Notice.launch({ msg: "粘贴异常: " + e.message })
      }
    }
    performPaste({})
  }

  // === 对外接口 (Instance Interface) ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      // Handle socket messages
      if (msg.action === "updatePath") {
        currentPath = msg.args.path
        inputPath = msg.args.path
        files = msg.args.files
        selected.clear()
        redraw()
      } else if (msg.action === "getHTML") {
        const html = dom ? dom.innerHTML : ""
        if (callback) callback({ ok: true, data: html })
        return // getHTML returns here
      } else if (msg.action === "navigate") {
        navigate(msg.args.path)
      } else if (msg.action === "select") {
        selected.clear()
        selected.add(msg.args.filename)
        redraw()
      }

      if (callback && msg.action !== "getHTML") callback({ ok: true })
    }
  }

  // === Lifecycle ===
  const init = async () => {
    // 注册到单例管理器
    explorerData.addTool("commonData", commonData) // 注入依赖
    explorerData.registerInstances(appId, instanceInterface)

    // 将单例注册到全局 Registry (只要一次即可，重复注册会被 warn 但无害)
    if (commonData && commonData.registerApp) {
      commonData.registerApp(appId, explorerData)
    }

    // 初始路径
    const initialPath = comData.data.get()?.customCwd || "."
    await navigate(initialPath)
  }

  init() // 立即初始化 (Component creation)

  // === Sub-components / Helpers ===
  const getIcon = (item) => {
    if (item.isDirectory) return "📁"
    const ext = item.name.split(".").pop().toLowerCase()
    const map = {
      "js": "📜", "json": "⚙️", "md": "📝", "txt": "📄", "html": "🌐",
      "css": "🎨", "png": "🖼️", "jpg": "🖼️", "mp4": "🎬", "mp3": "🎵"
    }
    return map[ext] || "📃"
  }

  // ... (Prompts / Menus helpers) ...
  const askName = (title, defaultName) => {
    return new Promise((resolve) => {
      let value = defaultName
      const sign = "prompt_" + Date.now() + Math.random()
      const close = () => {
        const item = Notice.data.dataArr.find(i => i.sign === sign)
        if (item) Notice.closeTab(item)
      }
      Notice.launch({
        sign, width: 300,
        content: {
          view: (v) => m(Box, { style: { display: "flex", flexDirection: "column" } }, [
            m("div", { style: { padding: "0.5rem", color: getColor('gray_4').front, fontWeight: "bold" } }, title),
            m(Box, {
              tagName: "input", ext: { type: "text" }, value: value,
              color: "brown_4",
              style: { borderRadius: "10rem" },
              oninput: (_, e) => value = e.target.value,
              onkeydown: (e) => {
                if (e.key === "Enter") { resolve(value); v.attrs.delete() }
                else if (e.key === "Escape") { resolve(null); v.attrs.delete() }
                e.stopPropagation()
              },
              oncreate: (vn) => setTimeout(() => { vn.dom.focus(); vn.dom.select() }, 50)
            }),
            m("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "10px" } }, [
              m(Box, { isBtn: true, color: "pink_1", onclick: () => { resolve(null); v.attrs.delete() } }, "取消"),
              m(Box, { isBtn: true, onclick: () => { resolve(value); v.attrs.delete() } }, "确定")
            ])
          ])
        }
      })
    })
  }

  const askConfirm = (msg) => {
    return new Promise((resolve) => {
      const sign = "confirm_" + Date.now() + Math.random()
      const close = () => { const item = Notice.data.dataArr.find(i => i.sign === sign); if (item) Notice.closeTab(item) }
      Notice.launch({
        sign, width: 300,
        content: {
          view: (v) => m(Box, { style: { display: "flex", flexDirection: "column" } }, [
            m("div", { style: { padding: "0.5rem", color: getColor('gray_4').front, fontWeight: "bold" } }, msg),
            m("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "10px" } }, [
              m(Box, { isBtn: true, color: "pink_1", onclick: () => { resolve(false); v.attrs.delete() } }, "取消"),
              m(Box, { isBtn: true, onclick: () => { resolve(true); v.attrs.delete() } }, "确定")
            ])
          ])
        }
      })
    })
  }

  // === View ===
  return {
    onremove() {
      explorerData.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      // 闭包变量直接可用，无需 vnode.state
      // ... View Logic ...
      // 鉴于 View 逻辑较长且与之前大体一致，我将尽量保持原样，但替换数据源

      const showParamsMenu = (e) => {
        e.preventDefault()
        if (e.target !== e.currentTarget) return
        if (selected.size > 0) return showContext(e)
        Notice.launch({
          group: "contextMenu", width: 150, x: e.clientX, y: e.clientY,
          content: {
            view: (v) => m(Box, { style: { display: "flex", flexDirection: "column" } }, [
              m(Box, { isBtn: true, style: { padding: "8px", textAlign: "left" }, onclick: async () => { v.attrs.delete(); const name = await askName("请输入文件夹名称", "新建文件夹"); if (name) await settingData.fnCall("appDispatch", [appId, "mkdir", { name }]) } }, "新建文件夹"),
              m(Box, { isBtn: true, style: { padding: "8px", textAlign: "left" }, onclick: async () => { v.attrs.delete(); const name = await askName("请输入文件名", "新建文本.txt"); if (name) await settingData.fnCall("appDispatch", [appId, "newFile", { name }]) } }, "新建文件"),
              clipboard.files.length > 0 ? m(Box, { isBtn: true, style: { padding: "8px", textAlign: "left" }, onclick: () => { v.attrs.delete(); doPaste(currentPath) } }, `粘贴 (${clipboard.files.length})`) : null
            ])
          }
        })
      }

      const showContext = (e, item) => {
        e.preventDefault()
        if (item && !selected.has(item.name)) { selected.clear(); selected.add(item.name) }
        redraw() // update select UI
        const selectedCount = selected.size
        const isSingle = selectedCount === 1
        const firstItemName = isSingle ? Array.from(selected)[0] : null
        const firstItem = isSingle ? files.find(f => f.name === firstItemName) : null

        Notice.launch({
          group: "contextMenu", width: 150, x: e.clientX, y: e.clientY,
          content: {
            view: (v) => m(Box, { style: { display: "flex", flexDirection: "column" } }, [
              isSingle ? m(Box, { isBtn: true, style: { padding: "8px", textAlign: "left" }, onclick: () => { v.attrs.delete(); openItem(firstItem) } }, "打开") : null,
              isSingle ? m(Box, { isBtn: true, style: { padding: "8px", textAlign: "left" }, onclick: async () => { v.attrs.delete(); const newName = await askName("重命名", firstItem.name); if (newName && newName !== firstItem.name) await settingData.fnCall("appDispatch", [appId, "rename", { oldName: firstItem.name, newName }]) } }, "重命名") : null,
              m(Box, { isBtn: true, style: { padding: "8px", textAlign: "left" }, onclick: () => { v.attrs.delete(); const sep = currentPath.includes("\\") ? "\\" : "/"; const fs = Array.from(selected).map(n => currentPath + (currentPath.endsWith(sep) ? "" : sep) + n); clipboard = { files: fs, mode: 'copy' }; Notice.launch({ msg: `已复制 ${fs.length} 个项目` }) } }, "复制"),
              m(Box, { isBtn: true, style: { padding: "8px", textAlign: "left" }, onclick: () => { v.attrs.delete(); const sep = currentPath.includes("\\") ? "\\" : "/"; const fs = Array.from(selected).map(n => currentPath + (currentPath.endsWith(sep) ? "" : sep) + n); clipboard = { files: fs, mode: 'cut' }; Notice.launch({ msg: `已剪切 ${fs.length} 个项目` }) } }, "剪切"),
              m(Box, { isBtn: true, color: "pink_1", style: { padding: "8px", textAlign: "left" }, onclick: async () => { v.attrs.delete(); const fs = Array.from(selected); if (await askConfirm(`确定删除这 ${fs.length} 个项目吗？`)) await settingData.fnCall("appDispatch", [appId, "delete", { files: fs }]) } }, "删除")
            ])
          }
        })
      }

      // 拖拽处理
      const handleDragStart = (e, item) => {
        const fullPath = currentPath + (currentPath.endsWith("/") ? "" : "/") + item.name
        e.dataTransfer.setData("text/plain", fullPath)
        e.dataTransfer.effectAllowed = "copy"
        const div = document.createElement("div")
        div.textContent = `${getIcon(item)} ${item.name}`
        div.style.background = getColor('gray_4').back; div.style.color = getColor('gray_4').front; div.style.padding = "5px"; div.style.borderRadius = "4px"; div.style.position = "absolute"; div.style.top = "-9999px"
        document.body.appendChild(div)
        e.dataTransfer.setDragImage(div, 0, 0)
        setTimeout(() => document.body.removeChild(div), 0)
      }

      return m("div", {
        tabindex: 0,
        style: {
          display: "flex", flexDirection: "column",
          width: "100%", height: "100%",
          background: getColor('gray_4').back, color: getColor('gray_4').front, fontFamily: "system-ui",
          outline: "none"
        },
        onkeydown: (e) => {
          const isMod = e.metaKey || e.ctrlKey
          if (isMod && e.key.toLowerCase() === 'a') {
            e.preventDefault(); files.forEach(f => selected.add(f.name)); redraw()
          } else if (e.key === 'Delete') {
            if (selected.size > 0) { const fs = Array.from(selected); askConfirm(`确定删除这 ${fs.length} 个项目吗？`).then(yes => { if (yes) settingData.fnCall("appDispatch", [appId, "delete", { files: fs }]) }) }
          }
        },
        oncreate: (vn) => { dom = vn.dom },
      }, [
        m("div", {
          style: { display: "flex", padding: "8px", gap: "10px", background: getColor('gray_12').back, alignItems: "center" }
        }, [
          m("div", {
            style: { cursor: "pointer", padding: "4px", borderRadius: "10rem", display: "flex", alignItems: "center", justifyContent: "center", width: "2rem", height: "2rem" },
            class: "hover-bg",
            onclick: () => goHistory(-1)
          }, m.trust(iconPark.getIcon("Left", { size: "1.2rem", fill: getColor('gray_12').front }))),
          m(Box, {
            tagName: "input",
            value: inputPath,
            color: "brown_4",
            padding: "0.5rem 1rem",
            style: { flex: 1, borderRadius: "10rem", border: `1px solid ${getColor('gray_2').back}` },
            oninput: (dom, e) => inputPath = e.target.value,
            onkeydown: (dom, e) => { if (e.key === 'Enter') navigate(inputPath); e.stopPropagation() }
          }),
          m("div", {
            style: { cursor: "pointer", padding: "4px", borderRadius: "10rem", display: "flex", alignItems: "center", justifyContent: "center", width: "2rem", height: "2rem" },
            class: "hover-bg",
            onclick: () => loadDir()
          }, m.trust(iconPark.getIcon("Refresh", { size: "1.2rem", fill: getColor('gray_12').front })))
        ]),

        // File Grid
        m("div", {
          style: {
            flex: 1, overflowY: "auto", padding: "10px", display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
            gap: "10px", alignContent: "start", userSelect: "none", position: "relative"
          },
          oncontextmenu: showParamsMenu,
          // onmousedown for drag select (Simplified for brevity, can re-add if needed or use existing logic)
          onmousedown: (e) => {
            dom.focus()
            if (e.button !== 0 || e.target.closest('.file-item')) return
            const container = e.currentTarget
            const containerRect = container.getBoundingClientRect()
            const startX = e.clientX - containerRect.left + container.scrollLeft
            const startY = e.clientY - containerRect.top + container.scrollTop

            isSelecting = false
            selectStart = { x: startX, y: startY }
            selectEnd = { x: startX, y: startY }
            const threshold = 5

            const move = (ev) => {
              const cx = ev.clientX - containerRect.left + container.scrollLeft
              const cy = ev.clientY - containerRect.top + container.scrollTop
              if (!isSelecting && Math.hypot(cx - startX, cy - startY) > threshold) isSelecting = true
              if (isSelecting) {
                selectEnd = { x: cx, y: cy }
                // Drag Select Logic
                const sb = {
                  left: Math.min(selectStart.x, selectEnd.x),
                  top: Math.min(selectStart.y, selectEnd.y),
                  width: Math.abs(selectEnd.x - selectStart.x),
                  height: Math.abs(selectEnd.y - selectStart.y)
                }

                if (!ev.metaKey && !ev.ctrlKey) selected.clear()

                const items = container.querySelectorAll('.file-item')
                items.forEach(el => {
                  const name = el.getAttribute('data-name')
                  const rect = el.getBoundingClientRect()
                  const item = {
                    left: rect.left - containerRect.left + container.scrollLeft,
                    top: rect.top - containerRect.top + container.scrollTop,
                    width: rect.width,
                    height: rect.height
                  }

                  if (
                    sb.left < item.left + item.width &&
                    sb.left + sb.width > item.left &&
                    sb.top < item.top + item.height &&
                    sb.top + sb.height > item.top
                  ) {
                    selected.add(name)
                  }
                })
                redraw()
              }
            }
            const up = () => {
              window.removeEventListener('mousemove', move)
              window.removeEventListener('mouseup', up)
              if (!isSelecting && !e.metaKey && !e.ctrlKey) { selected.clear() }
              isSelecting = false
              redraw()
            }
            window.addEventListener('mousemove', move)
            window.addEventListener('mouseup', up)
          }
        }, [
          isSelecting ? m("div", {
            style: {
              position: "absolute",
              left: Math.min(selectStart.x, selectEnd.x) + "px",
              top: Math.min(selectStart.y, selectEnd.y) + "px",
              width: Math.abs(selectEnd.x - selectStart.x) + "px",
              height: Math.abs(selectEnd.y - selectStart.y) + "px",
              background: getColor('main').back + '44', border: `1px solid ${getColor('main').back}`, pointerEvents: "none", zIndex: 9999
            }
          }) : null,
          files.map((item, index) => {
            const isSelected = selected.has(item.name)
            return m("div", {
              class: "file-item",
              "data-name": item.name,
              draggable: true,
              ondragstart: (e) => handleDragStart(e, item),
              onclick: (e) => { e.stopPropagation(); if (e.metaKey || e.ctrlKey) { if (selected.has(item.name)) selected.delete(item.name); else selected.add(item.name) } else { selected.clear(); selected.add(item.name) } redraw() },
              ondblclick: (e) => { e.stopPropagation(); openItem(item) },
              oncontextmenu: (e) => { e.stopPropagation(); showContext(e, item) },
              style: {
                display: "flex", flexDirection: "column", alignItems: "center", padding: "10px",
                background: isSelected ? getColor('main').back + '44' : "transparent",
                borderRadius: "5px", border: isSelected ? `1px solid ${getColor('main').back}` : "1px solid transparent",
                cursor: "pointer"
              }
            }, [
              m("div", { style: { fontSize: "32px", marginBottom: "5px" } }, getIcon(item)),
              m("div", { style: { fontSize: "12px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", width: "100%", whiteSpace: "nowrap" } }, item.name)
            ])
          })
        ])
      ])
    }
  }
}
