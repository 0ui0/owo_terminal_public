import Joi from "joi"
import comData from "../../../comData/comData.js"

export default {
  name: "删除任务",
  id: "taskDel",

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const { taskids } = argObj

    await comData.data.edit((data) => {
      const chatList = data.chatLists.find(l => l.id === listId)
      if (!chatList) return
      const currentTasks = chatList.tasks || []
      chatList.tasks = currentTasks.filter(t => !taskids.includes(t.taskid))
    })

    // 任务更新成功后，如果 AI 只调了这一个工具，则切断后续对话，避免重复
    /*     const { allCalls } = context
        if (allCalls?.length === 1) {
          const aiBasic = (await import("../basic.js")).default
          const subAgents = (await import("../subAgents.js")).default
          const targetModel = listId > 0 ? subAgents.get(listId) : aiBasic.list.find((model) => model.name === comData.data.get().currentModel)
          if (targetModel) {
            targetModel.stopRun()
          }
        } */

    return "任务删除成功"
  },

  joi() {
    return Joi.object({
      taskids: Joi.array().items(Joi.number().integer()).required().description("任务id列表")
    })
  },

  getDoc() {
    return "批量删除任务"
  }
}
