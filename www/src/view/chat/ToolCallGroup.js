import ChatItem from "./ChatItem.js"

export default () => {
  let expanded = false

  return {
    view({ attrs }) {
      const chats = attrs.chats
      const hasError = chats.some(chat => chat.ask?.toolCallSuccess === false)
      const doneChat = chats.find(chat => chat.ask?.toolCallDuration)
      const duration = doneChat?.ask?.toolCallDuration
      const isLoading = !doneChat // 没有"完毕"消息说明还在执行中

      return m('', {
        style: {
          display: "inline-block",
          margin: '1rem',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          background: hasError ? 'rgba(255, 100, 100, 0.15)' : '#343d38',
          borderLeft: hasError ? '0.4rem solid #ff6b6b' : '0.4rem solid #50815b',
        }
      }, [
        // 标题栏
        m('', {
          style: { cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#aaa' },
          onclick: () => { expanded = !expanded }
        }, [
          m('span', expanded ? '▼ ' : '▶ '),
          // 加载动画
          isLoading ? m('span', {
            style: {
              display: 'inline-block',
              width: '1rem',
              height: '1rem',
              border: '0.15rem solid #aaa',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '0.5rem',
            }
          }) : null,
          hasError ? '⚠ 工具调用失败' : (isLoading ? '工具调用中...' : '工具调用'),
          m('span', { style: { marginLeft: '0.5rem', opacity: 0.7 } },
            `(${chats.length})${duration ? ` · ${(duration / 1000).toFixed(1)}s` : ''}`
          )
        ]),
        // 展开详情 - 使用 isGroupChild 而不是 isChildren，避免显示【转到】按钮
        expanded ? m('', { style: { marginTop: '0.5rem' } },
          chats.map(chat => m(ChatItem, { key: chat.uuid, chat, isGroupChild: true }))
        ) : null,
        // CSS 动画
        m('style', `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `)
      ])
    }
  }
}
