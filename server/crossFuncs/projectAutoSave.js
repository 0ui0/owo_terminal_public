
import Joi from "joi"
import projectManager from "../managers/projectManager.js"

export default {
  name: "projectAutoSave",
  func: async ({ enabled, interval }) => {
    if (enabled) {
      projectManager.startAutoSave(interval)
    } else {
      projectManager.stopAutoSave()
    }
    return { ok: true }
  }
}
