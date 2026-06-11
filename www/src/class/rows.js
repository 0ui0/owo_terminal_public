import Row from "./row.js"
import { v4 as uuidv4 } from "uuid"
import m from "mithril"

const apiHost = window.apiHost || ""

export default class Rows {
  constructor(obj) {
    if (!obj || typeof obj !== "object") throw new Error("Rows expects config object")
    this.apiName = obj.apiName
    this.idName = obj.idName
    this.click = obj.click !== undefined ? obj.click : 0
    this.limit = obj.limit !== undefined ? obj.limit : 16
    this.order = obj.order !== undefined ? obj.order : "desc"
    this.params = obj.params !== undefined ? obj.params : {}
    this.rowsTitle = obj.rowsTitle

    if (!this.apiName) throw new Error("apiName is required")
    if (!this.idName) throw new Error("idName is required")

    this.data = []
    this.pages = []
    this.allCount = null
    this.presentPage = 0
    this.Row = Row

    if (this.rowsTitle) {
      const storageCacheRandom = localStorage.getItem(`cacheRandom/${this.rowsTitle}`)
      if (storageCacheRandom) {
        this.cacheRandom = storageCacheRandom
      } else {
        this.cacheRandom = uuidv4()
        localStorage.setItem(`cacheRandom/${this.rowsTitle}`, this.cacheRandom)
      }
    } else {
      this.cacheRandom = uuidv4()
    }
  }

  async init() {
    try {
      await this.initAllCount()
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  clickFn(num) {
    if (num !== undefined) {
      this.click = num
    } else {
      this.click++
    }
  }

  async initAllCount() {
    try {
      const pageData = await this.pullPage(this.presentPage)
      this.pages[this.presentPage] = pageData
      this.data = [...pageData]
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  clickAll() {
    if (this.allCount === null) {
      console.warn("clickAll: allCount is not initialized, fallback to 100")
      this.click = Math.ceil(100 / this.limit)
    } else {
      this.click = Math.ceil(this.allCount / this.limit)
    }
  }

  isToEnd() {
    if (this.allCount === null) return false
    return this.data.length >= this.allCount
  }

  updateCacheRandom() {
    this.cacheRandom = uuidv4()
    if (this.rowsTitle) {
      localStorage.setItem(`cacheRandom/${this.rowsTitle}`, this.cacheRandom)
    }
  }

  async pullPage(pageIndex, config) {
    try {
      if (config?.updateCacheRandom) {
        this.updateCacheRandom()
      }
      const tmp = await m.request({
        method: "GET",
        url: `${apiHost}/api/${this.apiName}/get`,
        params: {
          offset: pageIndex * this.limit,
          limit: this.limit,
          order: this.order,
          cacheRandom: this.cacheRandom,
          ...this.params
        }
      })
      if (!tmp.ok) {
        console.error(tmp.msg)
        return []
      }
      if (typeof tmp.allCount !== "number") {
        throw new Error("allCount missing or invalid")
      }
      this.allCount = tmp.allCount

      const mapped = (tmp.data || []).map(item => {
        return new this.Row(item, {
          apiName: this.apiName,
          idName: this.idName,
          parent: this
        })
      })
      return mapped
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  getPage() {
    return this.pages[this.presentPage] || []
  }

  async pull(page, config) {
    try {
      if (page !== undefined) {
        this.presentPage = page
        this.pages[this.presentPage] = await this.pullPage(this.presentPage, config)
        return true
      }

      this.pages[this.presentPage] = await this.pullPage(this.presentPage, config)

      const dataTmp = []
      if (this.click <= 0) {
        const pageData = await this.pullPage(0, config)
        this.pages[0] = pageData
        dataTmp.push(...pageData)
      } else {
        for (let once = 0; once <= this.click; once++) {
          const pageData = await this.pullPage(once, config)
          this.pages[once] = pageData
          dataTmp.push(...pageData)
        }
      }
      this.data = dataTmp
      return true
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  async pullPageAndJoinData() {
    try {
      const tmp = await this.pullPage(this.click)
      this.data = [...this.data, ...tmp]
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  async push(data) {
    try {
      this.updateCacheRandom()
      const newRow = new this.Row(data, {
        apiName: this.apiName,
        idName: this.idName,
        parent: this
      })
      const tmp = await newRow.push()
      if (!tmp) return false
      await this.pull()
      return newRow
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  getNumberOfPages() {
    if (this.allCount === null) return 1
    return Math.ceil(this.allCount / this.limit)
  }

  async pageTurnToEnd() {
    try {
      await this.pull(this.getNumberOfPages() - 1)
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  async pageTurnToStart() {
    try {
      await this.pull(0)
    } catch (err) {
      console.error(err)
      throw err
    }
  }
}
