import Box from "../common/box"
import Tag from "../common/tag"
import Notice from "../common/notice"

export default () => {
  let Url = new Box()
  let src = "about:blank"
  return {
    view() {
      return m("", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }
      }, [
        //controls
        m("form", {
          style: {
            display: "flex",
            width: "100%"
          },

          onsubmit(e) {
            e.preventDefault()
            if (!Url.data.value.match(/^http/g)) {
              Url.data.value = "http://" + Url.data.value
            }
            src = Url.data.value
          },
        
            
        }, [
          m(Url, {
            style: {
              flex: 1,
              border:"0.1rem solid #755d5c",
              background:"#4a443f99"
            },
            tagName: "input[type=text]"
          }),
          m(Box, {
            tagName:"submit",
            isBtn:true,
          }, "前往")
        ]),

        //webview
        m("", {
          style: {
            width: "90rem",
            height: "55rem",
          }
        }, [
          m("webview", {
            src: src,
            style: {
              width: "100%",
              height: "100%"
            },
            oncreate({ dom }) {
              dom.addEventListener("dom-ready", () => {
                /* dom.openDevTools({
                  mode:"undocked"
                }) */

              })

              const webview = document.querySelector('webview');

              // 监听重定向事件
              dom.addEventListener('did-redirect-navigation', (event) => {
                Url.data.value = event.url
              });

            }
          })

        ])
      ])
    }
  }
}