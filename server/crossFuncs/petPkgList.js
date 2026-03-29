import fs from "fs-extra"
import path from "path"

export default {
  name: "petPkgList",
  func: async () => {
    try {
      const targetDir = path.resolve(process.cwd(), "../www/public/statics/petPkgs")
      await fs.ensureDir(targetDir)
      
      const files = await fs.readdir(targetDir)
      const pkgs = []
      
      for (const file of files) {
        if (file === ".DS_Store") continue;
        const stat = await fs.stat(path.join(targetDir, file))
        if (stat.isDirectory()) {
          pkgs.push(file)
        }
      }

      return { ok: true, data: pkgs }
    } catch (e) {
      console.error("[petPkgList] Failed:", e)
      return { ok: false, msg: e.message }
    }
  }
}
