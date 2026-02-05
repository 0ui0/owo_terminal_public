import appManager from "../apps/appManager.js"

export default {
  name: "appGetTypes",
  func: async () => {
    return appManager.getappDefs()
  }
}
