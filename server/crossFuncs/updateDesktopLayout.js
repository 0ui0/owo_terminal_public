import comData from "../comData/comData.js"

export default {
  name: "updateDesktopLayout",
  func: async (layout) => {
    try {
      if (comData.data?.edit) {
        await comData.data.edit(async (data) => {
          data.desktopLayout = layout
        })
      }
      return { ok: true, msg: "桌面布局已更新至 comData" }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
}
