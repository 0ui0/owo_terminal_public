// 五子棋后端逻辑 (Standardized)

export default {
  async init(app, appManager) {
    // 初始化或恢复游戏状态
    app.data.gameState = app.data.gameState || {
      board: Array(15).fill().map(() => Array(15).fill(0)), // 15x15 的棋盘，0 表示空，1 表示黑子，2 表示白子
      currentPlayer: 1, // 当前玩家，1 为黑子，2 为白子
      gameOver: false,
      winner: null
    }
    console.log(`[Gomoku Backend] App ${app.id} initialized.`)
  },

  async dispatch({ app, action, args, appManager, io }) {
    const gameState = app.data.gameState

    switch (action) {
      case "move":
        const { x, y } = args
        const result = this.makeMove(gameState, x, y)
        if (result.success) {
          // 通知前端落子
          io.emit("app:dispatch", {
            appId: app.id,
            action: "update",
            args: { x, y, player: result.player, gameState }
          })
        }
        return result

      case "reset":
        app.data.gameState = {
          board: Array(15).fill().map(() => Array(15).fill(0)),
          currentPlayer: 1,
          gameOver: false,
          winner: null
        }
        io.emit("app:dispatch", { appId: app.id, action: "reset", args: { gameState: app.data.gameState } })
        return { success: true }

      case "getState":
        return { success: true, gameState }

      default:
        return { success: false, message: "未知操作" }
    }
  },

  // 内部逻辑：检查是否五子连珠
  checkWin(board, x, y, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]]
    for (const [dx, dy] of directions) {
      let count = 1
      for (let i = 1; i <= 4; i++) {
        const nx = x + dx * i, ny = y + dy * i
        if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[nx][ny] === player) count++
        else break
      }
      for (let i = 1; i <= 4; i++) {
        const nx = x - dx * i, ny = y - dy * i
        if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[nx][ny] === player) count++
        else break
      }
      if (count >= 5) return true
    }
    return false
  },

  // 内部逻辑：处理落子
  makeMove(gameState, x, y) {
    if (gameState.gameOver || gameState.board[x][y] !== 0) {
      return { success: false, message: '无效的落子位置' }
    }

    const player = gameState.currentPlayer
    gameState.board[x][y] = player

    if (this.checkWin(gameState.board, x, y, player)) {
      gameState.gameOver = true
      gameState.winner = player
      return { success: true, message: `玩家 ${player} 获胜！`, player, gameOver: true }
    }

    gameState.currentPlayer = player === 1 ? 2 : 1
    return { success: true, message: '落子成功', player, gameOver: false }
  }
}