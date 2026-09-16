import data from "./chatData.js";
import comData from "../../comData/comData.js";
import { trs } from "../common/i18n.js";
import getColor from "../common/getColor.js";
import Notice from "../common/notice.js";
import Box from "../common/box.js";



/**
 * ChatInputEditor - 一个基于 contenteditable 的富文本编辑器
 * 标签转 Chip 的唯一实现位于 chatData.textToChipHtml(text, renderMode)
 */
export default () => {
  let editorDom = null;
  let renderMode = true; // 状态：渲染模式或原始模式
  let showTip = false;
  let tipText = "";
  let tipTimeout = null;
  let listId = 0; // 本编辑器所属会话（窗口当前显示的会话）
  let self = null; // 本组件实例
  let savedRange = null; // 失焦时保存的光标 Range
  let isExpanded = false; // 文章展开模式
  let historyIndex = undefined; // 历史记录游标
  let lastText = ""; // 本编辑器最近一次与 state 对齐的文本（用于判断 state 是否被其它窗口改过）

  const triggerToast = (text) => {
    tipText = text;
    showTip = true;
    m.redraw();
    if (tipTimeout) clearTimeout(tipTimeout);
    tipTimeout = setTimeout(() => {
      showTip = false;
      m.redraw();
    }, 1000); // 3.5秒后消失
  };

  // 将 HTML 转回纯文本
  const htmlToText = (html) => {
    let tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    // 处理换行
    const brs = tempDiv.querySelectorAll("br");
    brs.forEach(br => br.replaceWith("\n"));

    // 处理标签：从 data-id 恢复原始格式
    const tags = tempDiv.querySelectorAll(".editor-tag");
    tags.forEach(tag => {
      let type = "attachid";
      if (tag.classList.contains("tag-app")) type = "appid";
      else if (tag.classList.contains("tag-file")) type = "filePath";
      else if (tag.classList.contains("tag-code")) type = "codeQuote";
      else if (tag.classList.contains("tag-element")) type = "elementId";
      else if (tag.classList.contains("tag-msg")) type = "msg";

      const id = tag.getAttribute("data-id");
      tag.replaceWith(`[${type}:${id}]`);
    });

    return tempDiv.textContent || tempDiv.innerText || "";
  };
  // 根据文本偏移量恢复光标（遍历 TEXT_NODE，跳过 contenteditable=false 的 Chip）
  const restoreCursorByOffset = (root, offset) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node, cur = 0;
    while ((node = walker.nextNode())) {
      const len = node.textContent.length;
      if (cur + len >= offset) {
        const r = document.createRange();
        r.setStart(node, offset - cur);
        r.collapse(true);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        return;
      }
      cur += len;
    }
    // fallback: 末尾
    const s = window.getSelection();
    s.removeAllRanges();
    s.selectAllChildren(root);
    s.collapseToEnd();
  };

  // 同步外部数据到编辑器 (用于初次加载或外部修改)
  const syncToEditor = () => {
    if (!editorDom) return;

    // 保存光标在纯文本中的偏移
    let savedOffset = -1;
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorDom.contains(range.commonAncestorContainer)) {
        const pre = document.createRange();
        pre.selectNodeContents(editorDom);
        pre.setEnd(range.endContainer, range.endOffset);
        savedOffset = pre.toString().length;
      }
    }

    const text = data.getSessionState(listId).inputText || "";
    lastText = text; // 记下本次对齐的文本
    const newHtml = data.textToChipHtml(text, renderMode);
    if (editorDom.innerHTML !== newHtml) {
      editorDom.innerHTML = newHtml;
    }

    // 恢复光标
    if (savedOffset >= 0) {
      restoreCursorByOffset(editorDom, savedOffset);
    }
  };

  const LinkDialog = {
    url: "https://",
    text: "链接",
    view() {
      return m("div", {
        style: {
          padding: "1rem 2rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem",
          minWidth: "18rem"
        }
      }, [
        m("div", [
          m("label", { style: { display: "block", marginBottom: "0.3rem", fontSize: "0.9rem", color: getColor('gray_6').front } }, trs("输入框/弹窗/链接地址", { cn: "链接地址:", en: "Link URL:" })),
          m(Box, {
            tagName: "input",
            value: LinkDialog.url,
            ext: {
              type: "text",
              value: LinkDialog.url,
              placeholder: "https://"
            },
            oninput: (dom) => { LinkDialog.url = dom.value; }
          })
        ]),
        m("div", [
          m("label", { style: { display: "block", marginBottom: "0.3rem", fontSize: "0.9rem", color: getColor('gray_6').front } }, trs("输入框/弹窗/链接文本", { cn: "链接文字:", en: "Link Text:" })),
          m(Box, {
            tagName: "input",
            value: LinkDialog.text,
            ext: {
              type: "text",
              value: LinkDialog.text,
              placeholder: trs("输入框/占位符/链接", { cn: "链接", en: "link" })
            },
            oninput: (dom) => { LinkDialog.text = dom.value; }
          })
        ])
      ]);
    }
  };

  const QuoteDialog = {
    text: "引用内容",
    view() {
      return m("div", {
        style: {
          padding: "1rem 2rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem",
          minWidth: "18rem"
        }
      }, [
        m("div", [
          m("label", { style: { display: "block", marginBottom: "0.3rem", fontSize: "0.9rem", color: getColor('gray_6').front } }, trs("输入框/弹窗/引用内容", { cn: "引用内容:", en: "Quote Content:" })),
          m(Box, {
            tagName: "input",
            value: QuoteDialog.text,
            ext: {
              type: "text",
              value: QuoteDialog.text,
              placeholder: "请输入引用内容..."
            },
            oninput: (dom) => { QuoteDialog.text = dom.value; }
          })
        ])
      ]);
    }
  };

  const handleMarkdown = (prefix, suffix, defaultText, isLink = false, isQuote = false) => {
    if (!editorDom) return;
    editorDom.focus();
    const selection = window.getSelection();
    let rangeBackup = null;
    if (selection.rangeCount > 0) {
      rangeBackup = selection.getRangeAt(0).cloneRange();
    }
    const selectedText = selection.toString();

    if (isLink) {
      if (selectedText) {
        // 有选中文本，直接包裹不弹窗
        const newText = `[${selectedText}](https://)`;
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(newText);
          range.insertNode(textNode);
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else {
          insertAtCursor(newText);
        }
        editorDom.dispatchEvent(new Event('input', { bubbles: true }));
        m.redraw();
      } else {
        // 没有选中文本，弹出 Notice 弹窗输入
        LinkDialog.url = "https://";
        LinkDialog.text = trs("输入框/占位符/链接", { cn: "链接", en: "link" });
        Notice.launch({
          tip: trs("输入框/弹窗/插入链接", { cn: "插入链接", en: "Insert Link" }),
          content: LinkDialog,
          confirm: (box, closeTabFn) => {
            const url = LinkDialog.url.trim();
            const text = LinkDialog.text.trim();
            if (url && text) {
              // 恢复原有的光标选区
              if (rangeBackup) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(rangeBackup);
              }
              // 插入
              insertAtCursor(`[${text}](${url})`);
            }
            closeTabFn();
          }
        });
      }
    } else if (isQuote) {
      if (selectedText) {
        // 有选中文本，直接包裹不弹窗
        const newText = `\n> ${selectedText}\n`;
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(newText);
          range.insertNode(textNode);
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else {
          insertAtCursor(newText);
        }
        editorDom.dispatchEvent(new Event('input', { bubbles: true }));
        m.redraw();
      } else {
        // 没有选中文本，弹出 Notice 弹窗输入引用
        QuoteDialog.text = "";
        Notice.launch({
          tip: trs("输入框/弹窗/插入引用", { cn: "插入引用", en: "Insert Quote" }),
          content: QuoteDialog,
          confirm: (box, closeTabFn) => {
            const val = QuoteDialog.text.trim();
            if (val) {
              // 恢复原有的光标选区
              if (savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
              }
              // 插入
              insertAtCursor(`\n> ${val}\n`);
            }
            closeTabFn();
          }
        });
      }
    } else {
      // 普通文本包裹逻辑
      if (selectedText) {
        const range = selection.getRangeAt(0);
        const newText = prefix + selectedText + suffix;
        range.deleteContents();
        const textNode = document.createTextNode(newText);
        range.insertNode(textNode);
        const newRange = document.createRange();
        newRange.setStartAfter(textNode);
        newRange.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(newRange);
      } else {
        insertAtCursor(prefix + defaultText + suffix);
      }
      editorDom.dispatchEvent(new Event('input', { bubbles: true }));
      m.redraw();
    }
  };

  // 在光标处插入文本（渲染 Chip 胶囊），再把 DOM 反解回会话草稿
  // 注：插入时恒按渲染模式生成 Chip（保持既有行为，源码模式下亦然）
  const insertAtCursor = (text) => {
    if (!editorDom) return;
    editorDom.focus();
    const selection = window.getSelection();
    if (savedRange) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
      savedRange = null;
    }
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const temp = document.createElement('span');
      temp.innerHTML = data.textToChipHtml(text);
      while (temp.firstChild) {
        range.insertNode(temp.firstChild);
        range.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editorDom.insertAdjacentHTML('beforeend', data.textToChipHtml(text));
    }
    data.getSessionState(listId).inputText = htmlToText(editorDom.innerHTML);
    m.redraw();
  };

  return {
    oninit(vnode) {
      self = vnode.state;
    },
    oncreate(vnode) {
      editorDom = vnode.dom.querySelector('.chat-input-editor');
      if (vnode.attrs.onReady) vnode.attrs.onReady(vnode.state);
      if (!data.focusEditor) data.focusEditor = vnode.state;
      syncToEditor();
    },
    onupdate() {
      // 同一会话可能被多个窗口同时打开：其它窗口改了 state 时，把内容回灌进本编辑器
      if (!editorDom) return;
      if (document.activeElement === editorDom) return; // 本编辑器正在输入，DOM 是权威，回灌会导致光标跳动
      if ((data.getSessionState(listId).inputText || "") === lastText) return;
      syncToEditor();
    },
    onremove(vnode) {
      if (data.focusEditor === vnode.state) {
        data.focusEditor = null;
      }
    },
    insertAtCursor,
    appendText(text) {
      insertAtCursor(text);
    },
    addFiles(files) {
      const session = data.getSessionState(listId);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const attachObj = {
          id: file.name,
          url: URL.createObjectURL(file),
          type: file.type.startsWith('image/') ? 'image' : 'file',
          progress: 0,
          status: 'uploading'
        };
        session.attachments.push(attachObj);
        const formData = new FormData();
        formData.append('file', file);
        const xhr = new XMLHttpRequest();
        attachObj.xhr = xhr;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            attachObj.progress = Math.round((event.loaded / event.total) * 100);
            m.redraw();
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const res = JSON.parse(xhr.responseText);
            if (res && res.id) {
              attachObj.id = res.id;
              attachObj.url = res.url;
              attachObj.status = 'done';
              attachObj.progress = 100;
              insertAtCursor(` [attachid:${res.id}] `);
            }
          }
        };
        xhr.onerror = () => {
          attachObj.status = 'error';
          Notice.launch({ msg: "上传失败: " + file.name });
          m.redraw();
        };
        xhr.open('POST', `/api/attachments/set`);
        xhr.send(formData);
      }
    },
    getListId() {
      return listId;
    },
    setText(text) {
      data.getSessionState(listId).inputText = text;
      syncToEditor();
    },
    clear() {
      const session = data.getSessionState(listId);
      session.inputText = "";
      session.attachments = [];
      session.quotes = [];
      if (editorDom) editorDom.innerHTML = "";
      m.redraw();
    },
    focus() {
      if (editorDom) editorDom.focus();
    },
    view({ attrs }) {
      listId = attrs.listId || 0; // 锁定切换后窗口显示的会话会变，每次渲染同步
      const draft = data.getSessionState(listId).inputText;
      const charCount = draft ? draft.length : 0;

      // 按钮 1（展开/收起）
      const expIconColor = isExpanded ? getColor('pink_2').front : getColor('gray_3').front;
      const expIcon = m.trust(window.iconPark.getIcon(isExpanded ? "OffScreenOne" : "FullScreenOne", { fill: expIconColor, size: "0.95rem" }));
      const expText = isExpanded ? trs("输入框/按钮/收起", { cn: "收起", en: "Shrink" }) : trs("输入框/按钮/展开", { cn: "展开", en: "Expand" });

      // 按钮 2（历史）
      const histIconColor = getColor('gray_3').front;
      const histIcon = m.trust(window.iconPark.getIcon("History", { fill: histIconColor, size: "0.95rem" }));
      const histText = trs("输入框/按钮/历史", { cn: "历史", en: "History" });

      // 按钮 3（富文本/源码）
      const modeIconColor = renderMode ? getColor('pink_2').front : getColor('gray_3').front;
      const modeIcon = m.trust(window.iconPark.getIcon(renderMode ? "MagicWand" : "FileCode", { fill: modeIconColor, size: "0.95rem" }));
      const modeText = renderMode ? trs("输入框/按钮/富文本", { cn: "富文本", en: "RICH" }) : trs("输入框/按钮/源码", { cn: "源码", en: "RAW" });

      const wrapperStyle = {
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden", // 裁剪底部圆角
        ...attrs.style,
        minHeight: isExpanded ? "25rem" : (attrs.style?.minHeight || "8rem"),
        maxHeight: isExpanded ? "40rem" : (attrs.style?.maxHeight || "20rem"),
        padding: "0" // 外部 padding 置为 0，由子项瓜分
      };

      // 准备 Markdown 快捷按钮的 iconPark 定义
      const btnBoldIcon = m.trust(window.iconPark.getIcon("TextBold", { fill: "currentColor", size: "1.2rem" }));
      const btnItalicIcon = m.trust(window.iconPark.getIcon("TextItalic", { fill: "currentColor", size: "1.2rem" }));
      const btnStrikeIcon = m.trust(window.iconPark.getIcon("Strikethrough", { fill: "currentColor", size: "1.2rem" }));
      const btnCodeIcon = m.trust(window.iconPark.getIcon("Code", { fill: "currentColor", size: "1.2rem" }));
      const btnLinkIcon = m.trust(window.iconPark.getIcon("LinkOne", { fill: "currentColor", size: "1.2rem" }));
      const btnQuoteIcon = m.trust(window.iconPark.getIcon("Quote", { fill: "currentColor", size: "1.2rem" }));
      const btnListIcon = m.trust(window.iconPark.getIcon("ListTwo", { fill: "currentColor", size: "1.2rem" }));

      return [
        m(".chat-input-wrapper", {
          style: wrapperStyle
        }, [
          showTip ? m(".expand-tip-toast", {
            style: {
              position: "absolute",
              bottom: isExpanded ? "3.2rem" : "1rem",
              left: "50%",
              width: "30rem",
              transform: "translateX(-50%)",
              background: getColor('yellow_1').back,
              color: getColor('yellow_1').front,
              padding: "0.4rem 1.2rem",
              borderRadius: "1rem",
              zIndex: 100,
              pointerEvents: "none",
              wordBreak: "break-all",
              textAlign: "center"
            }
          }, tipText) : null,

          isExpanded ? m(".markdown-toolbar", {
            style: {
              display: "flex",
              gap: "0.8rem",
              padding: "0.5rem 1.5rem",
              borderBottom: `0.1rem solid ${getColor('main').back}22`,
              background: getColor('gray_11').back + '1a',
              alignItems: "center"
            }
          }, [
            m("span.md-btn", {
              style: { cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.4rem", borderRadius: "0.3rem" },
              title: "粗体 (Bold)",
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { handleMarkdown("**", "**", "粗体文本"); }
            }, btnBoldIcon),
            m("span.md-btn", {
              style: { cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.4rem", borderRadius: "0.3rem" },
              title: "斜体 (Italic)",
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { handleMarkdown("*", "*", "斜体文本"); }
            }, btnItalicIcon),
            m("span.md-btn", {
              style: { cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.4rem", borderRadius: "0.3rem" },
              title: "删除线 (Strikethrough)",
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { handleMarkdown("~~", "~~", "删除文本"); }
            }, btnStrikeIcon),
            m("span.md-btn", {
              style: { cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.4rem", borderRadius: "0.3rem" },
              title: "行内代码",
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { handleMarkdown("`", "`", "代码"); }
            }, btnCodeIcon),
            m("span.md-btn", {
              style: { cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.4rem", borderRadius: "0.3rem" },
              title: "引用 (Quote)",
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { handleMarkdown("", "", "", false, true); }
            }, btnQuoteIcon),
            m("span.md-btn", {
              style: { cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.4rem", borderRadius: "0.3rem" },
              title: "插入链接 (Link)",
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { handleMarkdown("", "", "", true); }
            }, btnLinkIcon),
            m("span.md-btn", {
              style: { cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.2rem 0.4rem", borderRadius: "0.3rem" },
              title: "无序列表 (List)",
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { handleMarkdown("\n- ", "\n", "列表项"); }
            }, btnListIcon),
          ]) : null,
          m(".chat-input-editor", {
            onbeforeupdate() {
              // 阻止 Mithril 对该元素的默认向下 Diff，由于内部包含 contenteditable 与手动管理的子节点
              return false;
            },
            contenteditable: true,
            placeholder: attrs.placeholder || "",
            onfocus: () => {
              data.focusEditor = self;
              if (comData.data.get().targetChatListId !== listId) {
                comData.data.edit((d) => { d.targetChatListId = listId });
              }
            },
            onblur: () => {
              // 失焦时克隆保存当前光标 Range，用于 Notice 弹窗等场景恢复
              const sel = window.getSelection();
              if (sel.rangeCount > 0) {
                savedRange = sel.getRangeAt(0).cloneRange();
              }
            },
            oninput: (e) => {
              lastText = htmlToText(e.target.innerHTML);
              data.getSessionState(listId).inputText = lastText;
            },
            ondragover: (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            },
            ondrop: (e) => {
              e.preventDefault();
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                const imageFiles = [];
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  if (file.type.startsWith('image/')) {
                    imageFiles.push(file);
                  } else {
                    const path = window.electronAPI && window.electronAPI.getPathForFile ? window.electronAPI.getPathForFile(file) : (file.path || file.name);
                    insertAtCursor(` [filePath:${path}] `);
                  }
                }
                if (imageFiles.length > 0) self.addFiles(imageFiles);
              } else {
                const text = e.dataTransfer.getData('text/plain');
                if (text) {
                  if (!text.includes("\n") && (text.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(text))) {
                    insertAtCursor(` [filePath:${text}] `);
                  } else {
                    insertAtCursor(text);
                  }
                }
              }
            },
            onpaste: (e) => {
              const items = (e.clipboardData || e.originalEvent.clipboardData).items;
              const imageFiles = [];
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                  const file = items[i].getAsFile();
                  if (file) imageFiles.push(file);
                }
              }
              if (imageFiles.length > 0) {
                e.preventDefault();
                self.addFiles(imageFiles);
              }
            },
            onkeydown: (e) => {
              // 处理输入法组字状态，避免在选词时触发提交
              if (e.isComposing) return;

              // 快捷键 ctrl/cmd + ArrowUp / ArrowDown 切换历史
              if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                e.preventDefault();
                data.loadHistory();
                const history = data.inputHistory;
                if (history && history.length > 0) {
                  historyIndex = historyIndex === undefined ? 0 : (e.key === "ArrowUp" ? (historyIndex + 1) % history.length : (historyIndex - 1 + history.length) % history.length);
                  data.getSessionState(listId).inputText = history[historyIndex];
                  syncToEditor();
                  m.redraw();
                }
                return;
              }

              // 在其他键盘输入时重置 historyIndex
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
                historyIndex = undefined;
              }

              if (e.key === "Backspace") {
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && selection.isCollapsed) {
                  const range = selection.getRangeAt(0);

                  // 尝试定位光标前面的节点
                  let prevNode = null;

                  if (range.startContainer.nodeType === Node.TEXT_NODE) {
                    if (range.startOffset === 0) {
                      prevNode = range.startContainer.previousSibling;
                    }
                  } else if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
                    prevNode = range.startContainer.childNodes[range.startOffset - 1];
                  }

                  if (prevNode && prevNode.nodeType === Node.ELEMENT_NODE && prevNode.classList.contains('editor-tag')) {
                    e.preventDefault();
                    prevNode.remove();
                    data.getSessionState(listId).inputText = htmlToText(e.target.innerHTML);
                    syncToEditor(); // 重绘以确保状态同步一致
                    return;
                  }
                }
              }

              if (e.key === "Enter") {
                if (isExpanded) {
                  // 展开模式下：Enter 是换行，Ctrl/Cmd/Shift + Enter 是发送
                  if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                    if (attrs.onsubmit) {
                      attrs.onsubmit(e);
                    }
                  } else {
                    // 允许默认换行行为
                  }
                } else {
                  // 普通模式下：Ctrl/Cmd/Shift + Enter 是换行，Enter 是发送
                  if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                    document.execCommand('insertText', false, '\n');
                    data.getSessionState(listId).inputText = htmlToText(e.target.innerHTML);
                    return;
                  }

                  // 仅纯 Enter 触发提交
                  e.preventDefault();
                  if (attrs.onsubmit) {
                    attrs.onsubmit(e);
                  }
                }
              }
            },
            style: {
              width: "100%",
              boxSizing: "border-box",
              flex: 1, // 弹性拉伸填满
              overflowY: "auto",
              outline: "none",
              color: "inherit",
              lineHeight: "1.5",
              wordBreak: "break-all",
              whiteSpace: "pre-wrap",
              padding: "1rem 2rem 0.5rem 2rem" // 上左右继承原边距，底部微留空
            }
          }),
          // 底部操作与字数统计工具条
          m(".chat-input-footer-bar", {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.2rem 2rem 0.8rem 2rem", // 左右对齐，底部贴合圆角
              background: "transparent", // 融于主体大底色
              fontSize: "0.85rem",
              userSelect: "none"
            }
          }, [
            // 左侧：字数统计
            m(".char-counter", {
              style: {
                color: getColor('pink_2').front,
              }
            }, trs("输入框/字数", { cn: `${charCount} 字`, en: `${charCount} words` })),
            // 右侧：功能按钮区
            m(".footer-buttons", {
              style: {
                display: "flex",
                gap: "0.5rem",
                alignItems: "center"
              }
            }, [
              // 按钮 1：高度加大/文章模式
              m("span.footer-btn", {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  cursor: "pointer",
                  background: isExpanded ? getColor('pink_2').back : getColor('gray_3').back,
                  color: isExpanded ? getColor('pink_2').front : getColor('gray_3').front,
                  padding: "0.2rem 0.6rem",
                  borderRadius: "1rem",
                  fontSize: "0.8rem",
                },
                title: isExpanded ? "收起输入框" : "展开为文章高度",
                onclick: () => {
                  isExpanded = !isExpanded;
                  if (isExpanded) {
                    triggerToast(trs("输入框/提示/展开模式", { cn: "已进入文章展开模式：Enter 键换行，Cmd/Ctrl/Shift + Enter 发送消息喵~", en: "Switched to expanded mode: Enter to new line, Cmd/Ctrl/Shift + Enter to send." }));
                  }
                  m.redraw();
                }
              }, [expIcon, expText]),

              // 按钮 2：历史记录弹窗
              m("span.footer-btn", {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  cursor: "pointer",
                  background: getColor('gray_3').back,
                  color: getColor('gray_3').front,
                  padding: "0.2rem 0.6rem",
                  borderRadius: "1rem",
                  fontSize: "0.8rem",
                },
                title: trs("输入框/按钮/提示历史", { cn: "选择历史消息", en: "Select history message" }),
                onclick: () => {
                  data.loadHistory();
                  const history = data.inputHistory;
                  if (!history || history.length === 0) {
                    Notice.launch({ msg: trs("输入框/提示/暂无历史", { cn: "暂无输入历史记录喵", en: "No input history yet" }), type: "info" });
                    return;
                  }
                  Notice.launch({
                    title: trs("输入框/弹窗/选择历史", { cn: "选择输入历史", en: "Select Input History" }),
                    content: {
                      view(vnode) {
                        return m("", {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                            maxHeight: "20rem",
                            overflowY: "auto",
                            padding: "1rem"
                          }
                        }, history.map((h, idx) => {
                          return m(Box, {
                            isBtn: true,
                            style: {
                              margin: 0,
                              textAlign: "left",
                              whiteSpace: "pre-wrap",
                              fontSize: "0.95rem"
                            },
                            onclick() {
                              data.getSessionState(listId).inputText = h;
                              syncToEditor();
                              m.redraw();
                              const noticeConfig = vnode.attrs.noticeConfig;
                              if (noticeConfig) {
                                Notice.closeTab(noticeConfig);
                              }
                            }
                          }, `${idx + 1}. ${h.slice(0, 80)}${h.length > 80 ? '...' : ''}`);
                        }));
                      }
                    }
                  });
                }
              }, [histIcon, histText]),

              // 按钮 3：RICH/RAW 切换
              m("span.footer-btn", {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  cursor: "pointer",
                  background: renderMode ? getColor('pink_1').back : getColor('gray_3').back,
                  color: renderMode ? getColor('pink_1').front : getColor('gray_3').front,
                  padding: "0.2rem 0.6rem",
                  borderRadius: "1rem",
                  fontSize: "0.8rem",
                },
                title: renderMode ? "当前富文本模式，点击切换为原始模式" : "当前原始模式，点击切换为富文本模式",
                onclick: () => {
                  if (editorDom) data.getSessionState(listId).inputText = htmlToText(editorDom.innerHTML);
                  renderMode = !renderMode;
                  syncToEditor();
                }
              }, [modeIcon, modeText])
            ])
          ])
        ]),
        m("style", `
          

          .chat-input-wrapper:focus-within {
            outline: 0.1rem solid ${getColor('main').back};
          }
          .chat-input-editor:empty:before {
            content: attr(placeholder);
            color: ${getColor('pink_2').front};
            cursor: text;
          }
          .editor-tag {
            display: inline-flex;
            align-items: center;
            background: ${getColor('gray_3').back};
            color: ${getColor('gray_3').front};
            padding: 0 0.4rem;
            margin: 0 0.1rem;
            border-radius: 0.3rem;
            font-size: 0.9rem;
            user-select: none;
            border: none;
            vertical-align: middle;
            height: 1.4rem;
          }
          .tag-attach {
             background: ${getColor('green_1').back}; /* 绿色调附件 */
             color: ${getColor('green_1').front};
          }
          .tag-app {
             background: ${getColor('pink_1').back}; /* 粉红调应用 */
             color: ${getColor('pink_1').front};
          }
          .tag-file {
             background: ${getColor('blue_1').back}; /* 蓝色调文件路径 */
             color: ${getColor('blue_1').front};
          }
          .tag-code {
             background: ${getColor('orange_1').back}; /* 橙色调代码引用 */
             color: ${getColor('orange_1').front};
          }
          .tag-ref {
             background: ${getColor('yellow_1').back}; /* 琥珀黄引用前缀 */
             color: ${getColor('yellow_1').front};
          }
          .tag-element {
             background: ${getColor('cyan_1').back}; /* 青色/水蓝调图元 */
             color: ${getColor('cyan_1').front};
          }
          /* 批注引用：💬 Chip 内嵌的彩色批注原文方块（超长省略，悬停看全文） */
          .tag-msg-comment {
             display: inline-block;
             max-width: 14rem;
             overflow: hidden;
             text-overflow: ellipsis;
             white-space: nowrap;
             vertical-align: middle;
             background: ${getColor('yellow_1').back};
             color: ${getColor('yellow_1').front};
             border-radius: 0.25rem;
             padding: 0 0.35rem;
             margin-left: 0.3rem;
             font-size: 0.85em;
             line-height: 1.2rem;
          }
          .md-btn {
             color: ${getColor('gray_8').front};
             transition: all 0.2s ease;
          }
          .md-btn:hover {
             color: ${getColor('pink_1').back};
             background: ${getColor('gray_3').back};
          }
        `)
      ];
    }
  };
};
