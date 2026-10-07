import net from "net"

/**
 * 端口智能探测工具
 * 仿照 Hapi.js 机制：传入目标端口，若未占用直接返回；若已被占用，则监听 0 端口由系统分配新端口返回
 */
export default {
  getAvailablePort(port = 9501, host = "0.0.0.0") {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.unref()

      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" || err.code === "EACCES") {
          console.log(`[portTool] 端口 ${port} 已被占用，正在分配动态空闲端口...`)
          const fallback = net.createServer()
          fallback.unref()
          fallback.once("error", reject)
          fallback.listen(0, host, () => {
            const { port: freePort } = fallback.address()
            fallback.close(() => {
              console.log(`[portTool] 成功获取可用端口: ${freePort}`)
              resolve(freePort)
            })
          })
          return
        }
        reject(err)
      })

      server.listen(port, host, () => {
        const { port: actualPort } = server.address()
        server.close(() => resolve(actualPort))
      })
    })
  }
}
