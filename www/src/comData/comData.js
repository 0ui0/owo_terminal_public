import ioSocket from "./ioSocket"
import jsonpatch from "fast-json-patch"
import _ from "lodash"

const { compare } = jsonpatch

export default {
  data: null,
  last: null,
  isSyncing: false,
  hasPendingChange: false,
  async init() {
    let { default: DynamicData } = await import(`${window.location.origin}/api/dynamic?time=` + Date.now())
    this.data = new DynamicData({}, {
      beforeEditFn: async (data, self) => {
        try {
          await this.pullData()
        }
        catch (err) {
          throw err
        }
      }
    })

    this.last = _.cloneDeep(this.data.get() || {})

    this.data.addObserver("dataSync", () => {
      return this.sync()
    })
  },
  async pullData() {
    try {
      let tmp = await m.request({
        url: `/api/comData/get`
      })
      this.last = _.cloneDeep(tmp.data)
      return this.data.data = tmp.data
    }
    catch (err) {
      throw err
    }
  },
  sync() {
    if (this.isSyncing) {
      this.hasPendingChange = true
      return Promise.resolve({ ok: true, msg: "排队中" })
    }
    this.isSyncing = true
    this.hasPendingChange = false

    return (async () => {
      try {
        const data = this.data.get()
        const patches = compare(this.last, data)
        if (patches.length === 0) {
          return { ok: true }
        }

        const payload = { patches, fromVersion: this.last.version, toVersion: data.version }

        const msg = await new Promise((resPromise) => {
          ioSocket.socket.emit("comData", payload, (msg) => resPromise(msg))
        })

        console.log("src/comData/dataSync", msg)
        if (msg && msg.ok) {
          this.last = _.cloneDeep(data)
        } else {
          try {
            await this.pullData()
          } catch (err) {
            console.error("同步数据失步且拉取失败:", err)
          }
        }
        return msg
      } catch (err) {
        console.error("sync 错误:", err)
        return { ok: false, msg: err.message }
      } finally {
        this.isSyncing = false
        if (this.hasPendingChange) {
          this.sync()
        }
      }
    })()
  }
}