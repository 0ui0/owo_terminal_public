import HistorySidebar from "./frontendModules/HistorySidebar.js";
import ContentArea from "./frontendModules/ContentArea.js";
import Toolbar from "./frontendModules/Toolbar.js";

export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box, iconPark, getColor, trs }) => {
  console.log(comData)
  // === 私有状态 (统一命名：hash, relPath, repoPath) ===
  let history = [];
  let hash = null;      // 选中的快照哈希
  let relPath = "";   // 正在浏览的相对路径
  let files = [];
  let repoPath = "";    // 档案馆根路径
  let selected = new Set();
  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };
  let selectEnd = { x: 0, y: 0 };
  let lastPointerTime = 0;
  let lastPointerTarget = null;
  let dom = null;
  let pendingSelectClear = null; // 延迟清除标记

  // --- 弹窗辅助 (基于 Notice 框架) ---
  const askName = (title, defaultName) => {
    return new Promise((resolve) => {
      let value = defaultName;
      Notice.launch({
        tip: title,
        content: {
          view: () => {
            return m("",
              {
                style: {
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column"
                }
              },
              [
                m(Box,
                  {
                    tagName: "input",
                    ext: {
                      type: "text"
                    },
                    value: value,
                    style: {
                      borderRadius: "1.5rem",
                      padding: "1rem 1.5rem",
                      background: "rgba(0,0,0,0.2)",
                      border: "0.1rem solid rgba(255,255,255,0.1)",
                      color: "#fff"
                    },
                    oninput: (d, e) => {
                      return value = e.target.value;
                    },
                    oncreate: (vn) => {
                      return setTimeout(() => {
                        vn.dom.focus();
                        return vn.dom.select();
                      },
                        50);
                    }
                  })
              ]);
          }
        },
        confirm: () => {
          return resolve(value);
        },
        cancel: () => {
          return resolve(null);
        }
      });
    });
  };

  const askConfirm = (msg, title = "操作确认") => {
    return new Promise((resolve) => {
      Notice.launch({
        tip: title,
        msg: msg,
        confirm: () => {
          return resolve(true);
        },
        cancel: () => {
          return resolve(false);
        }
      });
    });
  };

  // --- 核心业务函数 ---
  const loadFiles = async () => {
    if (!repoPath) return;
    const res = await settingData.fnCall("appDispatch", [appId, "ls", { hash, relPath, repoPath }]);
    files = res?.ok ? (Array.isArray(res.data) ? res.data : []) : [];
    selected.clear();
    m.redraw();
  };

  const loadHistory = async () => {
    if (!repoPath) return;
    const res = await settingData.fnCall("appDispatch", [appId, "loadBackup", { repoPath }]);
    if (res?.ok) {
      history = res.history || [];
      m.redraw();
      return true;
    } else {
      Notice.launch({ title: "无法打开备份", msg: (res?.msg) || "该目录不是有效的时光机备份仓库喵！" });
      history = [];
      repoPath = "";
      m.redraw();
      return false;
    }
  };

  let showSidebar = false;
  let containerWidth = window.innerWidth; // 初始用 window 宽度兜底
  let observer = null;

  return {
    async oninit() {
      repoPath = settingData.data?.repoPath || "";
      if (repoPath) await loadHistory();
      m.redraw();
    },
    onremove() {
      if (observer) observer.disconnect();
    },
    onDispatch: async (msg, callback) => {
      if (callback) callback({ ok: true });
    },
    view: (vnode) => {
      // 综合判定：系统变量 Mob 为真，或者当前容器宽度小于 600
      const isMob = window.Mob || (containerWidth < 600);
      const commonAttrs = { m, Box, getColor, Notice, iconPark, trs };
      const isValidPath = !!(repoPath && repoPath !== "/" && repoPath !== ".");
      const rootName = repoPath ? repoPath.split(/[/\\]/).filter(Boolean).pop() : trs("时光机/主体/未指定", { cn: "未指定", en: "Unspecified" });

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: isMob ? "column" : "row",
            width: "100%",
            height: "100%",
            background: getColor('gray_4').back,
            color: getColor('gray_4').front,
            overflow: "hidden",
            position: "relative"
          },
          oncreate: (vn) => {
            dom = vn.dom;
            containerWidth = dom.offsetWidth;
            observer = new ResizeObserver(entries => {
              for (let entry of entries) {
                const newWidth = entry.contentRect.width;
                if (Math.abs(newWidth - containerWidth) > 5) {
                  containerWidth = newWidth;
                  m.redraw();
                }
              }
            });
            observer.observe(dom);
            m.redraw(); // 强制刷新一次拿宽度
          }
        },
        [
          // 移动端：侧边栏改为浮层或顶部折叠
          (!isMob || showSidebar) ? m(HistorySidebar,
            {
              ...commonAttrs,
              history,
              hash,
              isValidPath,
              style: isMob ? {
                position: "absolute",
                top: "4rem", // 避开 Toolbar
                left: 0,
                width: "100%",
                height: "calc(100% - 4rem)",
                zIndex: 100,
                background: getColor('gray_4').back
              } : {},
              customCwd: comData.data.get()?.customCwd,
              onOpenProjectBackup: async () => {
                const cwd = comData.data.get()?.customCwd;
                if (!cwd) return;
                const targetPath = `${cwd}/.owoTimeMachine`;
                const oldPath = repoPath;
                repoPath = targetPath;
                if (await loadHistory()) {
                  await settingData.fnCall("appUpdateData", [appId, { repoPath }]);
                  hash = null;
                  files = [];
                } else {
                  repoPath = oldPath;
                }
                if (isMob) showSidebar = false;
                m.redraw();
              },
              onSelect: (newHash) => {
                hash = newHash;
                relPath = "";
                if (isMob) showSidebar = false;
                return loadFiles();
              },
              onDelete: async (item) => {
                if (await askConfirm("确定删除该还原点？")) {
                  const res = await settingData.fnCall("appDispatch", [appId, "deleteSnapshot", { id: item.id, repoPath }]);
                  if (res?.ok) return loadHistory();
                }
              },
              onSnap: async () => {
                const checkRes = await settingData.fnCall("appDispatch", [appId, "detectNested", { repoPath }]);
                if (checkRes.ok && checkRes.data?.length > 0) {
                  if (!(await askConfirm("检测到嵌套仓库，建议移除子目录中的 .owoTimeMachine 文件夹后再操作喵。", "数据完整性警报"))) return;
                }
                const msg = await askName("创建版本快照", `备份 ${new Date().toLocaleString()}`);
                if (!msg) return;
                const res = await settingData.fnCall("appDispatch", [appId, "snap", { repoPath, msg }]);
                if (res?.ok) {
                  Notice.launch({ msg: "版本快照已保存", type: "success" });
                  if (isMob) showSidebar = false;
                  return loadHistory();
                }
              }
            }) : null,

          m("",
            {
              style: {
                flex: 1,
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: isMob ? "auto" : "100%",
                overflow: "hidden"
              }
            },
            [
              m(Toolbar,
                {
                  ...commonAttrs,
                  isValidPath,
                  hash,
                  relPath,
                  rootName,
                  isMob,
                  showSidebar,
                  toggleSidebar: () => { showSidebar = !showSidebar; m.redraw(); },
                  onBack: () => {
                    if (relPath) {
                      const p = relPath.split('/');
                      p.pop();
                      relPath = p.join('/');
                      return loadFiles();
                    }
                    hash = null;
                    files = [];
                    return m.redraw();
                  },
                  onOpenRepo: async () => {
                    const res = await settingData.fnCall("appOpenDialog", [{ title: "打开备份目录", properties: ["openDirectory"] }]);
                    if (res?.ok && res.filePath) {
                      const oldPath = repoPath;
                      repoPath = res.filePath;
                      if (await loadHistory()) {
                        await settingData.fnCall("appUpdateData", [appId, { repoPath }]);
                        hash = null;
                        files = [];
                      } else {
                        repoPath = oldPath;
                      }
                      m.redraw();
                    }
                  }
                }),

              m(ContentArea,
                {
                  ...commonAttrs,
                  files, history, selected, isSelecting, selectStart, selectEnd, repoPath, hash, relPath, isValidPath, rootName,
                  onContextMenu: (e) => {
                    const itemEl = e.target.closest('[data-name]');
                    if (!itemEl) return e.preventDefault();
                    e.preventDefault();
                    const itemName = itemEl.getAttribute('data-name');
                    if (!selected.has(itemName)) {
                      selected.clear();
                      selected.add(itemName);
                    }
                    return Notice.launch({
                      tip: "操作选项",
                      x: e.clientX,
                      y: e.clientY,
                      content: {
                        view: (v) => {
                          return m(Box,
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                padding: "0.5rem"
                              }
                            },
                            [
                              m("",
                                {
                                  style: {
                                    padding: "0.8rem 1.2rem",
                                    opacity: 0.5,
                                    fontSize: "0.8rem"
                                  }
                                },
                                "💡 请拖拽项目进行还原"),
                              m(Box,
                                {
                                  isBtn: true,
                                  style: {
                                    padding: "0.8rem 1.2rem",
                                    textAlign: "left"
                                  },
                                  onclick: () => {
                                    v.attrs.delete();
                                    return navigator.clipboard.writeText(Array.from(selected).join('\n'));
                                  }
                                },
                                `复制路径 (${selected.size})`)
                            ]);
                        }
                      }
                    });
                  },
                  onPointerDown: (e) => {
                    const itemEl = e.target.closest('[data-name]');
                    const itemName = itemEl?.getAttribute('data-name');
                    if (itemEl && itemName) {
                      if (e.button === 0) {
                        const now = Date.now();
                        if (now - lastPointerTime < 300 && lastPointerTarget === itemName) {
                          if (!hash) {
                            hash = itemName;
                            relPath = "";
                            loadFiles();
                          } else {
                            const isDir = itemName.endsWith('/');
                            const itemRelPath = relPath ? `${relPath}/${itemName}` : itemName;
                            if (isDir) {
                              relPath = itemRelPath.replace(/\/$/, '');
                              loadFiles();
                            } else (async () => {
                              const res = await settingData.fnCall("appDispatch", [appId, "getFileContent", { hash, relPath: itemRelPath, repoPath }]);
                              if (res?.ok) await settingData.fnCall("appLaunch", ["editor", { data: { filePath: `[快照] ${itemName}`, content: res.data, readOnly: true } }]);
                            })();
                          }
                          lastPointerTime = 0;
                        } else {
                          if (e.metaKey || e.ctrlKey) {
                            if (selected.has(itemName)) selected.delete(itemName); else selected.add(itemName);
                          } else {
                            if (selected.has(itemName)) {
                              pendingSelectClear = itemName; // 延迟清除，等待拖拽检查
                            } else {
                              selected.clear();
                              selected.add(itemName);
                            }
                          }
                          m.redraw();
                        }
                        lastPointerTime = now;
                        lastPointerTarget = itemName;
                      }
                      return;
                    }
                    if (e.button !== 0) return;
                    if (!e.metaKey && !e.ctrlKey) { selected.clear(); m.redraw(); }
                    const container = e.currentTarget;
                    const rect = container.getBoundingClientRect();
                    const startX = e.clientX - rect.left + container.scrollLeft;
                    const startY = e.clientY - rect.top + container.scrollTop;
                    isSelecting = false;
                    selectStart = { x: startX, y: startY };
                    selectEnd = { x: startX, y: startY };
                    const move = (ev) => {
                      const cx = ev.clientX - rect.left + container.scrollLeft;
                      const cy = ev.clientY - rect.top + container.scrollTop;
                      if (!isSelecting && Math.hypot(cx - startX, cy - startY) > 5) isSelecting = true;
                      if (isSelecting) {
                        selectEnd = { x: cx, y: cy };
                        const sb = { left: Math.min(selectStart.x, selectEnd.x), top: Math.min(selectStart.y, selectEnd.y), width: Math.abs(selectEnd.x - selectStart.x), height: Math.abs(selectEnd.y - selectStart.y) };
                        if (!ev.metaKey && !ev.ctrlKey) selected.clear();
                        container.querySelectorAll('[data-name]').forEach(el => {
                          const r = el.getBoundingClientRect();
                          const ir = { left: r.left - rect.left + container.scrollLeft, top: r.top - rect.top + container.scrollTop, width: r.width, height: r.height };
                          if (sb.left < ir.left + ir.width && sb.left + sb.width > ir.left && sb.top < ir.top + ir.height && sb.top + sb.height > ir.top) selected.add(el.getAttribute('data-name'));
                        });
                        m.redraw();
                      }
                    };
                    const up = () => { isSelecting = false; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); m.redraw(); };
                    document.addEventListener('pointermove', move);
                    document.addEventListener('pointerup', up);
                  },
                  onPointerUp: (e) => {
                    if (pendingSelectClear) {
                      selected.clear();
                      selected.add(pendingSelectClear);
                      pendingSelectClear = null;
                      m.redraw();
                    }
                  },
                  onSnapshotDragStart: (e, item) => {
                    pendingSelectClear = null;
                    const dragItems = selected.has(item.hash) ? Array.from(selected).map(h => ({ type: 'tm-item', hash: h, relPath: ".", name: rootName, repoRoot: repoPath })) : [{ type: 'tm-item', hash: item.hash, relPath: ".", name: rootName, repoRoot: repoPath }];
                    e.dataTransfer.setData("application/json", JSON.stringify(dragItems.length === 1 ? dragItems[0] : { type: 'tm-items', items: dragItems }));

                    // --- 视觉增强 ---
                    const container = document.createElement("div");
                    container.style.cssText = `position: absolute; top: -1000px; left: -1000px; width: 100px; height: 100px; pointer-events: none; z-index: 10000;`;
                    const stackCount = Math.min(dragItems.length, 3);
                    for (let i = 0; i < stackCount; i++) {
                      const img = document.createElement("div");
                      img.textContent = "📦";
                      img.style.cssText = `position: absolute; font-size: 44px; left: ${20 + i * 6}px; top: ${20 + i * 6}px; z-index: ${10 - i}; line-height: 1; text-shadow: 0 4px 8px rgba(0,0,0,0.3);`;
                      container.appendChild(img);
                    }
                    const badge = document.createElement("div");
                    badge.textContent = dragItems.length;
                    badge.style.cssText = `position: absolute; top: 10px; left: 10px; background: #ff4d4f; color: white; border-radius: 20px; min-width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0 4px; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4); z-index: 50;`;
                    container.appendChild(badge);
                    document.body.appendChild(container);
                    e.dataTransfer.setDragImage(container, 40, 40);
                    setTimeout(() => document.body.removeChild(container), 0);
                  },
                  onFileDragStart: (e, file) => {
                    pendingSelectClear = null;
                    const dragItems = selected.has(file.name) ? Array.from(selected).map(f => ({ type: 'tm-item', hash, relPath: f.endsWith('/') ? (relPath ? `${relPath}/${f}` : f).slice(0, -1) : (relPath ? `${relPath}/${f}` : f), name: f.endsWith('/') ? f.slice(0, -1) : f, repoRoot: repoPath })) : [{ type: 'tm-item', hash, relPath: file.name.endsWith('/') ? (relPath ? `${relPath}/${file.name}` : file.name).slice(0, -1) : (relPath ? `${relPath}/${file.name}` : file.name), name: file.name.endsWith('/') ? file.name.slice(0, -1) : file.name, repoRoot: repoPath }];
                    e.dataTransfer.setData("application/json", JSON.stringify(dragItems.length === 1 ? dragItems[0] : { type: 'tm-items', items: dragItems }));

                    // --- 视觉增强 ---
                    const container = document.createElement("div");
                    container.style.cssText = `position: absolute; top: -1000px; left: -1000px; width: 100px; height: 100px; pointer-events: none; z-index: 10000;`;
                    const getIconStr = (name) => {
                      if (name.endsWith('/')) return "📁";
                      const ext = name.split('.').pop().toLowerCase();
                      return { "js": "📜", "json": "⚙️", "md": "📝", "txt": "📄", "html": "🌐", "css": "🎨", "png": "🖼️", "jpg": "🖼️", "mp4": "🎬", "mp3": "🎵" }[ext] || "📃";
                    };
                    const stackCount = Math.min(dragItems.length, 3);
                    for (let i = 0; i < stackCount; i++) {
                      const img = document.createElement("div");
                      img.textContent = getIconStr(dragItems[i].name + (dragItems[i].relPath.includes('.') ? '' : '/'));
                      img.style.cssText = `position: absolute; font-size: 44px; left: ${20 + i * 6}px; top: ${20 + i * 6}px; z-index: ${10 - i}; line-height: 1; text-shadow: 0 4px 8px rgba(0,0,0,0.3);`;
                      container.appendChild(img);
                    }
                    const badge = document.createElement("div");
                    badge.textContent = dragItems.length;
                    badge.style.cssText = `position: absolute; top: 10px; left: 10px; background: #ff4d4f; color: white; border-radius: 20px; min-width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0 4px; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4); z-index: 50;`;
                    container.appendChild(badge);
                    document.body.appendChild(container);
                    e.dataTransfer.setDragImage(container, 40, 40);
                    setTimeout(() => document.body.removeChild(container), 0);
                  }
                })
            ])
        ]);
    }

  };
};
