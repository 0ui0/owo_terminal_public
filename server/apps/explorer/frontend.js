import explorerData from "./explorerData.js"
import ActionBar from "./frontendModules/ActionBar.js"
import FileArea from "./frontendModules/FileArea.js"
import ConflictDialog from "./frontendModules/ConflictDialog.js"
import ContextMenu from "./frontendModules/ContextMenu.js"
import tmRestoreModule from "./frontendModules/tmRestoreModule.js"
import FormatUtils from "./frontendModules/FormatUtils.js"

// Explorer 前端组件 (Closure Component)
export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box, iconPark, getColor }) => {
  // === 私有状态 (Private State) ===
  let currentPath = ""
  let inputPath = ""
  let files = []
  let selected = new Set()
  let searchKeyword = ""
  let sortField = "name"
  let sortOrder = 1
  let viewMode = "grid"
  let searchMode = "current"
  let projectSearchResults = []
  let searchVersion = 0
  let isProjectSearching = false
  let clipboard = { files: [], mode: null }
  let isRestoring = false // 新增：全局还原锁

  // 拖拽多选状态
  let isSelecting = false
  let selectStart = { x: 0, y: 0 }
  let selectEnd = { x: 0, y: 0 }
  let lastPointerTime = 0
  let lastPointerTarget = null
  let pendingSelectClear = null // 新增：记录待清除的多选状态
  let searchTimer = null
  let hoverTimer = null // 悬停进入定时器
  let lastHoverPath = null // 上次悬停的文件夹路径

  // DOM 引用
  let dom = null

  // === 业务逻辑 (Business Logic) ===

  const redraw = () => m.redraw()

  const resolveItemPath = (item) => {
    if (!item) return null
    return item.isSearchResult ? item.path : (currentPath + (currentPath.endsWith("/") ? "" : "/") + item.name)
  }

  const resolveSelectedPaths = (pool, ids) => {
    return ids.map((id) => {
      const item = pool.find(f => (f.isSearchResult ? `${f.path}:${f.line}` : f.name) === id)
      return resolveItemPath(item)
    }).filter(Boolean)
  }

  const navigate = async (path) => {
    if (isRestoring) return Notice.launch({ msg: "操作被拦截：还原期间禁止切换目录，防止状态撕裂喵！", type: "warning" });
    await settingData.fnCall("appDispatch", [appId, "navigate", { path }])
  }

  const loadDir = async (path = null) => {
    const rawRes = await settingData.fnCall("appDispatch", [appId, "ls", { path }])
    if (rawRes.ok && Array.isArray(rawRes.data)) {
      files = rawRes.data;
      console.log(`[Explorer] Loaded ${files.length} files from ${path || currentPath}`);
      redraw();
    } else {
      Notice.launch({ msg: rawRes.msg || "获取列表失败" })
    }
  }

  const openItem = async (item) => {
    if (item.isDirectory) {
      await navigate(item.name)
    } else {
      await settingData.fnCall("appDispatch", [appId, "open", { filename: item.isSearchResult ? item.path : item.name }])
    }
  }

  const goHistory = async (delta) => {
    if (isRestoring) return Notice.launch({ msg: "操作被拦截：还原期间禁止切换目录，防止状态撕裂喵！", type: "warning" });
    await settingData.fnCall("appDispatch", [appId, "history", { delta }])
  }

  const resolveConflictsUI = (conflicts, index, decisions, performPaste) => {
    if (index >= conflicts.length) return performPaste(decisions)
    const file = conflicts[index]
    Notice.launch({
      sign: "conflict_" + Date.now(),
      width: 450,
      content: {
        view: (v) => m(ConflictDialog, {
          m, Box,
          fileName: file,
          onDecision: (d) => { v.attrs.delete(); decisions[file] = d; resolveConflictsUI(conflicts, index + 1, decisions, performPaste) },
          onGlobalDecision: (d) => { v.attrs.delete(); conflicts.slice(index).forEach(f => decisions[f] = d); performPaste(decisions) },
          onCancel: () => v.attrs.delete()
        })
      }
    })
  }

  const doPaste = async (targetPath, noNavigate = false) => {
    if (!clipboard || !clipboard.files.length) return Notice.launch({ msg: "剪贴板为空" })
    const performPaste = async (decisions = {}) => {
      try {
        const rawRes = await settingData.fnCall("appDispatch", [appId, "paste", { mode: clipboard.mode, files: clipboard.files, targetPath, decisions, noNavigate }])

        if (!rawRes.ok) return Notice.launch({ msg: rawRes.msg || "请求失败" })

        if (rawRes.status === "conflict") {
          resolveConflictsUI(rawRes.files, 0, decisions, performPaste)
        } else if (rawRes.ok) {
          if (clipboard.mode === 'cut') clipboard = { files: [], mode: null }
          if (noNavigate) loadDir()
          redraw()
        } else {
          Notice.launch({ msg: rawRes.msg || "操作失败" })
        }
      } catch (e) {
        Notice.launch({ msg: "操作异常: " + e.message })
      }
    }
    performPaste({})
  }

  // --- 时光机还原逻辑 (已迁移至模块) ---
  const tmRestoreProcess = async (items, targetFolder = null) => {
    if (isRestoring) return Notice.launch({ msg: "已有还原任务正在进行中，请耐心等待喵！", type: "warning" });
    isRestoring = true;
    try {
      await tmRestoreModule.run({
        items, targetFolder, currentPath, appId, m, Notice, Box, settingData, askConfirm
      });
    } finally {
      isRestoring = false;
    }
  };

  // --- Socket 监听器管理 ---
  const tmTriggerHandler = (rawData) => {
    const items = rawData.type === 'tm-items' ? rawData.items : (rawData.type === 'tm-item' ? [rawData] : []);
    if (items.length > 0) tmRestoreProcess(items);
  };

  const fsChangeHandler = (msg) => {
    if (msg && msg.paths && msg.paths.includes(currentPath)) {
      loadDir();
    }
  };

  if (ioSocket && ioSocket.socket) {
    ioSocket.socket.on("tm:trigger-restore", tmTriggerHandler);
    ioSocket.socket.on("explorer:fs-change", fsChangeHandler);
  }

  // === 对外接口 ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (msg.action === "updatePath") {
        currentPath = msg.args.path
        inputPath = msg.args.path
        files = msg.args.data || msg.args.files || []
        selected.clear()
        redraw()
      } else if (msg.action === "getHTML") {
        if (callback) callback({ ok: true, data: dom ? dom.innerHTML : "" })
        return
      } else if (msg.action === "navigate") {
        navigate(msg.args.path)
      } else if (msg.action === "select") {
        selected.clear()
        selected.add(msg.args.filename)
        redraw()
      }
      if (callback) callback({ ok: true })
    }
  }

  // === Lifecycle ===
  const init = async () => {
    explorerData.addTool("commonData", commonData)
    explorerData.registerInstances(appId, instanceInterface)
    if (commonData?.registerApp) commonData.registerApp(appId, explorerData)
    await navigate(comData.data.get()?.customCwd || ".")
  }
  init()

  const askConfirm = (msg, title = "确认") => {
    return new Promise((resolve) => {
      const sign = "confirm_" + Date.now()
      Notice.launch({
        sign, width: 350,
        content: {
          view: (v) => m(Box, { style: { display: "flex", flexDirection: "column", padding: "10px" } }, [
            m("", { style: { marginBottom: "15px", fontWeight: "bold" } }, title),
            m("", { style: { marginBottom: "20px" } }, msg),
            m("", { style: { display: "flex", gap: "10px", justifyContent: "flex-end" } }, [
              m(Box, { isBtn: true, color: "pink_1", onclick: () => { resolve(false); v.attrs.delete() } }, "取消"),
              m(Box, { isBtn: true, onclick: () => { resolve(true); v.attrs.delete() } }, "确定")
            ])
          ])
        }
      })
    })
  }

  // === Helpers ===
  const getIcon = (item) => {
    if (item.isDirectory) return "📁"
    const ext = item.name.split(".").pop().toLowerCase()
    const map = { "js": "📜", "json": "⚙️", "md": "📝", "txt": "📄", "html": "🌐", "css": "🎨", "png": "🖼️", "jpg": "🖼️", "mp4": "🎬", "mp3": "🎵" }
    return map[ext] || "📃"
  }

  const askName = (title, defaultName) => {
    return new Promise((resolve) => {
      let value = defaultName
      const sign = "prompt_" + Date.now() + Math.random()
      Notice.launch({
        sign, width: 300,
        content: {
          view: (v) => m(Box, { style: { display: "flex", flexDirection: "column" } }, [
            m("", { style: { padding: "0.5rem", fontWeight: "bold" } }, title),
            m(Box, {
              tagName: "input", ext: { type: "text" }, value: value, color: "brown_4", style: { borderRadius: "10rem" },
              oninput: (_, e) => value = e.target.value,
              onkeydown: (e) => { if (e.key === "Enter") { resolve(value); v.attrs.delete() } else if (e.key === "Escape") { resolve(null); v.attrs.delete() } e.stopPropagation() },
              oncreate: (vn) => setTimeout(() => { vn.dom.focus(); vn.dom.select() }, 50)
            }),
            m("", { style: { display: "flex", justifyContent: "flex-end", marginTop: "10px" } }, [
              m(Box, { isBtn: true, color: "pink_1", onclick: () => { resolve(null); v.attrs.delete() } }, "取消"),
              m(Box, { isBtn: true, onclick: () => { resolve(value); v.attrs.delete() } }, "确定")
            ])
          ])
        }
      })
    })
  }

  return {
    onremove() {
      if (ioSocket && ioSocket.socket) {
        ioSocket.socket.off("tm:trigger-restore", tmTriggerHandler);
        ioSocket.socket.off("explorer:fs-change", fsChangeHandler);
      }
      explorerData.unregisterInstances(appId, commonData)
    },
    view() {
      return m("",
        {
          tabindex: 0,
          style: {
            display: "flex", flexDirection: "column",
            width: "100%", height: "100%",
            background: getColor('gray_12').back,
            color: getColor('gray_12').front,
            outline: "none", position: "relative", overflow: "hidden"
          },
          oncreate: (vn) => { dom = vn.dom },
          onkeydown: (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
              e.preventDefault();
              const pool = searchMode === 'project' && projectSearchResults.length > 0 ? projectSearchResults : files
              pool.forEach(f => selected.add(f.isSearchResult ? `${f.path}:${f.line}` : f.name));
              redraw()
            } else if (e.key === 'Delete' && selected.size > 0) {
              const fs = resolveSelectedPaths(searchMode === 'project' && projectSearchResults.length > 0 ? projectSearchResults : files, Array.from(selected))
              askConfirm(`确定要删除选中的 ${fs.length} 个项目吗？`, "确认删除").then(yes => {
                if (yes) settingData.fnCall("appDispatch", [appId, "delete", { files: fs }])
              })
            }
          }
        },
        [
          m(ActionBar, {
            m, Box, iconPark, getColor, inputPath, searchMode, searchKeyword, sortField, sortOrder, viewMode,
            askName, // 传递本地定义的 askName
            onNavigate: navigate, onGoHistory: goHistory, onLoadDir: loadDir,
            onDoProjectSearch: async () => {
              if (!searchKeyword) { projectSearchResults = []; isProjectSearching = false; redraw(); return; }
              isProjectSearching = true; redraw();
              searchVersion++;
              const currentVersion = searchVersion;
              const res = await settingData.fnCall("projectSearch", [searchKeyword])
              if (currentVersion !== searchVersion) return;
              if (res.ok) { projectSearchResults = res.data; viewMode = "list"; }
              else Notice.launch({ msg: "搜索失败: " + res.msg })
              isProjectSearching = false; redraw();
            },
            onInputPathChange: (v) => inputPath = v,
            onSearchModeChange: (v) => { 
              searchMode = v; 
              if (v === 'current') { projectSearchResults = []; isProjectSearching = false; } 
              redraw(); 
            },
            onSearchKeywordChange: (v) => {
              searchKeyword = v;
              if (searchMode === 'current') { redraw(); return; }
              
              if (searchTimer) clearTimeout(searchTimer);
              searchTimer = setTimeout(async () => {
                if (!searchKeyword) { projectSearchResults = []; isProjectSearching = false; redraw(); return; }
                isProjectSearching = true; redraw();
                searchVersion++;
                const currentVersion = searchVersion;
                const res = await settingData.fnCall("projectSearch", [searchKeyword])
                if (currentVersion !== searchVersion) return;
                if (res.ok) { projectSearchResults = res.data; viewMode = "list"; }
                else Notice.launch({ msg: "搜索失败: " + res.msg })
                isProjectSearching = false; redraw();
              }, 300);
            },
            onSortFieldChange: (v) => { sortField = v; redraw() },
            onSortOrderToggle: () => { sortOrder *= -1; redraw() },
            onViewModeToggle: () => { viewMode = viewMode === "grid" ? "list" : "grid"; redraw() }
          }),
          m(FileArea, {
            m, getColor, iconPark, viewMode, selected, isSelecting, selectStart, selectEnd, getIcon, currentPath, isProjectSearching,
            processedFiles: (() => {
              if (searchMode === 'project') return projectSearchResults;
              let pool = files.filter(f => f.name.toLowerCase().includes(searchKeyword.toLowerCase()))
              pool.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                let vA = a[sortField], vB = b[sortField];
                return (typeof vA === 'string' ? vA.localeCompare(vB) : vA - vB) * sortOrder;
              });
              return pool;
            })(),
            onContextMenu: (e) => {
              e.preventDefault();
              const itemEl = e.target.closest('.file-item');
              const itemName = itemEl?.getAttribute('data-name');
              const pool = searchMode === 'project' && projectSearchResults.length > 0 ? projectSearchResults : files;
              const item = pool.find(f => (f.isSearchResult ? `${f.path}:${f.line}` : f.name) === itemName);
              if (item && !selected.has(itemName)) { selected.clear(); selected.add(itemName); redraw(); }

              Notice.launch({
                group: "contextMenu",
                width: 150,
                x: e.clientX,
                y: e.clientY,
                content: {
                  view: (v) => m(ContextMenu, {
                    m, Box, getColor,
                    selectedCount: selected.size,
                    hasItem: !!item,
                    canPaste: selected.size === 0 && clipboard.files.length > 0,
                    onAction: async (type) => {
                      v.attrs.delete();
                      if (type === 'open') openItem(item);
                      else if (type === 'rename') {
                        const n = await askName("重命名", item.name);
                        if (n && n !== item.name) {
                          const res = await settingData.fnCall("appDispatch", [appId, "rename", { oldName: item.isSearchResult ? item.path : item.name, newName: n }]);
                          if (!res?.ok) {
                            Notice.launch({ msg: res?.msg || "重命名失败" });
                          }
                        }
                      } else if (type === 'copy' || type === 'cut') {
                        const fs = resolveSelectedPaths(pool, Array.from(selected))
                        clipboard = { files: fs, mode: type };
                      } else if (type === 'paste') {
                        doPaste(currentPath);
                      } else if (type === 'delete') {
                        const fs = resolveSelectedPaths(pool, Array.from(selected))
                        askConfirm(`确定要删除选中的 ${fs.length} 个项目吗？`, "确认删除").then(yes => {
                          if (yes) settingData.fnCall("appDispatch", [appId, "delete", { files: fs }]);
                        });
                      } else if (type === 'mkdir') {
                        const n = await askName("新建文件夹", "新建文件夹");
                        if (n) await settingData.fnCall("appDispatch", [appId, "mkdir", { name: n }]);
                      }
                    }
                  })
                }
              });
            },
            onPointerDown: (e) => {
              dom.focus();
              const target = e.currentTarget;
              const itemEl = e.target.closest('.file-item');
              const itemName = itemEl?.getAttribute('data-name');

              if (itemEl && e.button === 0) {
                const now = Date.now();
                if (now - lastPointerTime < 300 && lastPointerTarget === itemName) {
                  const pool = searchMode === 'project' && projectSearchResults.length > 0 ? projectSearchResults : files;
                  const item = pool.find(f => (f.isSearchResult ? `${f.path}:${f.line}` : f.name) === itemName);
                  if (item) openItem(item);
                  lastPointerTime = 0;
                } else {
                  if (e.metaKey || e.ctrlKey) {
                    if (selected.has(itemName)) selected.delete(itemName);
                    else selected.add(itemName);
                  } else {
                    if (selected.has(itemName)) {
                      // 如果已经选中，暂时不清除，标记为“可能需要清除”
                      // 这样如果接下来的动作是拖拽，我们就能带走所有选中项
                      pendingSelectClear = itemName;
                    } else {
                      selected.clear();
                      selected.add(itemName);
                    }
                  }
                  redraw();
                }
                lastPointerTime = now; lastPointerTarget = itemName;
                return;
              }
              if (e.button !== 0) return;
              if (!e.metaKey && !e.ctrlKey) { selected.clear(); redraw(); }
              const rect = target.getBoundingClientRect();
              const sX = e.clientX - rect.left + target.scrollLeft, sY = e.clientY - rect.top + target.scrollTop;
              isSelecting = false; selectStart = { x: sX, y: sY }; selectEnd = { x: sX, y: sY };
              const move = (ev) => {
                const cx = ev.clientX - rect.left + target.scrollLeft, cy = ev.clientY - rect.top + target.scrollTop;
                if (!isSelecting && Math.hypot(cx - sX, cy - sY) > 5) isSelecting = true;
                if (isSelecting) {
                  selectEnd = { x: cx, y: cy };
                  if (!ev.metaKey && !ev.ctrlKey) selected.clear();
                  target.querySelectorAll('.file-item').forEach(el => {
                    const r = el.getBoundingClientRect();
                    const iR = { left: r.left - rect.left + target.scrollLeft, top: r.top - rect.top + target.scrollTop, width: r.width, height: r.height };
                    const sb = { l: Math.min(selectStart.x, selectEnd.x), t: Math.min(selectStart.y, selectEnd.y), w: Math.abs(selectEnd.x - selectStart.x), h: Math.abs(selectEnd.y - selectStart.y) };
                    if (sb.l < iR.left + iR.width && sb.l + sb.w > iR.left && sb.t < iR.top + iR.height && sb.t + sb.h > iR.top) selected.add(el.getAttribute('data-name'));
                  });
                  redraw();
                }
              };
              const up = () => { isSelecting = false; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); redraw(); };
              document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
            },
            onPointerUp: (e) => {
              if (pendingSelectClear) {
                selected.clear();
                selected.add(pendingSelectClear);
                pendingSelectClear = null;
                redraw();
              }
            },
            onDragOver: (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";

              // 悬停自动进入逻辑
              const targetEl = e.target.closest('.file-item[data-type="folder"]');
              const path = targetEl?.getAttribute('data-path');

              if (path && path !== currentPath) {
                if (path !== lastHoverPath) {
                  // 如果切换了悬停目标，重置定时器
                  clearTimeout(hoverTimer);
                  lastHoverPath = path;
                  hoverTimer = setTimeout(() => {
                    navigate(path); // 3秒后进入目录
                    lastHoverPath = null;
                  }, 3000);
                }
              } else {
                clearTimeout(hoverTimer);
                lastHoverPath = null;
              }
            },
            onDrop: async (e) => {
              e.preventDefault();
              e.stopPropagation();
              clearTimeout(hoverTimer); // 取消可能的进入定时器
              lastHoverPath = null;

              try {
                const raw = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
                const targetEl = e.target.closest('.file-item[data-type="folder"]');
                const targetFolder = targetEl?.getAttribute('data-path') || currentPath;
                const targetName = targetEl ? targetFolder.split(/[/\\]/).pop() : "当前目录";

                if (raw.type === 'explorer-item') {
                  const paths = raw.paths || [raw.path];
                  // 过滤掉已经在目标目录中的文件
                  const filesToMove = paths.filter(p => {
                    const lastSlash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
                    const parent = p.substring(0, lastSlash) || '/';
                    return parent !== targetFolder;
                  });

                  if (filesToMove.length > 0) {
                    // 只有真正需要移动时才询问
                    Notice.launch({
                      msg: `确定要将 ${filesToMove.length} 个项目移动到 "${targetName}" 吗？`,
                      confirm: async () => {
                        clipboard = { files: filesToMove, mode: 'cut' };
                        await doPaste(targetFolder, true); // 拖放移动不自动跳转
                      }
                    });
                  }
                } else {
                  // 时光机项目还原
                  const items = raw.type === 'tm-items' ? raw.items : (raw.type === 'tm-item' ? [raw] : []);
                  if (items.length > 0) await tmRestoreProcess(items, targetFolder);
                }
              } catch (err) { console.error(err); }
            },
            onDragStart: (e, item) => {
              pendingSelectClear = null; // 开始拖拽，取消清除计划
              const itemId = item.isSearchResult ? `${item.path}:${item.line}` : item.name;
              let paths = [];
              const fullPath = item.isSearchResult ? item.path : (currentPath + (currentPath.endsWith("/") ? "" : "/") + item.name);

              if (selected.has(itemId) || (selected.size > 0 && selected.has(item.name))) {
                const pool = searchMode === 'project' && projectSearchResults.length > 0 ? projectSearchResults : files;
                paths = Array.from(selected).map(id => {
                  const f = pool.find(file => (file.isSearchResult ? `${file.path}:${file.line}` : file.name) === id);
                  return f ? (f.isSearchResult ? f.path : (currentPath + (currentPath.endsWith("/") ? "" : "/") + f.name)) : null;
                }).filter(p => p);
              } else {
                paths = [fullPath];
              }

              // 设置拖拽数据
              e.dataTransfer.setData("text/plain", fullPath);
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("application/json", JSON.stringify({
                type: 'explorer-item',
                paths,
                path: paths[0],
                name: item.name,
                isDirectory: item.isDirectory
              }));

              // 恢复自定义拖拽镜像
              // 增强型自定义拖拽镜像：图标堆叠 + 数量角标
              console.log(`[Explorer] Dragging ${paths.length} items:`, paths);
              const container = document.createElement("div");
              container.style.cssText = `
                position: absolute;
                top: -1000px;
                left: -1000px;
                width: 80px;
                height: 80px;
                pointer-events: none;
                z-index: 10000;
              `;

              // 专门为拖拽镜像准备的图标获取函数
              const getIconStr = (it) => {
                if (it.isDirectory) return "📁";
                const ext = (it.name || "").split('.').pop().toLowerCase();
                const map = { "js": "📜", "json": "⚙️", "md": "📝", "txt": "📄", "html": "🌐", "css": "🎨", "png": "🖼️", "jpg": "🖼️", "mp4": "🎬", "mp3": "🎵" };
                return map[ext] || "📃";
              };

              const stackCount = Math.min(paths.length, 3);
              for (let i = 0; i < stackCount; i++) {
                const img = document.createElement("div");
                img.textContent = getIconStr(item);
                img.style.cssText = `
                  position: absolute;
                  font-size: 40px;
                  left: ${20 + i * 6}px;
                  top: ${20 + i * 6}px;
                  z-index: ${10 - i};
                  line-height: 1;
                  text-shadow: 0 2px 4px rgba(0,0,0,0.2);
                `;
                container.appendChild(img);
              }

              // 无论 1 个还是多个，都显示角标
              const badge = document.createElement("div");
              badge.textContent = paths.length;
              badge.style.cssText = `
                position: absolute;
                top: 10px;
                left: 10px;
                background: #ff4d4f;
                color: white;
                border-radius: 20px;
                min-width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                font-size: 12px;
                font-weight: bold;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.4);
                z-index: 50;
              `;
              container.appendChild(badge);

              document.body.appendChild(container);
              // 偏移量也相应调整，让鼠标指在第一张图标的中心附近
              e.dataTransfer.setDragImage(container, 40, 40);
              setTimeout(() => document.body.removeChild(container), 0);
            },
            onHeaderClick: (f) => { if (sortField === f) sortOrder *= -1; else { sortField = f; sortOrder = 1; } redraw(); },
            formatDate: FormatUtils.formatDate,
            formatSize: FormatUtils.formatSize,
            renderHighlightedText: (text, matches) => FormatUtils.renderHighlightedText(m, text, matches)
          })
        ]
      )
    }
  }
}
