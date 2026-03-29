import fs from "fs-extra"
import path from "path"
import comData from "../comData/comData.js"
import petPkgSetDefault from "./petPkgSetDefault.js"

export default {
  name: "petPkgDelete",
  func: async ({ name }) => {
    if (!name || name === "default") {
      return { ok: false, msg: "默认角色包不可删除" }
    }

    try {
      const targetDir = path.resolve(process.cwd(), "../www/public/statics/petPkgs", name)
      
      if (!fs.existsSync(targetDir)) {
        return { ok: false, msg: "角色包不存在" }
      }

      await fs.remove(targetDir)
      console.log(`[petPkgDelete] Deleted package: ${name}`)

      const currentPet = comData.data.get()?.defaultPet
      if (currentPet === name) {
        await petPkgSetDefault.func({ name: "default" })
      }

      return { ok: true, msg: `角色包 ${name} 已成功删除` }
    } catch (e) {
      console.error("[petPkgDelete] Failed:", e)
      return { ok: false, msg: e.message }
    }
  }
}
