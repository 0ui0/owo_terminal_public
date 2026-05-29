
let data
export default data = {
  async initSocket() {
    return
    this.socket = io()
    this.socket.on("cross", (data) => {
    })
  },
  socket: null,
  options: {
    data: [],
    async pull() {

      try {
        let info = await data.fnCall("cmdOptions", [])
        if (!info.ok) {
          return console.log(info.msg)
        }
        this.data = info.data
        console.log("infod", this.data)

      } catch (err) {
        console.log(err)
        throw err
      }


    },
    get(key) {
      let option = this.data.find(v => v.key == key)
      if (option) {
        return option.value
      } else {
        return void 0
      }
    }
  },
  async fnCall(name, params) {
    try {
      let tmp = await m.request({
        url: `/api/cross`,
        //withCredentials:true,
        method: "post",
        body: {
          name,
          params
        }
      })
      return tmp
    }
    catch (err) {
      throw err
    }
  },
}