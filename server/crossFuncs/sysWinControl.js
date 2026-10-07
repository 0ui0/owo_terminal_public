export default {
  name: "sysWinControl",
  func: async (action, winId) => {
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
        const { BrowserWindow } = await import("electron")
        const wins = BrowserWindow.getAllWindows()
        
        const winList = wins.map(w => ({ id: w.id, winId: w.winId, isMinimized: w.isMinimized(), isFocused: w.isFocused() }))

        let targetWin = null
        if (winId !== undefined && winId !== null && winId !== "") {
          targetWin = wins.find(w => w.winId === String(winId))
          if (!targetWin) {
            console.error(`[sysWinControl] 拒绝操作：未找到 winId="${winId}" 的窗口，系统当前所有窗口:`, JSON.stringify(winList))
            return {
              ok: false,
              msg: `未找到指定 winId 为 ${winId} 的窗口，操作已拒绝`,
              allWins: winList
            }
          }
        } else {
          // 未传 sign 时：优先获取当前正在操作的焦点窗口
          targetWin = BrowserWindow.getFocusedWindow()
          // 仅当全系统仅有 1 个窗口时，明确对准该唯一窗口；存在多窗口且无焦点时严禁盲目兜底，杜绝误伤
          if (!targetWin && wins.length === 1) {
            targetWin = wins[0]
          }
          if (!targetWin) {
            return {
              ok: false,
              msg: "当前未检测到活跃的焦点窗口，操作已拒绝"
            }
          }
        }

        if (action === "minimize") {
          targetWin.minimize()
        } else if (action === "maximize") {
          if (targetWin.isMaximized()) {
            targetWin.unmaximize()
          } else {
            targetWin.maximize()
          }
        } else if (action === "close") {
          targetWin.close()
        } else if (action === "focus") {
          if (targetWin.isMinimized()) targetWin.restore()
          targetWin.show()
          targetWin.focus()
        } else if (action === "devtools") {
          targetWin.webContents.openDevTools({ mode: "detach" })
        }
      }
      return {
        ok: true,
        msg: "窗口操作已下发"
      }
    } catch (err) {
      console.log(err)
      return {
        ok: false,
        msg: "执行出错：" + (err.message || String(err))
      }
    }
  }
}
