import fs from "fs-extra"
import path from "path"
import comData from "../../comData/comData.js"

// 不能放模块顶层：ES module import 在 app.js 的 process.chdir 之前求值
const getPkgsPath = () => path.resolve(process.cwd(), "../www/public/statics/petPkgs")

// 扫描目录下指定后缀的文件名（不含扩展名）
const scanDir = (dirPath, ext) => {
  try {
    if (!fs.existsSync(dirPath)) return []
    return fs.readdirSync(dirPath)
      .filter(f => !f.startsWith('.') && f.toLowerCase().endsWith(ext))
      .map(f => path.parse(f).name)
  } catch (e) {
    console.error(`[actorAction] Scan error for ${dirPath}:`, e)
    return []
  }
}

export default {
  getPlayFaces() {
    const pkg = comData.data.get()?.defaultPet || "default"
    const dir = path.join(getPkgsPath(), pkg, "pet2")
    const files = scanDir(dir, ".webm")

    if (files.length === 0) {
      return [
        "无表情", "微笑", "闭眼咬牙笑", "尴尬咬牙笑", "傲娇抬头蔑视",
        "闭眼脸红咂嘴", "傲娇躺地上", "地上傲娇站起", "全身通红兴奋地不行了扭动",
        "傲娇手背身后蔑笑", "傲娇坏笑", "闭眼咬牙嘻嘻笑", "咬牙瞪眼脸红",
        "脸色一暗愤怒不爽", "呜呜难过", "呜呜大哭", "带墨镜耍酷"
      ]
    }

    return files
  },

  getFaceActions() {
    const pkg = comData.data.get()?.defaultPet || "default"
    const dir = path.join(getPkgsPath(), pkg, "pet")
    const files = scanDir(dir, ".png")

    if (files.length === 0) {
      return [
        "none", "angry", "chrimas", "chrimasEye", "clenchedTeeth", "clenchedTeethAngry",
        "clenchedTeethEmbarrassed", "cryHappy", "crySad", "grin", "grinEmbarrassed",
        "grinHappy", "nervous", "pout", "poutEmbarrassed", "poutEye", "poutSad", "poutSlacken",
        "sad", "slacken", "slackenMore", "smile", "smileEye", "normal"
      ]
    }

    return files
  }
}