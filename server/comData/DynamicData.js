
export default class DynamicData {
  constructor(data, ext = {}) {
    this.data = {
      ...data,
      version: 0
    }
    this.observers = {}
    this.ext = ext
  }

  async edit(fn, ext = {}) {
    try {
      if (typeof fn !== "function") {
        throw new Error("edit的参数必须是函数")
      }
      if (this.ext.beforeEditFn) {
        await this.ext.beforeEditFn(this.data, this)
      }

      await fn(this.data, this)
      this.data.version++

      let returns = {}
      //根据数据状态做一些逻辑
      //....同步数据到后端
      if (ext.observerKeys) {
        for (let i = 0; i < ext.observerKeys.length; i++) {
          let observerKey = ext.observerKeys[i]
          if (this.observers[observerKey]) {
            returns[observerKey] = await this.observers[observerKey](this.data, this)
          }
          else {
            throw new Error("没有找到对应的observerKey")
          }
        }
      }
      else {
        for (let [key, value] of Object.entries(this.observers)) {
          returns[key] = await value(this.data, this)
        }
      }

      if (ext.afterEditFn) {
        await ext.afterEditFn(returns, this.data, this)
      }
    } catch (err) {
      throw err
    }

  }
  get() {
    return this.data
  }
  addObserver(key, fn) {
    this.observers[key] = fn
  }
  removeObserver(key) {
    delete this.observers[key]
  }
  setData(data) {
    this.data = { ...data }
  }

}
