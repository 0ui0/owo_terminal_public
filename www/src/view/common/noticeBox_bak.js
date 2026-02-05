import Box from "./box.js";
import Tag from "./tag.js";
import getColor from "./getColor.js"

export default function () {
  let pointerDown, pointerMove, pointerUp;
  pointerDown = pointerMove = pointerUp = null;

  return {
    onbeforeremove: function ({ dom, attrs }) {
      dom.classList.add("zoomOut");
      attrs.closeLayer();
      m.redraw();
    },
    /*
    new Promise (res,rej)=>
      setTimeout =>
        attrs.closeLayer()
        m.redraw()
      ,500
    */
    view: function ({ attrs }) {
      let page = attrs.upData.page;
      let dataArr = attrs.upData.dataArr;
      let hideBtn = dataArr[page]?.hideBtn || 0;
      let useMinus = dataArr[page]?.useMinus ?? true;

      return m(".animated.pulse", {
        style: {
          maxWidth: Mob ? "95vw" : "95vw",//"55vw",
          maxHeight: Mob ? "85vh" : "95vh",//"75vh",
          background: "#393432",
          borderRadius: "3rem",
          overflow: "hidden",
          border: "0.1rem solid #755d5c",
          display: "flex",
          flexDirection: Mob ? "column-reverse" : "column",
          transition: "background 1s ease",
          boxShadow: "0 0 2rem rgba(0,0,0,0.3)",
          backdropFilter: "blur(10px)",
          "-webkit-backdrop-filter": "blur(10px)"
        }
      }, [
        m(".animated.fadeIn",
          {
            oncreate: function ({ dom }) {
              // 只有在没有绑定过事件的情况下才绑定
              if (!pointerDown) {
                dom.addEventListener("pointerdown", pointerDown = function (e) {
                  let presentData = attrs.upData.dataArr[attrs.upData.page];
                  let mouse0 = {
                    x: e.screenX,
                    y: e.screenY
                  };
                  let rect = e.target.parentNode.parentNode.getBoundingClientRect();

                  rect.x -= presentData.win.x;
                  rect.y -= presentData.win.y;

                  // 只有在没有绑定过事件的情况下才绑定
                  if (!pointerMove) {
                    document.addEventListener("pointermove", pointerMove = function (e) {
                      let mouse1 = {
                        x: e.screenX,
                        y: e.screenY
                      };

                      let mouseDelta = {
                        x: mouse1.x - mouse0.x,
                        y: mouse1.y - mouse0.y
                      };

                      let winPreX = presentData.win.x + mouseDelta.x;
                      let winPreY = presentData.win.y + mouseDelta.y;

                      let o2ToO1 = function (x, y) {
                        return {
                          x: rect.x + x,
                          y: rect.y + y
                        };
                      };

                      let o1ToO2 = function (x, y) {
                        return {
                          x: x - rect.x,
                          y: y - rect.y
                        };
                      };

                      let preO2ToO1 = o2ToO1(winPreX, winPreY);
                      let bodyWidth = document.body.offsetWidth;
                      let bodyHeight = document.body.offsetHeight;

                      // 边界检测
                      if (preO2ToO1.x >= bodyWidth - 100) {
                        winPreX = o1ToO2(bodyWidth - 100, 0).x;
                      }
                      if (preO2ToO1.x <= -rect.width + 100) {
                        winPreX = o1ToO2(-rect.width + 100, 0).x;
                      }

                      if (Mob) {
                        if (preO2ToO1.y >= bodyHeight - rect.height) {
                          winPreY = o1ToO2(0, bodyHeight - rect.height).y;
                        }
                        if (preO2ToO1.y <= -rect.height + 100) {
                          winPreY = o1ToO2(0, -rect.height + 100).y;
                        }
                      } else {
                        if (preO2ToO1.y >= bodyHeight - 100) {
                          winPreY = o1ToO2(0, bodyHeight - 100).y;
                        }
                        if (preO2ToO1.y <= 0) {
                          winPreY = o1ToO2(0, 0).y;
                        }
                      }

                      presentData.win.x = winPreX;
                      presentData.win.y = winPreY;

                      m.redraw();

                      mouse0 = {
                        ...mouse1
                      };
                    }, {
                      passive: true
                    });
                  }

                  // 只有在没有绑定过事件的情况下才绑定
                  if (!pointerUp) {
                    document.addEventListener("pointerup", pointerUp = function (e) {
                      document.removeEventListener("pointermove", pointerMove);
                      pointerMove = null;
                      document.removeEventListener("pointerup", pointerUp);
                      pointerUp = null;
                    }, {
                      passive: true
                    });
                  }
                });
              }
            },
            style: {
              width: "100%",
              touchAction: "none",
              background: "rgba(230,230,230,0.5)",
              display: "flex",
              alignItems: "center",
              background: "#755d5c"
            }
          },
          [
            attrs.upData.dataArr.length > 1 ? m(Box,
              {
                isBtn: true,
                style: {
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0",
                  width: "3rem",
                  height: "3rem",
                  borderRadius: "10rem",
                  color: "white"
                },
                onclick: () => {
                  if (page + 1 <= dataArr.length - 1) {
                    return attrs.upData.page++;
                  }
                }
              },
              [m.trust(iconPark.getIcon("Left"))]) : void 0,
            attrs.upData.dataArr.length > 1 ? m(Box,
              {
                style: {
                  height: "3rem",
                  padding: "0 1rem",
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: "10rem"
                }
              },
              `${attrs.upData.dataArr.length - 1 - attrs.upData.page} / ${attrs.upData.dataArr.length - 1}`) : void 0,
            attrs.upData.dataArr.length > 1 ? m(Box,
              {
                isBtn: true,
                style: {
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0",
                  width: "3rem",
                  height: "3rem",
                  borderRadius: "10rem",
                  color: "white"
                },
                onclick: () => {
                  if (page - 1 >= 0) {
                    return attrs.upData.page--;
                  }
                }
              },
              [m.trust(iconPark.getIcon("Right"))]) : void 0,
            m(Box,
              {
                style: {
                  background: "transparent",
                  fontWeight: "bold",
                  color: "#333",
                  margin: 0,
                  userSelect: "none"
                }
              },
              dataArr[page]?.tip || "提示"),
            m("",
              {
                style: {
                  marginLeft: "auto"
                }
              }),
            //确认
            hideBtn === 0 || hideBtn === 3 ? m(Box,
              {
                isBtn: true,
                style: {
                  background: "#a75e5e",
                  color: "#463838",
                  border: "0.1rem solid #393432",
                  borderRadius: "50%",
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  ...(!(dataArr[page]?.confirmWords) ? {
                    padding: "0",
                    width: "2.5rem",
                    height: "2.5rem",
                    borderRadius: "50%"
                  } : void 0)
                },
                onclick: async (e) => {
                  let link = dataArr[page];
                  let confirm = dataArr[page]?.confirm || function () { };
                  link = dataArr[page];
                  attrs.delete = () => {
                    page = dataArr.indexOf(link); //重新查找自己，防止删除错误
                    if (page !== -1) {
                      return dataArr.splice(page,
                        1);
                    }
                  };
                  if (((await confirm(e,
                    attrs.delete,
                    dataArr[page]))) === void 0) {
                    return attrs.delete();
                  }
                }
              },
              [
                dataArr[page]?.confirmWords ? dataArr[page].confirmWords : m.trust(iconPark.getIcon("Check",
                  {
                    fill: "#463838",
                    size: "12px"
                  }))
              ]) : void 0,
            //取消
            //if hideBtn is 0 or hideBtn is 2
            m(Box,
              {
                isBtn: true,
                style: {
                  background: "#636363",
                  color: "#333",
                  border: "0.1rem solid #393432",
                  borderRadius: "50%",
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  ...(!(dataArr[page]?.cancelWords) ? {
                    padding: "0",
                    width: "2.5rem",
                    height: "2.5rem",
                    borderRadius: "50%"
                  } : void 0)
                },
                onclick: async (e) => {
                  let link = dataArr[page];
                  let cancel = dataArr[page]?.cancel || function () { };
                  link = dataArr[page];
                  attrs.delete = () => {
                    page = dataArr.indexOf(link); //重新查找自己，防止删除错误
                    if (page !== -1) {
                      return dataArr.splice(page,
                        1);
                    }

                    if (attrs.upData.page > dataArr.length - 1) {
                      attrs.upData.page = dataArr.length - 1;
                    }
                    if (attrs.upData.page < 0) {
                      attrs.upData.page = 0;
                    }
                  };
                  if (((await cancel(e,
                    attrs.delete,
                    dataArr[page]))) === void 0) {
                    return attrs.delete();
                  }
                }
              },
              [
                dataArr[page]?.cancelWords ? dataArr[page].cancelWords : m.trust(iconPark.getIcon("Close",
                  {
                    fill: "#333",
                    size: "12px"
                  }))
              ]),
            //最小化
            useMinus ? m(Box,
              {
                isBtn: true,
                style: {
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0",
                  width: "2.5rem",
                  height: "2.5rem",
                  borderRadius: "50%",
                  background: "#6c6379",
                  color: "#333",
                  border: "0.1rem solid #393432",
                },
                onclick: (e) => {
                  return attrs.upData.show = false;
                }
              },
              [
                m.trust(iconPark.getIcon("Minus",
                  {
                    fill: "#333",
                    size: "12px"
                  }))
              ]) : void 0
          ]),
        m("",
          {
            style: {
              display: "flex",
              overflow: "auto",
              position: "relative"
            }
          },
          [
            dataArr.map((dataPage,
              index) => {
              return m(".animated.fadeIn",
                {
                  key: dataPage.sign,
                  /*
                  onbeforeremove:({dom,attrs})->
                    dom.classList.add "zoomOut"
                    new Promise (res,rej)=>
                      setTimeout =>
                        res()
                      ,500
                  */
                  style: {
                    flex: 1,
                    margin: "0.5rem",
                    overflow: "auto",
                    background: "#47464f",//"#332f2c",
                    background: "#5e5653ff",
                    borderRadius: "2rem",
                    display: index !== page ? "none" : void 0
                  }
                },
                [
                  m("",
                    [
                      //组件
                      dataPage.content ? m("", //多包一层防止key失效
                        [
                          m(dataPage.content,
                            {
                              noticeConfig: dataPage,
                              ...dataPage.contentAttrs,
                              delete: () => {
                                index = dataArr.indexOf(dataPage); //因为数组是向前插入的，不能直接使用index
                                return dataArr.splice(index,
                                  1);
                              },
                              closeLayer: attrs.closeLayer
                            })
                        ]) : void 0,
                      //提示
                      dataPage.msg ? m(Box,
                        {
                          style: {
                            background: "transparent",
                            color: "#eee5"
                          }
                        },
                        dataPage.msg) : void 0
                    ])
                ]);
            })
          ])
      ]);
    }
  };
};
