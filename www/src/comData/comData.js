import ioSocket from "./ioSocket"
export default {
  data: null,
  async init() {
    let { default: DynamicData } = await import(`${window.location.origin}/api/dynamic?time=` + Date.now())
    this.data = new DynamicData({}, {
      beforeEditFn: async (data, self) => {
        try {
          //await this.pullData()
          let tmp = await m.request({
            url: `/api/comData/get`
          })
          self.data = tmp.data
        }
        catch (err) {
          throw err
        }
      }
    })

    this.data.addObserver("dataSync", (data) => {
      return new Promise((res, rej) => {
        ioSocket.socket.emit("comData", data, (msg) => {
          console.log("src/comData/dataSync", msg)
          res(msg)
        })
      })
    })
  },
  async pullData() {
    try {
      let tmp = await m.request({
        url: `/api/comData/get`
      })
      return this.data.data = tmp.data
    }
    catch (err) {
      throw err
    }
  },
}