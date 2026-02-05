
import gomokuData from "./gomokuData.js"

// 五子棋前端界面 (Closure Version)
export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box }) => {
  // === Private State ===
  let gameState = {
    board: Array(15).fill().map(() => Array(15).fill(0)),
    currentPlayer: 1,
    gameOver: false,
    winner: null
  }
  let dom = null
  const redraw = () => m.redraw()

  // === Logic ===
  const move = async (x, y) => {
    if (gameState.gameOver) return
    const res = await settingData.fnCall("appDispatch", [appId, "move", { x, y }])
    if (res.ok && res.data?.success) {
      if (res.data.gameOver) Notice.launch({ msg: res.data.message })
    } else {
      Notice.launch({ msg: res.data?.message || res.msg || "落子失败" })
    }
  }

  const reset = async () => {
    await settingData.fnCall("appDispatch", [appId, "reset", {}])
  }

  // === Instance Interface ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (msg.action === "getHTML") {
        const html = dom ? dom.innerHTML : ""
        return callback && callback({ ok: true, data: html })
      }
      if (msg.action === "update") {
        gameState = msg.args.gameState
        redraw()
      } else if (msg.action === "reset") {
        gameState = msg.args.gameState
        redraw()
      }
      if (callback) callback({ ok: true })
    }
  }

  // === Init ===
  const init = () => {
    gomokuData.addTool("commonData", commonData)
    gomokuData.registerInstances(appId, instanceInterface)
    if (commonData && commonData.registerApp) commonData.registerApp(appId, gomokuData)
  }

  init()

  // === View ===
  return {
    oninit(vnode) {
      if (vnode.attrs.data?.gameState) {
        gameState = vnode.attrs.data.gameState
      }
    },
    onremove() {
      gomokuData.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      const { board, currentPlayer, gameOver, winner } = gameState

      return m("div", {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          width: "100%", height: "100%", background: "linear-gradient(135deg, #2c3e50, #000000)",
          color: "#fff", fontFamily: "system-ui, sans-serif"
        },
        oncreate: (vn) => { dom = vn.dom }
      }, [
        // Header
        m("div", { style: { marginBottom: "20px", textAlign: "center" } }, [
          m("h2", { style: { margin: "0", color: "#f39c12" } }, "五子棋对战"),
          m("div", { style: { marginTop: "5px", opacity: 0.8 } },
            gameOver ? `游戏结束！玩家 ${winner === 1 ? "黑子" : "白子"} 胜利！` : `当前回合: ${currentPlayer === 1 ? "黑子" : "白子"}`
          )
        ]),
        // Board
        m("div", {
          style: {
            background: "#dcb35c", padding: "10px", borderRadius: "5px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)", border: "2px solid #8e44ad"
          }
        }, [
          m("div", {
            style: { display: "grid", gridTemplateColumns: "repeat(15, 25px)", gridTemplateRows: "repeat(15, 25px)", gap: "1px", background: "#333" }
          }, board.map((row, x) => row.map((cell, y) =>
            m("div.cell", {
              style: {
                width: "25px", height: "25px", background: "#dcb35c", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: (cell === 0 && !gameOver) ? "pointer" : "default", position: "relative"
              },
              onclick: () => move(x, y)
            }, [
              m("div", { style: { position: "absolute", width: "100%", height: "1px", background: "rgba(0,0,0,0.2)" } }),
              m("div", { style: { position: "absolute", width: "1px", height: "100%", background: "rgba(0,0,0,0.2)" } }),
              cell !== 0 ? m("div", {
                style: { width: "20px", height: "20px", borderRadius: "50%", background: cell === 1 ? "#000" : "#fff", boxShadow: "1px 1px 3px rgba(0,0,0,0.3)", zIndex: 1 }
              }) : null
            ])
          )))
        ]),
        // Footer
        m("div", { style: { marginTop: "30px", display: "flex", gap: "15px" } }, [
          m(Box, { isBtn: true, style: { padding: "8px 25px", background: "#e67e22", borderRadius: "20px" }, onclick: () => reset() }, "重新开始")
        ])
      ])
    }
  }
}
