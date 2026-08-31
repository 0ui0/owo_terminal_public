import comData from "../../comData/comData.js"
import settingData from "../setting/settingData.js"
import Rows from "../../class/rows.js"
import { trs } from "../common/i18n.js"

export default {
  getModeOptions() {
    return [
      { value: "readWrite", label: trs("下拉栏/读写模式", { cn: "工具读写", en: "Read/Write" }), desc: trs("下拉栏/读写描述", { cn: "正常模式，允许调用所有工具", en: "Normal mode, allows all tool calls" }) },
      { value: "chatOnly", label: trs("下拉栏/仅聊天", { cn: "仅聊天", en: "Chat Only" }), desc: trs("下拉栏/仅聊天描述", { cn: "禁止大模型实际执行所有系统级工具", en: "Prevent AI from executing any system tools" }) }
    ]
  },
  getStageOptions() {
    return [
      { value: "无附加", label: trs("发送组/无附加", { cn: "无附加", en: "None" }), text: "" },
      { value: "调查并讨论", label: trs("发送组/调查并讨论", { cn: "调查并讨论", en: "Investigate & Discuss" }), text: "调查相关问题并和用户讨论，本阶段仅使用只读工具。" },
      { value: "规划任务", label: trs("发送组/规划任务", { cn: "规划任务", en: "Plan Tasks" }), text: "本阶段需要调查并在项目目录编写任务计划书，编写完毕后由用户审核，本阶段使用只读工具。" },
      { value: "执行任务", label: trs("发送组/执行任务", { cn: "执行任务", en: "Execute" }), text: "用户批准执行当前任务，请耐心完成" }
    ]
  },
  inputDom: null,
  inputText: "",
  needSync: false, // 外部修改 inputText 后置 true，通知编辑器重渲染
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
  async updateTmStatus(listId) {
    try {
      const mainDir = comData.getChatList(listId)?.workDirs?.find(item => item.type === "main")?.path
      if (!mainDir) {
        this.getSessionState(listId).tmStatus = { gitOk: false, isReady: false };
        return m.redraw();
      }
      const res = await settingData.fnCall("tmGetProjectStatus", [mainDir]);
      this.getSessionState(listId).tmStatus = res || { ok: false, gitOk: false, isReady: false };
      m.redraw();
    } catch (e) {
      console.error("[chatData] updateTmStatus failed:", e);
      this.getSessionState(listId).tmStatus = { ok: false, gitOk: false, isReady: false, msg: e.message };
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
  sessionStates: {}, // 统一存储每个 listId 的输入和发信状态 (取代散装的 calls, quotesMap, attachmentsMap)
  initSessionState(listId, initConfig = {}) {
    if (!this.sessionStates[listId]) {
      this.sessionStates[listId] = {
        call: null,
        quotes: [],
        attachments: [],
        inputText: "",
        workDirs: [],
        tmStatus: { gitOk: false, isReady: false },
        unreadCount: 0,
        chatListDom: null,
        isAtBottom: true, // 全局拉底状态锁，真实反映用户物理上的阅读意图
        ...initConfig
      };
    } else {
      // 合并更新配置
      Object.assign(this.sessionStates[listId], initConfig);
    }
  },
  getSessionState(listId) {
    if (!this.sessionStates[listId]) {
      const listConfig = comData.getChatList(listId);
      this.initSessionState(listId, listConfig);
      if (listConfig?.workDirs?.find(item => item.type === "main")?.path) {
        this.updateTmStatus(listId);
      }
    }
    return this.sessionStates[listId];
  },
  getChatListDom(listId) {
    if (this.sessionStates[listId]?.chatListDom?.isConnected) {
      return this.sessionStates[listId].chatListDom;
    }
    const el = document.querySelector(`.chatList[data-list-id="${listId}"]`)
    if (el) return el
    return null
  },
  userHasScrolledUp: false,
  checkDomScrollAtBottom(listId, buffer = 120) {
    const el = this.getChatListDom(listId)
    if (!el) return true
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= buffer
  },
  chatListScrollAtBottom(listId) {
    // 行业标准：所有的组件不再使用高度差即时探测是否在底部，而是直接读取本状态锁。
    // 因为组件新增内容本身就会导致高度突变，会造成探测误判。
    return this.getSessionState(listId).isAtBottom !== false;
  },
  scrollChatListTobottom(listId) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = this.getChatListDom(listId)
        if (el) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: "instant"
          })
        }
      })
    })
  },
  topChat: null,
  getHistoryList(listId) {
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
  isUserSending: false,
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