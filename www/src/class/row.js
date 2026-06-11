import m from "mithril"
import { v4 as uuidv4 } from "uuid"

const apiHost = window.apiHost || ""

export default class Row {
  constructor(item, obj) {
    if (!item || typeof item !== "object") throw new Error("Row expects item object")
    if (!obj || typeof obj !== "object") throw new Error("Row expects config object")
    if (!obj.apiName) throw new Error("missing obj.apiName")
    if (!obj.idName) throw new Error("missing obj.idName")
    if (!obj.parent) throw new Error("missing obj.parent")

    Object.defineProperty(this, "_apiName", { value: obj.apiName })
    Object.defineProperty(this, "_idName", { value: obj.idName })
    Object.defineProperty(this, "_parent", { value: obj.parent })
    Object.defineProperty(this, "_cacheRandom", { value: uuidv4(), writable: true })

    for (const [key, value] of Object.entries(item)) {
      Object.defineProperty(this, "__" + key, {
        value: {
          data: [value],
          cursor: 0
        },
        enumerable: false,
        configurable: true
      })

      Object.defineProperty(this, key, {
        get() {
          const self = this["__" + key]
          return self.data[self.cursor]
        },
        set(newVal) {
          const self = this["__" + key]
          if (self.cursor !== self.data.length - 1) {
            self.data.length = self.cursor + 1
          }
          if (self.data.length >= 10) {
            self.data.shift()
          } else {
            self.cursor++
          }
          self.data.push(newVal)
        },
        enumerable: true,
        configurable: true
      })
    }
  }

  undo(property, cursor) {
    const self = this["__" + property]
    if (!self) throw new Error("Row.undo: 找不到要还原的字段名")
    if (cursor !== undefined && !self.data[cursor]) throw new Error("Row.undo: 找不到要还原的索引号")

    if (self.cursor > 0) {
      if (cursor !== undefined) {
        self.cursor = cursor
      } else {
        self.cursor--
      }
    }
  }

  redo(property, cursor) {
    const self = this["__" + property]
    if (!self) throw new Error("Row.redo: 找不到要还原的字段名")
    if (cursor !== undefined && !self.data[cursor]) throw new Error("Row.redo: 找不到要还原的索引号")

    if (self.cursor < self.data.length - 1) {
      if (cursor !== undefined) {
        self.cursor = cursor
      } else {
        self.cursor++
      }
    }
  }

  resetAll() {
    Object.entries(this).forEach(([key]) => {
      if (!key.startsWith("_")) {
        this.undo(key, 0)
      }
    })
  }

  updateCacheRandom() {
    this._cacheRandom = uuidv4()
  }

  async pull(config) {
    try {
      if (config?.updateCacheRandom) {
        this.updateCacheRandom()
      }
      const tmp = await m.request({
        method: "GET",
        url: `${apiHost}/api/${this._apiName}/get/${this[this._idName]}`,
        params: {
          cacheRandom: this._cacheRandom,
          ...(this._parent ? this._parent.params : {})
        }
      })
      if (!tmp.ok) {
        console.error(tmp.msg)
        return false
      }
      if (tmp.data) {
        for (const [key, value] of Object.entries(tmp.data)) {
          this[key] = value
        }
        return tmp.data
      }
      return false
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  async push() {
    try {
      this.updateCacheRandom()
      const bodyObj = { ...this }
      delete bodyObj._parent
      delete bodyObj._metaResponse
      let tmp = null

      if (this[this._idName]) {
        tmp = await m.request({
          method: "POST",
          url: `${apiHost}/api/${this._apiName}/set/${this[this._idName]}`,
          body: bodyObj
        })
        if (!tmp.ok) {
          console.error(tmp.msg)
          await this.pull()
          if (this._parent) {
            if (typeof this._parent.updateCacheRandom === "function") {
              this._parent.updateCacheRandom()
            }
          }
          return false
        }
      } else {
        tmp = await m.request({
          method: "POST",
          url: `${apiHost}/api/${this._apiName}/set`,
          body: bodyObj
        })
        if (!tmp.ok) {
          console.error(tmp.msg)
          return false
        }
        this[this._idName] = tmp[this._idName]
      }
      if (tmp.ok) {
        await this.pull()
        if (this._parent) {
          if (typeof this._parent.updateCacheRandom === "function") {
            this._parent.updateCacheRandom()
          }
        }
      }
      return tmp.data || tmp
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  async del() {
    try {
      const tmp = await m.request({
        method: "POST",
        url: `${apiHost}/api/${this._apiName}/del/${this[this._idName]}`
      })
      if (!tmp.ok) {
        console.error(tmp.msg)
        return false
      }
      if (this._parent) {
        if (typeof this._parent.updateCacheRandom === "function") {
          this._parent.updateCacheRandom()
        }
        await this._parent.pull()
      }
      return tmp
    } catch (err) {
      console.error(err)
      throw err
    }
  }
}
