import Joi from "joi"
import comData from "../../../comData/comData.js"
import yaml from "js-yaml"

export default {
  name: "查看任务",
  id: "taskGet",

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const tasks = comData.data.get().chatLists.find(l => l.id === listId)?.tasks || []

    if (tasks.length === 0) {
      return "当前任务清单为空。"
    }

    return yaml.dump(tasks)
  },

  joi() {
    return Joi.object({})
  },

  getDoc() {
    return "查看任务清单"
  }
}
