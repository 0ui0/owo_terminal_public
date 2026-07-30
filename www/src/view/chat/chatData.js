import comData from "../../comData/comData.js"
import settingData from "../setting/settingData.js"
import Rows from "../../class/rows.js"

export default {
  inputDom: null,
  inputText: "",
  needSync: false, // 外部修改 inputText 后置 true，通知编辑器重渲染
  tmStatus: { gitOk: false, isReady: false },
  inputHistory: [],
  historyIndex: undefined,
  isInputExpanded: false,
  loadHistory() {
    try {
      const saved = localStorage.getItem("owo_chat_input_history");
      this.inputHistory = saved ? JSON.parse(saved) : [];
    } catch (e) {
      this.inputHistory = [];
    }
  },
  saveHistory(text) {
    if (!text || !text.trim()) return;
    this.loadHistory();
    this.inputHistory = this.inputHistory.filter(h => h !== text);
    this.inputHistory.unshift(text);
    if (this.inputHistory.length > 10) {
      this.inputHistory = this.inputHistory.slice(0, 10);
    }
    localStorage.setItem("owo_chat_input_history", JSON.stringify(this.inputHistory));
  },
  async updateTmStatus() {
    try {
      const cwd = comData.data.get()?.customCwd;
      if (!cwd) {
        this.tmStatus = { gitOk: false, isReady: false };
        return m.redraw();
      }
      const res = await settingData.fnCall("tmGetProjectStatus", [cwd]);
      this.tmStatus = res || { ok: false, gitOk: false, isReady: false };
      m.redraw();
    } catch (e) {
      console.error("[chatData] updateTmStatus failed:", e);
      this.tmStatus = { ok: false, gitOk: false, isReady: false, msg: e.message };
      m.redraw();
    }
  },
  list: [
    {
      uuid: Date.now(),
      name: "系统",
      content: "消息加载中...如果这条消息卡住了，说明出问题了",
      group: "system",
      timestamp: Date.now(),
    }
  ],
  chatLists: {},
  computedLists: {},
  chatListUnreadCount: 0,
  chatListScrollAtBottom() {
    const el = document.querySelector(".chatList")
    if (!el) return true
    return Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 30
  },
  scrollChatListTobottom() {
    requestAnimationFrame(() => {
      const el = document.querySelector(".chatList")
      if (el) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "instant"
        })
      }
    })
  },
  topChat: null,
  getHistoryList(listId = 0) {
    const rows = this.chatLists[listId]
    if (!rows) return this.list
    // 如果尚未获取过总数，回退到普通拼接逻辑
    if (rows.allCount === null) {
      const finalData = []
      for (let i = rows.click; i >= 0; i--) {
        const pageData = rows.pages[i] || []
        const pageCopy = [...pageData].reverse()
        finalData.push(...pageCopy)
      }
      this.computedLists[listId] = finalData
      return finalData
    }

    // 全量占位数组构建
    const allCount = rows.allCount
    const limit = rows.limit
    const finalData = new Array(allCount)
    const seenUuids = new Set() // 提前声明，拦截重影数据

    // 把已经加载的页填入指定位置
    for (const pageIndexStr in rows.pages) {
      const pageIndex = Number(pageIndexStr)
      const pageData = rows.pages[pageIndex]
      if (!pageData || pageData.length === 0) continue

      const offset = pageIndex * limit
      const pageCopy = [...pageData].reverse()
      const startIndex = allCount - offset - pageCopy.length

      if (startIndex >= 0 && startIndex + pageCopy.length <= allCount) {
        for (let j = 0; j < pageCopy.length; j++) {
          const item = pageCopy[j]
          if (item && item.uuid) {
            if (seenUuids.has(item.uuid)) continue
            seenUuids.add(item.uuid)
          }
          finalData[startIndex + j] = item
        }
      }
    }

    // 将未填充的插槽补上占位符
    for (let i = 0; i < allCount; i++) {
      if (finalData[i] === undefined) {
        const reverseIndex = allCount - 1 - i
        const pageIndex = Math.floor(reverseIndex / limit)
        finalData[i] = {
          uuid: 'placeholder_' + listId + '_' + i,
          isPlaceholder: true,
          pageIndex: pageIndex,
          group: "placeholder"
        }
      }
    }

    this.computedLists[listId] = finalData
    return finalData
  },
  initChatLists(listId) {
    this.chatLists[listId] ??= new Rows({
      apiName: "chatMessages",
      idName: "id",
      limit: 30,
      order: "desc",
      params: { listId }
    })
  },
  xTerms: {},
  preparing: false,
  attachmentsMap: {}, // Keyed by listId to support per-session attachments
  quoteToChatInputText(appId, arr, ext) {
    let txt = ""
    if (appId && appId !== "system") {
      txt += `[refAppid:${appId}]`
    }
    if (Array.isArray(arr)) {
      arr.forEach(item => {
        if (item && item.key && item.value !== undefined) {
          txt += `[${item.key}:${item.value}]`
        }
      })
    }
    if (txt) {
      this._insertAtCursor(` ${txt} `)
    }
  },
  quoteAppId(appId) {
    this.quoteToChatInputText(appId, null)
  },
  quoteAttachId(attachId) {
    this.quoteToChatInputText("system", [{ key: "attachid", value: attachId }])
  },
  quoteCode(path, lineRange, appId = null) {
    const val = lineRange ? `${path}:${lineRange}` : path
    this.quoteToChatInputText(appId, [{ key: "codeQuote", value: val }])
  },
  // 在 contentEditable 失焦时保存的光标位置（克隆的 Range），解决 Notice 弹窗等场景光标丢失
  _savedRange: null,
  // 将纯文本中的 [xxx:yyy] 标签转为 Chip HTML 片段
  _textToChipHtml(text) {
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    html = html.replace(/\[attachid:([^\]]+)\]/g, (_, id) =>
      `<span contenteditable="false" class="editor-tag tag-attach" data-id="${id}">📎 ${id}</span>&nbsp;`);
    html = html.replace(/\[filePath:([^\]]+)\]/g, (_, path) => {
      const fileName = path.split(/[/\\]/).pop();
      return `<span contenteditable="false" class="editor-tag tag-file" data-id="${path}" title="${path}">📄 ${fileName}</span>&nbsp;`;
    });
    html = html.replace(/\[(?:refAppid|appid):([^\]]+)\]/gi, (_, id) =>
      `<span contenteditable="false" class="editor-tag tag-app" data-id="${id}">🚀 ${id}</span>&nbsp;`);
    html = html.replace(/\[codeQuote:([^:\]]+)(?::([^\]]+))?\]/g, (_, path, range) => {
      const fileName = path.split(/[/\\]/).pop();
      const display = range ? `${fileName} (${range})` : fileName;
      return `<span contenteditable="false" class="editor-tag tag-code" data-id="${path}${range ? ':' + range : ''}" title="${path}${range ? ' @ ' + range : ''}">📝 ${display}</span>&nbsp;`;
    });
    html = html.replace(/\[elementId:([^\]]+)\]/gi, (_, id) => {
      const displayId = id.length > 10 ? (id.includes('-') ? id.split('-')[0] : id.slice(0, 8) + '…') : id;
      return `<span contenteditable="false" class="editor-tag tag-element" data-id="${id}" title="${id}">🎨 ${displayId}</span>&nbsp;`;
    });

    return html;
  },

  // 在光标处插入文本（直接渲染 Chip HTML），然后同步数据
  _insertAtCursor(text) {
    const dom = this.inputDom
    if (dom && dom.contentEditable === "true") {
      dom.focus()
      const selection = window.getSelection()

      // 恢复 blur 时保存的光标位置（解决 focus() 后光标跑到开头的问题）
      if (this._savedRange) {
        try {
          selection.removeAllRanges()
          selection.addRange(this._savedRange)
        } catch (_) { /* 克隆的 range 已失效则忽略 */ }
        this._savedRange = null
      }

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        range.deleteContents()

        // 构建 Chip HTML，通过临时容器逐个移动子节点以追踪光标位置
        const chipHtml = this._textToChipHtml(text)
        const temp = document.createElement('span')
        temp.innerHTML = chipHtml

        while (temp.firstChild) {
          const child = temp.firstChild
          range.insertNode(child)
          range.collapse(false) // 折叠到刚插入节点之后
        }

        // range 现在在插入内容末尾，设为光标位置
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        // 无光标位置，追加到末尾
        dom.insertAdjacentHTML('beforeend', this._textToChipHtml(text))
      }

      // 从 DOM 反解回纯文本，同步到 inputText
      dom.dispatchEvent(new Event('input', { bubbles: true }))
      // 不设 needSync，Chip 已在 DOM 中渲染好，避免 syncToEditor→innerHTML 导致光标丢失
      m.redraw()
    } else {
      this.inputText += text
      this.needSync = true
      m.redraw()
    }
  }
}