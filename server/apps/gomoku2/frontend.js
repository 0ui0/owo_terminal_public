import gomoku2Data from "./gomoku2Data.js"

// 五子棋2前端界面 - 精致版（悔棋、AI、历史记录）

export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box }) => {
  // === Private State ===
  let gameState = {
    board: Array(15).fill().map(() => Array(15).fill(0)),
    currentPlayer: 1,
    gameOver: false,
    winner: null,
    history: [],
    gameMode: 'pvp',
    aiColor: 2,
    thinking: false
  }
  let dom = null
  const redraw = () => m.redraw()

  // === Logic ===
  const move = async (x, y) => {
    console.log(`[Gomoku2] Attempting move at (${x}, ${y})`, { gameOver: gameState.gameOver, thinking: gameState.thinking })
    if (gameState.gameOver || gameState.thinking) return
    const res = await settingData.fnCall("appDispatch", [appId, "move", { x, y }])
    console.log(`[Gomoku2] Move result:`, res)
    if (!res.ok || !res.data?.success) {
      Notice.launch({ msg: res.data?.message || res.msg || "落子失败" })
    }
  }

  const undo = async () => {
    const res = await settingData.fnCall("appDispatch", [appId, "undo", {}])
    if (!res.ok || !res.data?.success) {
      Notice.launch({ msg: res.data?.message || "悔棋失败" })
    }
  }

  const reset = async () => {
    await settingData.fnCall("appDispatch", [appId, "reset", {}])
  }

  const confirmMove = async () => {
    if (gameState.gameOver || gameState.history.length === 0) return
    const res = await settingData.fnCall("appDispatch", [appId, "commitMove", {}])
    if (!res.ok || !res.data?.success) {
      Notice.launch({ msg: res.data?.message || res.msg || "通知AI失败" })
    }
  }

  // === Instance Interface ===
  const instanceInterface = {
    onDispatch: (msg, callback) => {
      console.log("[Gomoku2 Frontend] onDispatch received:", msg.action, msg.args)
      if (msg.action === "getHTML") {
        const html = dom ? dom.innerHTML : ""
        return callback && callback({ ok: true, data: html })
      }
      if (msg.action === "update") {
        console.log("[Gomoku2 Frontend] Updating gameState:", msg.args.gameState)
        gameState = msg.args.gameState || gameState
        redraw()
      } else if (msg.action === "reset") {
        gameState = msg.args.gameState
        redraw()
      } else if (msg.action === "aiThinking") {
        gameState.thinking = msg.args.thinking
        redraw()
      }
      if (callback) callback({ ok: true })
    }
  }

  // === Init ===
  const init = () => {
    gomoku2Data.addTool("commonData", commonData)
    gomoku2Data.registerInstances(appId, instanceInterface)
    // CRITICAL FIX: Register the instanceInterface, not the shared gomoku2Data object
    if (commonData && commonData.registerApp) commonData.registerApp(appId, instanceInterface)
  }

  init()

  // === Helpers ===
  const getPlayerName = (player) => player === 1 ? "黑子" : "白子"
  const getPlayerIcon = (player) => player === 1 ? "⚫" : "⚪"
  
  const formatHistory = () => {
    return gameState.history.map((h, i) => `${i + 1}. ${getPlayerIcon(h.player)}(${h.x + 1},${h.y + 1})`).join(" → ")
  }

  // === View ===
  return {
    oninit(vnode) {
      if (vnode.attrs.data?.gameState) {
        gameState = vnode.attrs.data.gameState
      }
    },
    onremove() {
      gomoku2Data.unregisterInstances(appId, commonData)
    },
    view(vnode) {
      const { board, currentPlayer, gameOver, winner, history, gameMode } = gameState

      return m("div", {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
          width: "100%", height: "100%", background: "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)",
          color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", padding: "10px", boxSizing: "border-box"
        },
        oncreate: (vn) => { dom = vn.dom }
      }, [
        // Header
        m("div", { style: { textAlign: "center", marginBottom: "5px" } }, [
          m("h1", { style: { margin: "0 0 5px 0", fontSize: "20px", background: "linear-gradient(90deg, #f39c12, #e74c3c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } }, "⭐ 五子棋2"),
          m("div", { style: { fontSize: "12px", opacity: 0.7, marginBottom: "5px" } }, "增强版：悔棋 · AI对战 · 历史记录")
        ]),

        // Game Status
        m("div", { style: { display: "flex", gap: "10px", marginBottom: "5px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" } }, [
          // Status Badge
          m("div", { style: { 
            padding: "4px 10px", borderRadius: "10px", fontSize: "12px", fontWeight: "bold",
            background: gameOver ? (winner === 1 ? "#e74c3c" : "#3498db") : "#27ae60",
            boxShadow: "0 4px 15px rgba(0,0,0,0.3)", minWidth: "100px", textAlign: "center"
          } }, gameOver 
            ? `🏆 ${getPlayerName(winner)} 获胜！`
            : `当前: ${getPlayerIcon(currentPlayer)} ${getPlayerName(currentPlayer)}`
          )
        ]),

        // Board Container
        m("div", {
          style: {
            background: "linear-gradient(145deg, #d4a574, #c49464)", padding: "6px", borderRadius: "6px",
            boxShadow: "0 15px 35px rgba(0,0,0,0.4), inset 0 2px 5px rgba(255,255,255,0.2)",
            border: "3px solid #8b6914", position: "relative"
          }
        }, [
          // Board Grid
          m("div", {
            style: { 
              display: "grid", gridTemplateColumns: "repeat(15, 20px)", gridTemplateRows: "repeat(15, 20px)",
              gap: "0", background: "#d4a574", borderRadius: "4px", position: "relative"
            }
          }, board.flatMap((row, x) => row.map((cell, y) => {
            const isStarPoint = ([3,7,11].includes(x) && [3,7,11].includes(y)) || (x === 7 && y === 7)
            const isLastMove = history.length > 0 && history[history.length - 1].x === x && history[history.length - 1].y === y
            
            return m("div", {
              style: {
                width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: (cell === 0 && !gameOver) ? "pointer" : "default", position: "relative",
                background: "#d4a574"
              },
              onclick: () => move(x, y)
            }, [
              // Grid Lines
              m("div", { style: { position: "absolute", width: "100%", height: "1px", background: "#5c4033", top: "50%", pointerEvents: "none" } }),
              m("div", { style: { position: "absolute", height: "100%", width: "1px", background: "#5c4033", left: "50%", pointerEvents: "none" } }),
              
              // Star Point
              isStarPoint && cell === 0 ? m("div", { 
                style: { position: "absolute", width: "4px", height: "4px", borderRadius: "50%", background: "#5c4033", pointerEvents: "none" } 
              }) : null,

              // Piece
              cell !== 0 ? m("div", {
                style: { 
                  width: "16px", height: "16px", borderRadius: "50%", zIndex: 2,
                  background: cell === 1 
                    ? "radial-gradient(circle at 35% 35%, #444, #000)" 
                    : "radial-gradient(circle at 35% 35%, #fff, #ddd)",
                  boxShadow: cell === 1 
                    ? "2px 2px 4px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(0,0,0,0.3)" 
                    : "2px 2px 4px rgba(0,0,0,0.4), inset -1px -1px 2px rgba(0,0,0,0.1)",
                  border: cell === 2 ? "1px solid #ccc" : "none",
                  transform: isLastMove ? "scale(1.1)" : "scale(1)",
                  transition: "transform 0.2s",
                  pointerEvents: "none"
                }
              }) : null,

              // Last Move Marker
              isLastMove && cell !== 0 ? m("div", {
                style: {
                  position: "absolute", width: "6px", height: "6px", borderRadius: "50%",
                  background: cell === 1 ? "#ff6b6b" : "#e74c3c", zIndex: 3, pointerEvents: "none"
                }
              }) : null
            ])
          })))
        ]),

        // Control Buttons
        m("div", { style: { display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap", justifyContent: "center" } }, [
          m("button", {
            style: {
              padding: "6px 12px", borderRadius: "12px", border: "none", cursor: history.length === 0 || gameOver ? "not-allowed" : "pointer",
              background: history.length === 0 || gameOver ? "#555" : "linear-gradient(135deg, #00b09b, #96c93d)",
              color: "#fff", fontSize: "12px", fontWeight: "bold", boxShadow: history.length === 0 || gameOver ? "none" : "0 4px 15px rgba(0,176,155,0.4)",
              opacity: history.length === 0 || gameOver ? 0.5 : 1, transition: "all 0.3s"
            },
            onclick: confirmMove,
            disabled: history.length === 0 || gameOver
          }, "✅ 发送给AI"),
          
          m("button", {
            style: {
              padding: "6px 12px", borderRadius: "12px", border: "none", cursor: history.length === 0 || gameOver ? "not-allowed" : "pointer",
              background: history.length === 0 || gameOver ? "#555" : "linear-gradient(135deg, #667eea, #764ba2)",
              color: "#fff", fontSize: "12px", fontWeight: "bold", boxShadow: history.length === 0 || gameOver ? "none" : "0 4px 15px rgba(102,126,234,0.4)",
              opacity: history.length === 0 || gameOver ? 0.5 : 1, transition: "all 0.3s"
            },
            onclick: undo,
            disabled: history.length === 0 || gameOver
          }, "↩️ 悔棋"),
          
          m("button", {
            style: {
              padding: "6px 12px", borderRadius: "12px", border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #f093fb, #f5576c)", color: "#fff", fontSize: "12px", fontWeight: "bold",
              boxShadow: "0 4px 15px rgba(240,147,251,0.4)", transition: "all 0.3s"
            },
            onclick: reset
          }, "🔄 重新开始")
        ]),

        // History
        m("div", { style: { 
          marginTop: "6px", padding: "8px 10px", background: "rgba(0,0,0,0.3)", 
          borderRadius: "6px", maxWidth: "500px", width: "100%", boxSizing: "border-box"
        } }, [
          m("div", { style: { fontSize: "12px", opacity: 0.6, marginBottom: "5px" } }, `📜 落子记录 (${history.length}步)`),
          m("div", { 
            style: { 
              fontSize: "13px", lineHeight: "1.6", maxHeight: "60px", overflow: "auto",
              wordBreak: "break-all", fontFamily: "monospace"
            } 
          }, history.length > 0 ? formatHistory() : "暂无落子...")
        ])
      ])
    }
  }
}
