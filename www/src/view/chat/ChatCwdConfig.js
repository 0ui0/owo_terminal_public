import { trs } from "../common/i18n.js"
import getColor from "../common/getColor.js"
import Notice from "../common/notice.js"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import chatData from "./chatData.js"
import settingData from "../setting/settingData.js"

// 工作目录配置组件（作为 Notice 弹窗内容）
// 数据结构：对象数组 [{ path }]，0 号是主工作目录，其余为辅助工作目录；按会话（chatList）隔离
// UI：主工作目录为独立配置卡片（编辑 0 号），辅助工作目录为列表可添加多个
export default () => {
  const save = async (listId, list) => {
    await settingData.fnCall("updateListConfig", [listId, { workDirs: list }])
    chatData.initSessionState(listId, { workDirs: list })
    m.redraw()
  }

  // 配置主工作目录（编辑 0 号数据，需检查 Git 并初始化时光机）
  const setMainCwd = async (listId, cwdList) => {
    try {
      const res = await settingData.fnCall("appOpenDialog", [{
        title: trs("工作目录/选择主目录", { cn: "选择主工作目录", en: "Select Main Working Directory" }),
        properties: ["openDirectory"]
      }])
      if (!res.ok || !res.filePath) return

      if (cwdList.some(item => item.path === res.filePath)) {
        Notice.launch({ msg: trs("工作目录/已存在", { cn: "该目录已在列表中喵！", en: "This directory is already in the list!" }) })
        return
      }

      const status = await settingData.fnCall("tmGetProjectStatus", [res.filePath])
      const gitOk = (typeof status.gitOk === "object") ? status.gitOk.ok : status.gitOk
      if (!gitOk) {
        Notice.launch({
          tip: trs("工作目录/Git异常", { cn: "Git 环境异常", en: "Git Error" }),
          type: "error",
          msg: (typeof status.gitOk === "object" ? status.gitOk.msg : status.msg) || "未检测到 Git 客户端，请先安装 Git 喵！"
        })
        return
      }

      // 替换主目录（type=main 置于 0 号，order=0），保留后续辅助目录
      const next = [{ path: res.filePath, type: "main", order: 0 }, ...cwdList.filter(item => item.type !== "main")]

      if (status.isReady) {
        await save(listId, next)
        Notice.launch({ msg: trs("工作目录/就绪", { cn: "已检测到备份目录，主工作目录已就绪喵！🕒", en: "Backup detected, main working directory ready!" }) })
        chatData.updateTmStatus(listId)
      } else {
        Notice.launch({
          tip: trs("工作目录/初始化时光机", { cn: "初始化时光机", en: "Init Time Machine" }),
          msg: trs("工作目录/初始化提示", { cn: "您选定了主工作目录，是否立即为该目录初始化时光机（.owoTimeMachine）？为了数据安全，AI 强烈建议您开启备份喵！", en: "Set as main working directory and init Time Machine (.owoTimeMachine)? Strongly recommended!" }),
          async confirm() {
            await save(listId, next)
            const initRes = await settingData.fnCall("tmInit", [res.filePath])
            Notice.launch({ msg: initRes.msg })
            chatData.updateTmStatus(listId)
            return undefined
          },
          cancel() {
            Notice.launch({ msg: trs("工作目录/中止", { cn: "安全中止：未开启备份前禁止选定主工作目录喵。", en: "Aborted: main directory requires backup." }) })
            return undefined
          }
        })
      }
    } catch (err) {
      console.error("[ChatCwdConfig] setMainCwd failed:", err)
      Notice.launch({ msg: trs("工作目录/错误", { cn: "配置主工作目录失败: " + err.message, en: "Set main working directory failed: " + err.message }) })
    }
  }

  // 添加辅助工作目录（追加到数组尾部，直接添加）
  const addAuxCwd = async (listId, cwdList) => {
    try {
      const res = await settingData.fnCall("appOpenDialog", [{
        title: trs("工作目录/选择辅助", { cn: "选择辅助工作目录", en: "Select Auxiliary Working Directory" }),
        properties: ["openDirectory"]
      }])
      if (!res.ok || !res.filePath) return

      if (cwdList.some(item => item.path === res.filePath)) {
        Notice.launch({ msg: trs("工作目录/已存在", { cn: "该目录已在列表中喵！", en: "This directory is already in the list!" }) })
        return
      }

      // 新增辅助目录：order 取当前最大 +1
      const maxOrder = cwdList.reduce((max, item) => Math.max(max, item.order || 0), 0)
      await save(listId, [...cwdList, { path: res.filePath, type: "", order: maxOrder + 1 }])
      Notice.launch({ msg: trs("工作目录/辅助已加", { cn: "已添加辅助工作目录喵！", en: "Auxiliary working directory added!" }) })
    } catch (err) {
      console.error("[ChatCwdConfig] addAuxCwd failed:", err)
      Notice.launch({ msg: trs("工作目录/错误", { cn: "添加辅助工作目录失败: " + err.message, en: "Add auxiliary working directory failed: " + err.message }) })
    }
  }

  // 删除辅助工作目录（按元素引用）
  const removeAuxCwd = async (listId, cwdList, auxItem) => {
    await save(listId, cwdList.filter(item => item !== auxItem))
    m.redraw()
  }

  // 移动辅助工作目录排序（交换 order）
  const moveAuxCwd = async (listId, cwdList, auxItem, dir) => {
    const sorted = [...cwdList].sort((a, b) => (a.order || 0) - (b.order || 0))
    const auxList = sorted.filter(item => item.type !== "main")
    const index = auxList.findIndex(item => item === auxItem)
    const target = auxList[index + dir]
    if (!target) return
    ;[auxItem.order, target.order] = [target.order, auxItem.order]
    await save(listId, cwdList)
    m.redraw()
  }

  return {
    view({ attrs }) {
      const { listId } = attrs
      const cwdList = chatData.getSessionState(listId).workDirs || []
      const sortedCwd = [...cwdList].sort((a, b) => (a.order || 0) - (b.order || 0))
      const mainCwd = sortedCwd.find(item => item.type === "main")
      const auxList = sortedCwd.filter(item => item.type !== "main")

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
            margin: "1rem 1.5rem 1.5rem 1.5rem",
            maxHeight: "60vh",
            overflowY: "auto"
          }
        },
        [
          // ===== 主工作目录：独立配置卡片 =====
          m(Box,
            {
              isBtn: true,
              color: "main",
              style: {
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.6rem",
                borderRadius: "0.8rem",
                margin: "0",
                padding: "0.8rem 1rem"
              },
              onclick: () => setMainCwd(listId, cwdList)
            },
            [
              m("",
                {
                  style: {
                    flexShrink: 0
                  }
                },
                trs("工作目录/主标签", { cn: "主工作目录", en: "Main Working Directory" })
              ),
              m("",
                {
                  style: {
                    wordBreak: "break-word"
                  }
                },
                mainCwd?.path || trs("工作目录/未设置", { cn: "未设置（点击配置）", en: "Not set (click to configure)" })
              )
            ]
          ),

          // ===== 辅助工作目录：列表 =====
          m("",
            {
              style: {
                color: getColor('gray_4').front
              }
            },
            trs("工作目录/辅助标题", { cn: "辅助工作目录", en: "Auxiliary Working Directories" })
          ),

          auxList.length === 0
            ? m(Box,
              {
                style: {
                  textAlign: "center",
                  color: getColor('gray_4').front,
                  borderRadius: "0.8rem",
                  margin: "0"
                }
              },
              trs("工作目录/辅助空", { cn: "暂无辅助工作目录，点击下方按钮添加喵", en: "No auxiliary directories yet. Click below to add." })
            )
            : auxList.map((item, index) => m(Box,
              {
                key: index,
                style: {
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.6rem",
                  background: getColor('gray_3').back,
                  borderRadius: "0.8rem",
                  margin: "0"
                }
              },
              [
                m("",
                  {
                    style: {
                      flex: "1 1 100%",
                      wordBreak: "break-word",
                      color: getColor('gray_1').front
                    }
                  },
                  item.path
                ),
                m(Tag,
                  {
                    styleExt: {
                      background: "transparent",
                      cursor: "pointer",
                      flexShrink: 0,
                      marginLeft: "auto"
                    },
                    ext: {
                      onclick: () => moveAuxCwd(listId, cwdList, item, -1)
                    }
                  },
                  m.trust(window.iconPark.getIcon("Up", { size: "1.1rem", fill: getColor('gray_4').front }))
                ),
                m(Tag,
                  {
                    styleExt: {
                      background: "transparent",
                      cursor: "pointer",
                      flexShrink: 0
                    },
                    ext: {
                      onclick: () => moveAuxCwd(listId, cwdList, item, 1)
                    }
                  },
                  m.trust(window.iconPark.getIcon("Down", { size: "1.1rem", fill: getColor('gray_4').front }))
                ),
                m(Tag,
                  {
                    styleExt: {
                      color: "#ff6b6b",
                      background: "rgba(255,107,107,0.15)",
                      cursor: "pointer",
                      flexShrink: 0
                    },
                    ext: {
                      onclick: () => removeAuxCwd(listId, cwdList, item)
                    }
                  },
                  trs("工作目录/删除", { cn: "删除", en: "Remove" })
                )
              ]
            )),

          m(Box,
            {
              isBtn: true,
              color: "gray_3",
              style: {
                textAlign: "center",
                borderRadius: "0.8rem",
                margin: "0",
                padding: "0.6rem"
              },
              onclick: () => addAuxCwd(listId, cwdList)
            },
            trs("工作目录/添加辅助", { cn: "+ 添加辅助工作目录", en: "+ Add Auxiliary Working Directory" })
          )
        ]
      )
    }
  }
}
