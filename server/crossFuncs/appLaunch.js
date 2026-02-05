import appManager from "../apps/appManager.js"

export default {
  name: "appLaunch",
  func: async (type, options = {}) => {
    return await appManager.launch(type, options)
  }
}
