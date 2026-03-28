export default {
  inputDom: null,
  inputText: "",
  needSync: false, // 外部修改 inputText 后置 true，通知编辑器重渲染
  list: [
    {
      uuid: Date.now(),
      name: "系统",
      content: "欢迎使用",
      group: "system",
      timestamp: Date.now(),
    }
  ],
  topChat: null,
  async pullList() {
    try {
      let tmp = await m.request({
        url: `${window.location.protocol}//${window.location.hostname}:9501/api/comData/get`
      })
      this.list = tmp.data.chatLists?.find(l => l.id === 0)?.data || []
      return this.list
    }
    catch (err) {
      throw err
    }
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