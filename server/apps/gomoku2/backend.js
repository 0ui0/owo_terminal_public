import gomoku2Data from "./gomoku2Data.js"
import ioServer from "../../ioServer/ioServer.js"
import { socketOnChat } from "../../ioServer/ioApis/chat/ioApi_chat.js"
import idTool from "../../tools/idTool.js"
import chats from "../../ioServer/ioApis/chat/chats.js"
import comData from "../../comData/comData.js"
import aiBasic from "../../tools/aiAsk/basic.js"
import subAgents from "../../tools/aiAsk/subAgents.js"
import options from "../../config/options.js"

export default {
  async init(app, appManager) {
    // 获取启动时传入的初始状态（如果有）
    const initialState = app.data.gameState || {}
    
    // 初始化游戏状态，纯净版：不需要区分模式
    app.data.gameState = {
      appId: app.id,
      board: Array(15).fill().map(() => Array(15).fill(0)), // 0=空, 1=黑, 2=白
      currentPlayer: 1,
      gameOver: false,
      winner: null,
      history: [], // 落子历史记录
      thinking: false
    }
    console.log(`[Gomoku2 Backend] App ${app.id} initialized.`)
  },

  async dispatch({ app, action, args, appManager, io }) {
    const gameState = app.data.gameState

    switch (action) {
      case "move": {
        const { x, y } = args
        console.log(`[Gomoku2 Backend] move action received for app ${app.id}:`, { x, y })
        const result = this.makeMove(gameState, x, y)
        if (result.success) {
          // 添加历史记录
          gameState.history.push({ x, y, player: result.player })
          
          // 通知前端
          console.log(`[Gomoku2 Backend] Emitting update to app ${app.id}`)
          io.emit("app:dispatch", {
            appId: app.id,
            action: "update",
            args: { x, y, player: result.player, gameState }
          })
          
          // 无条件向数据层 Resolve 状态 (兼容旧的或少部分阻塞调用的场景)
          if (!gameState.gameOver) {
            gomoku2Data.resolveUpdate(app.id, {
              event: "move",
              x, y,
              player: result.player,
              boardStr: this.getBoardStr(gameState.board),
              gameOver: gameState.gameOver,
              winner: gameState.winner
            })
          }
        }
        return result
      }
      case "commitMove": {
        if (gameState.gameOver) return { success: false, message: '游戏已结束' }
        const lastMove = gameState.history[gameState.history.length - 1]
        const boardStr = this.getBoardStr(gameState.board)
        
        // 唤醒大模型
        const targetListId = comData.data.get().targetChatListId || 0
        const sysMsg = `[appid:${app.id}] 该你了。\n我在 (${lastMove.x}, ${lastMove.y}) 落子。\n当前局势（我执黑X，你执白O）：\n${boardStr}\n请直接根据局势调用 aiGomokuMove 落子反击，无需调用工具查看局势。`
        
        socketOnChat({
           inputText: sysMsg,
           name: "系统",
           group: "user",
           sendMode: "agent",
           call: null,
           isSystemCall: true,
           targetChatListId: targetListId
        }).catch(err => {
           console.error("五子棋后台唤醒 AI 失败:", err)
        })
        
        return { success: true }
      }

      case "getBoard": {
        return {
          success: true,
          boardStr: this.getBoardStr(gameState.board),
          currentPlayer: gameState.currentPlayer,
          gameOver: gameState.gameOver,
          winner: gameState.winner
        }
      }

      case "undo": {
        const result = this.undoMove(gameState)
        if (result.success) {
          io.emit("app:dispatch", { appId: app.id, action: "update", args: { gameState } })
        }
        return result
      }

      case "reset": {
        app.data.gameState = {
          appId: app.id,
          board: Array(15).fill().map(() => Array(15).fill(0)),
          currentPlayer: 1,
          gameOver: false,
          winner: null,
          history: [],
          thinking: false
        }
        io.emit("app:dispatch", { appId: app.id, action: "reset", args: { gameState: app.data.gameState } })
        return { success: true }
      }

      case "getState":
        return { success: true, gameState }

      default:
        return { success: false, message: "未知操作" }
    }
  },

  // 辅助方法：获取棋盘字符串表示，方便 AI 阅读
  getBoardStr(board) {
    let str = "   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4\n"
    for (let r = 0; r < 15; r++) {
      let line = (r % 10).toString() + " "
      for (let c = 0; c < 15; c++) {
        const cell = board[r][c]
        if (cell === 0) line += " ."
        else if (cell === 1) line += " X" // 黑子
        else if (cell === 2) line += " O" // 白子
      }
      str += line + "\n"
    }
    return str
  },

  // 检查是否五子连珠
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

  // 处理落子
  makeMove(gameState, x, y) {
    if (gameState.gameOver || gameState.thinking || gameState.board[x][y] !== 0) {
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
  },

  // 悔棋
  undoMove(gameState) {
    if (gameState.history.length === 0) {
      return { success: false, message: '没有可以悔棋的步骤' }
    }
    
    // 悔一步
    const lastMove = gameState.history.pop()
    gameState.board[lastMove.x][lastMove.y] = 0
    gameState.currentPlayer = lastMove.player
    
    gameState.gameOver = false
    gameState.winner = null
    
    return { success: true, message: '悔棋成功' }
  }
}
