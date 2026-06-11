import data from "./chatData.js";
import comData from "../../comData/comData.js";
import { trs } from "../common/i18n.js";
import getColor from "../common/getColor.js";
import Notice from "../common/notice.js";
import Box from "../common/box.js";

/**
 * ChatInputEditor - 一个基于 contenteditable 的富文本编辑器
 * 支持将 [attachid:id] 和 [appid:id] 渲染为 Chip (标签)
 */
export default () => {
  let editorDom = null;
  let renderMode = true; // 状态：渲染模式或原始模式
  let showTip = false;
  let tipText = "";
  let tipTimeout = null;

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

  // 将纯文本转为 HTML (带 Chip 标签)
  const textToHtml = (text) => {
    if (!text) return "";
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    if (renderMode) {
      // 渲染附件标签 [attachid:xxx]
      html = html.replace(/\[attachid:([^\]]+)\]/g, (match, id) => {
        return `<span contenteditable="false" class="editor-tag tag-attach" data-id="${id}">📎 ${id}</span>`;
      });

      // 渲染文件路径标签 [filePath:xxx]
      html = html.replace(/\[filePath:([^\]]+)\]/g, (match, path) => {
        const fileName = path.split(/[/\\]/).pop();
        return `<span contenteditable="false" class="editor-tag tag-file" data-id="${path}" title="${path}">📄 ${fileName}</span>`;
      });

      // 渲染应用标签 [appid:xxx]
      html = html.replace(/\[appid:([^\]]+)\]/g, (match, id) => {
        return `<span contenteditable="false" class="editor-tag tag-app" data-id="${id}">🚀 ${id}</span>`;
      });

      // 渲染代码引用标签 [codeQuote:path:range]
      html = html.replace(/\[codeQuote:([^:\]]+)(?::([^\]]+))?\]/g, (match, path, range) => {
        const fileName = path.split(/[/\\]/).pop();
        const display = range ? `${fileName} (${range})` : fileName;
        return `<span contenteditable="false" class="editor-tag tag-code" data-id="${path}${range ? ':' + range : ''}" title="${path}${range ? ' @ ' + range : ''}">📝 ${display}</span>`;
      });
    }

    return html;
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

      const id = tag.getAttribute("data-id");
      tag.replaceWith(`[${type}:${id}]`);
    });

    return tempDiv.textContent || tempDiv.innerText || "";
  };

  // 同步外部数据到编辑器 (用于初次加载或外部修改)
  const syncToEditor = () => {
    if (editorDom) {
      const newHtml = textToHtml(data.inputText);
      if (editorDom.innerHTML !== newHtml) {
        editorDom.innerHTML = newHtml;
      }
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
    let savedRange = null;
    if (selection.rangeCount > 0) {
      savedRange = selection.getRangeAt(0).cloneRange();
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
          data._insertAtCursor(newText);
        }
        editorDom.dispatchEvent(new Event('input', { bubbles: true }));
        data.needSync = true;
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
              if (savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
              }
              // 插入
              data._insertAtCursor(`[${text}](${url})`);
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
          data._insertAtCursor(newText);
        }
        editorDom.dispatchEvent(new Event('input', { bubbles: true }));
        data.needSync = true;
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
              data._insertAtCursor(`\n> ${val}\n`);
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
        data._insertAtCursor(prefix + defaultText + suffix);
      }
      editorDom.dispatchEvent(new Event('input', { bubbles: true }));
      data.needSync = true;
      m.redraw();
    }
  };

  return {
    oncreate(vnode) {
      editorDom = vnode.dom.querySelector('.chat-input-editor');
      data.inputDom = editorDom;
      syncToEditor();
    },
    onremove() {
      if (data.inputDom === editorDom) {
        data.inputDom = null;
      }
    },
    view({ attrs }) {
      const isExpanded = data.isInputExpanded || false;
      const charCount = data.inputText ? data.inputText.length : 0;

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
              background: getColor('yellow_1').back + "aa",
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
              // 外部修改标记（如 quoteAttachId 插入标签后），强制同步
              if (data.needSync) {
                data.needSync = false;
                syncToEditor();
              }
              // 在 Mithril diff 前，手动检查外部数据是否改变
              if (editorDom) {
                const currentText = htmlToText(editorDom.innerHTML);
                if (currentText !== data.inputText) {
                  // 当外部将 inputText 清空时（比如发完消息），或者当前输入框尚未聚焦时，强制覆盖内容
                  if (data.inputText === "" || document.activeElement !== editorDom) {
                    syncToEditor();
                  }
                }
              }
              // 阻止 Mithril 对该元素的默认向下 Diff，由于内部包含 contenteditable 与手动管理的子节点
              return false;
            },
            contenteditable: true,
            placeholder: attrs.placeholder || "",
            oninput: (e) => {
              data.inputText = htmlToText(e.target.innerHTML);
            },
            ondragover: (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            },
            ondrop: (e) => {
              e.preventDefault();
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                const targetChatListId = (comData.data.get()?.targetChatListId || 0);
                if (!data.attachmentsMap[targetChatListId]) data.attachmentsMap[targetChatListId] = [];

                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const isImage = file.type.startsWith('image/');

                  let path = "";
                  if (window.electronAPI && window.electronAPI.getPathForFile) {
                    path = window.electronAPI.getPathForFile(file);
                  }

                  if (!path) {
                    path = file.path || file.name;
                  }

                  if (isImage) {
                    const attachObj = {
                      id: file.name,
                      url: URL.createObjectURL(file),
                      type: 'image',
                      progress: 0,
                      status: 'uploading'
                    };
                    data.attachmentsMap[targetChatListId].push(attachObj);

                    const formData = new FormData();
                    formData.append('file', file);

                    const xhr = new XMLHttpRequest();
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
                          attachObj.type = res.type || attachObj.type;
                          attachObj.status = 'done';
                          attachObj.progress = 100;
                          data.quoteAttachId(res.id);
                          m.redraw();
                        }
                      }
                    };
                    xhr.open('POST', `/api/attachments/set`);
                    xhr.send(formData);
                  } else {
                    if (path) {
                      data._insertAtCursor(` [filePath:${path}] `);
                    }
                  }
                }
              } else {
                const text = e.dataTransfer.getData('text/plain');
                if (text) {
                  if (!text.includes("\n") && (text.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(text))) {
                    data._insertAtCursor(` [filePath:${text}] `);
                  } else {
                    data._insertAtCursor(text);
                  }
                }
              }
            },
            onpaste: (e) => {
              const items = (e.clipboardData || e.originalEvent.clipboardData).items;
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                  const file = items[i].getAsFile();
                  if (!file) continue;

                  // 阻止默认粘贴行为（避免在 contenteditable 中直接插入原生 img 节点）
                  e.preventDefault();

                  // 准备上传
                  const targetChatListId = (comData.data.get()?.targetChatListId || 0);
                  if (!data.attachmentsMap[targetChatListId]) data.attachmentsMap[targetChatListId] = [];

                  // 创建临时占位对象
                  const attachObj = {
                    id: `pasting-${Date.now()}`,
                    url: URL.createObjectURL(file),
                    type: 'image',
                    progress: 0,
                    status: 'uploading'
                  };
                  data.attachmentsMap[targetChatListId].push(attachObj);

                  const formData = new FormData();
                  formData.append('file', file, `pasted-image-${Date.now()}.png`);

                  const xhr = new XMLHttpRequest();
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
                        data.quoteAttachId(res.id); // 自动插入标签
                        m.redraw();
                      }
                    }
                  };

                  xhr.open('POST', `/api/attachments/set`);
                  xhr.send(formData);
                }
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
                  if (data.historyIndex === undefined) {
                    data.historyIndex = 0;
                  } else {
                    if (e.key === "ArrowUp") {
                      data.historyIndex = (data.historyIndex + 1) % history.length;
                    } else {
                      data.historyIndex = (data.historyIndex - 1 + history.length) % history.length;
                    }
                  }
                  data.inputText = history[data.historyIndex];
                  data.needSync = true;
                  m.redraw();
                }
                return;
              }

              // 在其他键盘输入时重置 historyIndex
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
                data.historyIndex = undefined;
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
                    data.inputText = htmlToText(e.target.innerHTML);
                    syncToEditor(); // 重绘以确保状态同步一致
                    return;
                  }
                }
              }

              if (e.key === "Enter") {
                if (data.isInputExpanded) {
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
                    data.inputText = htmlToText(e.target.innerHTML);
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
                color: getColor('gray_6').front,
                opacity: 0.8
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
                  data.isInputExpanded = !isExpanded;
                  if (data.isInputExpanded) {
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
                              data.inputText = h;
                              data.needSync = true;
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
                  if (editorDom) data.inputText = htmlToText(editorDom.innerHTML);
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
            color: ${getColor('gray_6').front};
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
            border: 1px solid ${getColor('gray_6').front};
            vertical-align: middle;
            height: 1.4rem;
          }
          .tag-attach {
             background: ${getColor('green_1').back}; /* 绿色调附件 */
             color: ${getColor('green_1').front};
             border-color: ${getColor('green_1').back};
          }
          .tag-app {
             background: ${getColor('pink_2').back}; /* 紫色调应用 */
             color: ${getColor('pink_1').front};
             border-color: ${getColor('pink_1').back};
          }
          .tag-file {
             background: ${getColor('blue_1').back}; /* 蓝色调文件路径 */
             color: ${getColor('gray_8').front};
             border-color: ${getColor('blue_1').back};
          }
          .tag-code {
             background: ${getColor('orange_1').back}; /* 橙色调代码引用 */
             color: ${getColor('orange_1').front};
             border-color: ${getColor('orange_1').back};
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
