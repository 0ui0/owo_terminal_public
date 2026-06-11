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
  topChat: null,
  chatRows: null,
  getHistoryList() {
    if (!this.chatRows) return []
    const finalData = []
    // 反向拼装：从最旧的一页到最新的一页（第0页），且页内部翻转为旧->新
    for (let i = this.chatRows.click; i >= 0; i--) {
      const pageData = this.chatRows.pages[i] || []
      const pageCopy = [...pageData].reverse()
      finalData.push(...pageCopy)
    }
    return finalData
  },
  initChatRows(listId) {
    this.chatLists[listId] ??= new Rows({
      apiName: "chatMessages",
      idName: "id",
      limit: 30,
      order: "desc",
      params: { listId }
    })
    this.chatRows = this.chatLists[listId]
    return this.chatRows
  },
  xTerms: {},
  preparing: false,
  attachmentsMap: {}, // Keyed by listId to support per-session attachments
  quoteAppId(appId) {
    const quoteTxt = ` [appid:${appId}] `
    this._insertAtCursor(quoteTxt)
  },
  quoteAttachId(attachId) {
    const quoteTxt = ` [attachid:${attachId}] `
    this._insertAtCursor(quoteTxt)
  },
  quoteCode(path, lineRange) {
    const quoteTxt = ` [codeQuote:${path}${lineRange ? ':' + lineRange : ''}] `
    this._insertAtCursor(quoteTxt)
  },
  // 在光标处插入文本，然后同步数据并触发重渲染
  _insertAtCursor(text) {
    const dom = this.inputDom
    if (dom && dom.contentEditable === "true") {
      dom.focus()
      const selection = window.getSelection()
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        range.deleteContents()
        const textNode = document.createTextNode(text)
        range.insertNode(textNode)

        // 移动光标到插入文本之后
        const newRange = document.createRange()
        newRange.setStartAfter(textNode)
        newRange.setEndAfter(textNode)
        selection.removeAllRanges()
        selection.addRange(newRange)
      } else {
        // 无光标位置，追加到末尾
        dom.appendChild(document.createTextNode(text))
      }

      // 从 DOM 反解回纯文本，同步到 inputText
      dom.dispatchEvent(new Event('input', { bubbles: true }))
      // 标记需要重渲染（将 [attachid:xxx] 等渲染为 Chip，或保持原始文本）
      this.needSync = true
      m.redraw()
    } else {
      this.inputText += text
      this.needSync = true
      m.redraw()
    }
  }
}