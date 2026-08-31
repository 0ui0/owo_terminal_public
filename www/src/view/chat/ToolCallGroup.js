import ChatItem from "./ChatItem.js"
import getColor from "../common/getColor.js"
import getBlurBg from "../common/getBlurBg.js"
import Avatar from "./Avatar.js"
import { trs } from "../common/i18n.js"

export default () => {
  let expanded = false

  return {
    view({ attrs }) {
      const chats = attrs.chats
      const hasError = chats.some(chat => chat.ask?.toolCallSuccess === false)
      const doneChat = chats.find(chat => chat.ask?.toolCallDuration)
      const duration = doneChat?.ask?.toolCallDuration
      const isLoading = !doneChat // 没有"完毕"消息说明还在执行中

      // 提取所有工具信息
      const getToolInfo = () => {
        const prepareChat = chats.find(chat => chat.ask?.toolCallStage === "prepare")
        const sysCalls = prepareChat?.ask?.sysCalls || []
        const sysReturns = doneChat?.ask?.sysReturns || []

        // 优先从结果里拿，如果没有结果（还在加载），从预备调用里拿
        const names = sysReturns.length > 0
          ? sysReturns.map(r => r.name || r.id)
          : sysCalls.map(c => c.name || c.id)

        return {
          namesStr: names.length > 0 ? ` (${names.join(', ')})` : '',
          count: names.length
        }
      }
      const toolInfo = getToolInfo()

      return m("", {
        style: {
          display: "flex",
          alignItems: "center"
        }
      }, [

        m("", {}, [
          m(Avatar, { chat: chats.find(c => c.group !== "user") })
        ]),

        m('', {
          style: {
            display: "flex",
            flexDirection: "column",
            margin: '1rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem 2rem 2rem 0.5rem',
            boxShadow: `0rem 0rem 2rem ${hasError ? getColor("工具组失败边框") + "33" : getColor("工具组成功边框") + "33"}`,
            background: getBlurBg(hasError ? "工具组失败边框" : "工具组成功边框", hasError ? "工具组失败背景" : "工具组成功背景"),
            border: `0.1rem solid ${hasError ? getColor("工具组失败边框") : getColor("工具组成功边框")}33`,
            borderLeft: hasError ? `0.4rem solid ${getColor("工具组失败边框")}` : `0.4rem solid ${getColor("工具组成功边框")}`,
          }
        }, [
          // 标题栏
          m('', {
            style: { cursor: 'pointer', display: 'flex', alignItems: 'center', color: getColor("工具组文字颜色") },
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
            (hasError ? '⚠ ' + trs("聊天/工具/调用失败", { cn: "工具调用失败", en: "Tool Call Failed" }) : (isLoading ? trs("聊天/工具/调用中", { cn: "工具调用中...", en: "Calling Tool..." }) : trs("聊天/工具/调用完成", { cn: "工具调用", en: "Tool Call" }))) + toolInfo.namesStr,
            m('span', { style: { marginLeft: '0.5rem', opacity: 0.7 } },
              `(${toolInfo.count}${trs("聊天/工具/项工具", { cn: "工具", en: "Tools" })} · ${chats.length}${trs("聊天/工具/条消息", { cn: "消息", en: "Msgs" })})${duration ? ` · ${(duration / 1000).toFixed(1)}s` : ''}`
            )
          ]),
          // 未展开时的简略参数展示（平铺胶囊标签）
          (!expanded && chats.some(c => c.ask?.toolCallStage === "prepare" && c.ask?.sysCalls?.length > 0)) ? m('', {
            style: { marginTop: '0.4rem', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', cursor: 'pointer' },
            onclick: () => { expanded = true }
          }, 
            (chats.find(c => c.ask?.toolCallStage === "prepare")?.ask?.sysCalls || []).map(call => {
              let argsObj = {};
              try {
                argsObj = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : (call.arguments || {});
              } catch (e) {}

              // 深度拍平 JSON 树，只提取所有子叶的 values
              const getDeepValues = (obj) => {
                if (typeof obj !== 'object' || obj === null) return [obj];
                let vals = [];
                for (let k in obj) {
                  if (typeof obj[k] === 'object' && obj[k] !== null) {
                    vals = vals.concat(getDeepValues(obj[k]));
                  } else {
                    vals.push(obj[k]);
                  }
                }
                return vals;
              };

              const argValues = getDeepValues(argsObj).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
              if (argValues.length === 0) return null;

              return m('', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' } }, [
                m('span', { style: { fontSize: '1.3rem', color: getColor("工具组文字颜色"), opacity: 0.7 } }, call.name || call.id),
                ...argValues.map(val => {
                  let valStr = String(val).replace(/\n/g, ' ').replace(/\r/g, '');
                  if (valStr.length > 25) {
                    if ((valStr.includes('/') || valStr.includes('\\')) && !valStr.includes('{') && !valStr.includes('<')) {
                      const parts = valStr.split(/[/\\]/).filter(Boolean);
                      if (parts.length > 1) {
                        let basename = parts[parts.length - 1];
                        if (basename.length > 25) {
                          basename = basename.substring(0, 15) + '...' + basename.slice(-7);
                        }
                        let first = parts[0];
                        if (first.length > 10) first = first.substring(0, 10);
                        valStr = first + '/.../' + basename;
                      } else {
                        valStr = valStr.substring(0, 25) + '...';
                      }
                    } else {
                      valStr = valStr.substring(0, 25) + '...';
                    }
                  }
                  return m('span', {
                    style: {
                      fontSize: '1.2rem',
                      padding: '0.3rem 0.8rem',
                      background: 'rgba(128, 128, 128, 0.15)',
                      borderRadius: '1.2rem',
                      border: '1px solid rgba(128, 128, 128, 0.2)',
                      color: getColor("工具组文字颜色"),
                      whiteSpace: 'nowrap',
                      maxWidth: '24rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }
                  }, valStr);
                })
              ]);
            }).filter(Boolean)
          ) : null,

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

      ])
    }
  }
}
