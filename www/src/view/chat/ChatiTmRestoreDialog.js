import Box from "../common/box.js"
import Tag from "../common/tag.js"
import getColor from "../common/getColor.js"
import Notice from "../common/notice.js"
import settingData from "../setting/settingData.js"
import { trs } from "../common/i18n.js"

// 时光机还原弹窗：展示正向 diff 列表（当前相对快照的变化），勾选要撤回的文件
// status 语义（git 原始方向）：A=新增 / D=删除 / M=修改
// 还原 = 撤回这些变化：A→删除该文件，D→恢复该文件，M→覆盖回快照内容
// 入参 attrs：{ diffList, uuid, listId, noticeConfig }（noticeConfig 由 noticeBox 注入）
// 通过 Notice 说明书「动态补丁劫持」在 oninit 接管原生确认/取消按钮
const statusLabel = { A: "新增", D: "删除", M: "修改" }
const statusColor = { A: "green_1", D: "red_1", M: "yellow_1" }
const statusIcon = { A: "＋", D: "－", M: "～" }

export default {
  oninit(vnode) {
    this.attrs = vnode.attrs
    this.selected = new Set(vnode.attrs.diffList.map(item => item.path))

    // 动态补丁劫持：接管原生确认/取消按钮
    const config = vnode.attrs.noticeConfig
    if (config) {
      config.hideBtn = 0
      const originalConfirm = config.confirm
      config.confirm = async (dom, closeFn, tabData, event) => {
        const { uuid, listId } = this.attrs
        const selected = Array.from(this.selected)
        if (selected.length === 0) {
          Notice.launch({ msg: trs("时光机/无勾选", { cn: "请勾选需要撤回的文件", en: "Please select files to revert" }) })
          return true
        }
        const res = await settingData.fnCall("restoreChatFile", [{ uuid, listId, selected }])
        if (res.ok) Notice.launch({ msg: res.msg, type: "success" })
        else Notice.launch({ msg: res.msg, type: "error" })
        if (originalConfirm) await originalConfirm(dom, closeFn, tabData, event)
        else closeFn()
      }
    }
  },
  view() {
    const { diffList } = this.attrs
    const allChecked = diffList.length > 0 && diffList.every(item => this.selected.has(item.path))
    const allCheckedDisabled = diffList.length === 0

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      },
      [
        m(Box,
          {
            isBtn: true,
            color: "gray_3",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              margin: "1rem"
            },
            onclick: () => {
              if (allChecked && !allCheckedDisabled) this.selected.clear()
              else diffList.forEach(item => this.selected.add(item.path))
              m.redraw()
            }
          },
          trs("时光机/全选切换", { cn: allChecked && !allCheckedDisabled ? "全不选" : "全选", en: "Toggle all" })
        ),
        m(Box,
          {
            style: {
              margin: "0 1rem 1rem 1rem",
              padding: "0.5rem 1rem",
              background: getColor('gray_3').back,
              color: getColor('gray_3').front
            }
          },
          trs("时光机/撤回提示", { cn: "以下变化将被撤回（还原到该快照状态）", en: "The following changes will be reverted (restore to this snapshot)" })
        ),
        m("",
          {
            style: {
              margin: "0 1rem 1rem 1rem",
              border: `0.1rem solid ${getColor('gray_4').back}`,
              borderRadius: "0.8rem"
            }
          },
          diffList.length === 0
            ? m(Box, { style: { margin: "0", padding: "1rem", color: getColor('gray_4').front } },
              trs("时光机/无变化", { cn: "该快照与当前工作区没有差异", en: "No difference between this snapshot and the working directory" }))
            : diffList.map(item => {
              const checked = this.selected.has(item.path)
              const isDelete = item.status === "D"
              return m("",
                {
                  key: item.path,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.5rem 0.8rem",
                    borderBottom: `0.1rem solid ${getColor('gray_5').back}`,
                    background: checked ? getColor(statusColor[item.status]).back + "33" : "transparent"
                  }
                },
                [
                  m("input", {
                    type: "checkbox",
                    checked,
                    onclick: (e) => {
                      if (e.target.checked) this.selected.add(item.path)
                      else this.selected.delete(item.path)
                      m.redraw()
                    }
                  }),
                  m(Tag, {
                    styleExt: {
                      background: getColor(statusColor[item.status]).back,
                      color: getColor(statusColor[item.status]).front,
                      flexShrink: 0
                    }
                  }, `${statusIcon[item.status]} ${statusLabel[item.status]}`),
                  m("span",
                    {
                      style: {
                        flex: 1,
                        wordBreak: "break-all",
                        color: isDelete ? getColor('gray_4').front : getColor('gray_1').front,
                        textDecoration: isDelete ? "line-through" : "none"
                      }
                    },
                    item.path
                  ),
                  m(Tag,
                    {
                      isBtn: true,
                      styleExt: { flexShrink: 0 },
                      ext: {
                        onclick: async () => {
                          await settingData.fnCall("appLaunch", ["editor", { data: { isDiff: true, isCheckoutMode: false, filePath: item.path, originalContent: item.originalContent, proposedContent: item.proposedContent } }])
                        }
                      }
                    },
                    trs("时光机/查看", { cn: "查看", en: "View" })
                  )
                ]
              )
            })
        )
      ]
    )
  }
}
