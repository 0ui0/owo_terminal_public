export default {
  name: "sysWinControl",
  func: async (action) => {
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
        const { BrowserWindow } = await import("electron")
        const wins = BrowserWindow.getAllWindows()
        if (wins.length > 0) {
          const win = wins[0]
          if (action === "minimize") {
            win.minimize()
          } else if (action === "maximize") {
            console.log("[sysWinControl] maximize action triggered. isMaximized:", win.isMaximized())
            if (win.isMaximized()) {
              console.log("[sysWinControl] Calling unmaximize()")
              win.unmaximize()
            } else {
              console.log("[sysWinControl] Calling maximize()")
              win.maximize()
            }
          } else if (action === "close") {
            win.close()
          }
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
