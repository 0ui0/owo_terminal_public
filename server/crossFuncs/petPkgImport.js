import fs from "fs-extra"
import path from "path"
import AdmZip from "adm-zip"

export default {
  name: "petPkgImport",
  func: async ({ path: zipPath }) => {
    if (!zipPath) return { ok: false, msg: "No path provided" }

    try {
      const zip = new AdmZip(zipPath)
      const zipEntries = zip.getEntries()

      const pkgName = path.basename(zipPath, path.extname(zipPath))
      const targetBase = path.resolve(process.cwd(), "../www/public/statics/petPkgs")
      const targetDir = path.join(targetBase, pkgName)

      // === 1. 结构检查（仅支持根目录或一层子目录包装） ===
      const isValid = (entry) => !entry.isDirectory && !entry.entryName.startsWith("__MACOSX") && !entry.entryName.includes(".DS_Store")

      // 检查指定 base 下 dirName/ 是否包含确切的特定文件
      const checkDirHasExactFile = (base, dirName, fileName) => {
        const fullPath = base + dirName + "/" + fileName
        return zipEntries.some(e => isValid(e) && e.entryName === fullPath)
      }

      let rootRef = ""
      let hasValidStructure = false

      // 情况 A: 根目录下直接有 pet/smile.png 和 pet2/待机状态.webm
      if (checkDirHasExactFile("", "pet", "smile.png") && checkDirHasExactFile("", "pet2", "待机状态.webm")) {
        rootRef = ""
        hasValidStructure = true
      } else {
        // 情况 B: 一级子目录下
        const firstDirEntry = zipEntries.find(e => e.isDirectory && !e.entryName.startsWith("__MACOSX") && e.entryName.split('/').length <= 2)
        if (firstDirEntry) {
          const topDir = firstDirEntry.entryName.split('/')[0] + "/"
          if (checkDirHasExactFile(topDir, "pet", "smile.png") && checkDirHasExactFile(topDir, "pet2", "待机状态.webm")) {
            rootRef = topDir
            hasValidStructure = true
          }
        }
      }

      if (!hasValidStructure) {
        return { ok: false, msg: "导入失败：pet 目录必须有一张 smile.png 且 pet2 目录必须有一张 待机状态.webm" }
      }

      // === 2. 严格纯度校验：一票否决制 ===
      const checkDirPure = (base, dirName, ext) => {
        const prefix = base + dirName + "/"
        const filesInDir = zipEntries.filter(e => isValid(e) && e.entryName.startsWith(prefix))
        return filesInDir.every(e => e.entryName.toLowerCase().endsWith(ext))
      }

      if (!checkDirPure(rootRef, "pet", ".png")) {
        return { ok: false, msg: "导入失败：pet/ 目录下只允许 .png 文件，检测到非法格式" }
      }
      if (!checkDirPure(rootRef, "pet2", ".webm")) {
        return { ok: false, msg: "导入失败：pet2/ 目录下只允许 .webm 文件，检测到非法格式" }
      }

      // === 3. 禁止覆盖 default ===
      if (pkgName === "default") {
        return { ok: false, msg: "导入失败：不允许覆盖默认角色包" }
      }

      await fs.ensureDir(targetDir)

      // === 4. 解压 ===
      for (const entry of zipEntries) {
        const name = entry.entryName
        if (entry.isDirectory || name.startsWith("__MACOSX")) continue

        if (name.startsWith(rootRef)) {
          const relativePath = name.slice(rootRef.length)
          const fullPath = path.join(targetDir, relativePath)

          await fs.ensureDir(path.dirname(fullPath))
          await fs.writeFile(fullPath, entry.getData())
        }
      }

      console.log(`[petPkgImport] Imported ${pkgName} (rootRef: "${rootRef}")`)
      return { ok: true, msg: `角色包 ${pkgName} 导入成功`, name: pkgName }
    } catch (e) {
      console.error("[petPkgImport] Failed:", e)
      return { ok: false, msg: e.message }
    }
  }
}
