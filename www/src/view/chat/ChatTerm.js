
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import settingData from "../setting/settingData"


import data from "./chatData"
import ioSocket from '../../comData/ioSocket.js'

export default () => {
  return {
    view({ attrs }) {
      let chat = attrs.chat
      return m("",{
        style:{
          ...attrs.style
        },
        oncreate: ({ dom }) => {
          console.log("term create")
          let term = new Terminal({
            //rows: 10,
            //cols: 70,
            fontFamily: settingData.options?.get("global_terminalFontFamily")
              ? settingData.options.get("global_terminalFontFamily")
              :'Fira Code, Menlo, Monaco, "Courier New", monospace',
            fontSize:14,
            lineHeight:1.2,
            convertEol: true,
            theme: {
              background: "#3a3535",//"#332f2c",
              foreground: "#999999",
              cursor: '#a75e5e',
            }
          })
          term.onData(async (chunk) => {
            ioSocket.socket.emit("chat", {
              tid: chat.tid,
              chunk: chunk
            })

          })

          const fitAddon = new FitAddon();
          term.loadAddon(fitAddon);

          term.open(dom)
          
          fitAddon.fit()

          /* // 创建 ResizeObserver 监听父容器尺寸变化
          const resizeObserver = new ResizeObserver(() => {
            // 确保终端仍然存在
            if (term && fitAddon) {
              setTimeout(()=>{
                fitAddon.fit()
              },100)
              
            }
          })
          
          // 开始观察父元素
          resizeObserver.observe(dom) */

          term.clear()
          term.write(chat.content)

          term.fitAddon = fitAddon

          data.xTerms[chat.tid] ??= []
          if(data.xTerms[chat.tid] && (data.xTerms[chat.tid].indexOf(term) === -1)){
            data.xTerms[chat.tid].push(term)
          }

        }
      })
    }
  }
}