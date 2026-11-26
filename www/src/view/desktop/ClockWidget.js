import m from "/@npm/mithril.js"
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"
import { trs } from "../common/i18n.js"

const getWeekdayText = (dayIndex) => {
  const map = [
    trs("桌面/星期/日", {
      cn: "星期日",
      en: "Sun"
    }),
    trs("桌面/星期/一", {
      cn: "星期一",
      en: "Mon"
    }),
    trs("桌面/星期/二", {
      cn: "星期二",
      en: "Tue"
    }),
    trs("桌面/星期/三", {
      cn: "星期三",
      en: "Wed"
    }),
    trs("桌面/星期/四", {
      cn: "星期四",
      en: "Thu"
    }),
    trs("桌面/星期/五", {
      cn: "星期五",
      en: "Fri"
    }),
    trs("桌面/星期/六", {
      cn: "星期六",
      en: "Sat"
    })
  ]
  return map[dayIndex] || ""
}

const formatNow = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    seconds: pad(now.getSeconds()),
    date: `${now.getMonth() + 1}/${now.getDate()} ${getWeekdayText(now.getDay())}`
  }
}

export default () => {
  let timeDom = null
  let secDom = null
  let dateDom = null
  let timer = null

  // 直接更新局部文本节点，避免每秒触发全局 m.redraw() 影响桌面与输入框
  const syncClockDom = () => {
    const info = formatNow()
    if (timeDom) {
      timeDom.textContent = info.time
    }
    if (secDom) {
      secDom.textContent = `:${info.seconds}`
    }
    if (dateDom) {
      dateDom.textContent = info.date
    }
  }

  return {
    oncreate() {
      syncClockDom()
      timer = setInterval(syncClockDom, 1000)
    },

    onremove() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    view({ attrs }) {
      const w = attrs.w || 2
      const h = attrs.h || 2
      const isWide = w >= 4
      const info = formatNow()
      const textColor = attrs.isTransparent ? getColor("gray_1").front : getColor("gray_4").front

      return m(
        "",
        {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: isWide ? "row" : "column",
            alignItems: isWide ? "center" : "flex-start",
            justifyContent: "space-between",
            overflow: "hidden"
          }
        },
        [
          m(
            "",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: `${getSize(1)}rem`
              }
            },
            [
              m(
                "",
                {
                  style: {
                    display: "flex",
                    alignItems: "baseline",
                    gap: `${getSize(0.5)}rem`
                  }
                },
                [
                  m(
                    "span",
                    {
                      oncreate: ({ dom }) => {
                        timeDom = dom
                      },
                      style: {
                        fontSize: isWide ? `${getSize(10)}rem` : `${getSize(7)}rem`,
                        lineHeight: "1",
                        color: textColor
                      }
                    },
                    info.time
                  ),
                  isWide
                    ? m(
                      "span",
                      {
                        oncreate: ({ dom }) => {
                          secDom = dom
                        },
                        style: {
                          fontSize: `${getSize(5)}rem`,
                          lineHeight: "1",
                          opacity: 0.6,
                          color: textColor
                        }
                      },
                      `:${info.seconds}`
                    )
                    : null
                ]
              ),
              m(
                "span",
                {
                  oncreate: ({ dom }) => {
                    dateDom = dom
                  },
                  style: {
                    fontSize: `${getSize(3)}rem`,
                    lineHeight: `${getSize(4)}rem`,
                    opacity: 0.7,
                    color: textColor
                  }
                },
                info.date
              )
            ]
          ),
          !attrs.isTransparent
            ? m(
              "",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: `${getSize(1)}rem`,
                  opacity: 0.65
                }
              },
              [
                m.trust(window.iconPark.getIcon("Time", {
                  fill: textColor,
                  size: `${getSize(4)}rem`
                })),
                m(
                  "span",
                  {
                    style: {
                      fontSize: `${getSize(3)}rem`,
                      lineHeight: `${getSize(4)}rem`,
                      color: textColor
                    }
                  },
                  `${w}×${h}`
                )
              ]
            )
            : null
        ]
      )
    }
  }
}
