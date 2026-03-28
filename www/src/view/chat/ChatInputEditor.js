import data from "./chatData.js";
import { trs } from "../common/i18n.js";
import getColor from "../common/getColor.js";

/**
 * ChatInputEditor - 一个基于 contenteditable 的富文本编辑器
 * 支持将 [attachid:id] 和 [appid:id] 渲染为 Chip (标签)
 */
export default () => {
  let editorDom = null;
  let renderMode = true; // 状态：渲染模式或原始模式

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

      // 渲染应用标签 [appid:xxx]
      html = html.replace(/\[appid:([^\]]+)\]/g, (match, id) => {
        return `<span contenteditable="false" class="editor-tag tag-app" data-id="${id}">🚀 ${id}</span>`;
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
      const type = tag.classList.contains("tag-attach") ? "attachid" : "appid";
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
      return [
        m(".chat-input-wrapper", {
          style: {
            position: "relative",
            ...attrs.style
          }
        }, [
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
            onkeydown: (e) => {
              // 处理输入法组字状态，避免在选词时触发提交
              if (e.isComposing) return;

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
                // 如果有修饰键 (Cmd, Ctrl, Shift)，则允许换行（默认行为）
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
            },
            style: {
              width: "100%",
              height: "100%",
              minHeight: "4rem",
              maxHeight: "15rem",
              overflowY: "auto",
              outline: "none",
              color: "inherit",
              lineHeight: "1.5",
              wordBreak: "break-all",
              whiteSpace: "pre-wrap"
            }
          }),
          // 悬浮切换按钮
          m("div.chat-input-mode-switch", {
            style: {
              position: "absolute",
              bottom: "0.5rem",
              right: "2rem",
              fontSize: "1rem",
              color: getColor('pink_1').front,
              cursor: "pointer",
              userSelect: "none",
              background: getColor('pink_1').back,
              padding: "0.2rem 0.5rem",
              borderRadius: "1rem",
              zIndex: 10
            },
            title: renderMode ? "当前富文本模式，点击切换为原始模式" : "当前原始模式，点击切换为富文本模式",
            onclick: () => {
              if (editorDom) data.inputText = htmlToText(editorDom.innerHTML);
              renderMode = !renderMode;
              syncToEditor();
            }
          }, renderMode ? "✨ RICH" : "✏️ RAW")
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
        `)
      ];
    }
  };
};
