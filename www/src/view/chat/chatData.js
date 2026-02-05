export default {
  inputDom: null,
  inputText: "",
  list: [
    {
      uuid: Date.now(),
      name: "系统",
      content: "欢迎使用",
      group: "system",
      timestamp: Date.now(),
    }
  ],
  topChat: null,
  async pullList() {
    try {
      let tmp = await m.request({
        url: `${window.location.protocol}//${window.location.hostname}:9501/api/comData/get`
      })
      this.list = tmp.data.chatLists?.find(l => l.id === 0)?.data || []
      return this.list
    }
    catch (err) {
      throw err
    }
  },
  xTerms: {},
  preparing: false,
  quoteAppId(appId) {
    const quoteTxt = ` [appid:${appId}] `
    this.inputText += quoteTxt
    m.redraw()
  }
}