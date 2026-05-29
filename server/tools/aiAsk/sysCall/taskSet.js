import Joi from "joi"
import comData from "../../../comData/comData.js"

export default {
  name: "设置任务",
  id: "taskSet",
  hidden(toolsMode) {
    return toolsMode !== 5
  },

  async fn(argObj, context) {
    const listId = context.listId ?? 0
    const { tasks } = argObj

    const results = {
      added: [],
      updated: [],
      errors: []
    }

    await comData.data.edit((data) => {
      const chatList = data.chatLists.find(l => l.id === listId)
      if (!chatList) return

      const currentTasks = chatList.tasks || []

      // 计算当前最大 ID
      let maxId = 0
      currentTasks.forEach(t => { if (t.taskid > maxId) maxId = t.taskid })

      tasks.forEach(taskInput => {
        if (taskInput.mode === 'update') {
          // 更新逻辑
          const existingTask = currentTasks.find(t => t.taskid === taskInput.taskid)
          if (existingTask) {
            existingTask.name = taskInput.name
            existingTask.status = taskInput.status
            existingTask.process = taskInput.process
            existingTask.subtasks = taskInput.subtasks.map((st, index) => ({
              subtaskid: index + 1,
              name: st.name,
              status: st.status,
              process: st.process
            }))
            results.updated.push(taskInput.taskid)
          } else {
            results.errors.push(`未找到 taskid:${taskInput.taskid}，无法更新`)
          }
        } else if (taskInput.mode === 'add') {
          // 新增逻辑
          maxId++
          const newTask = {
            taskid: maxId,
            name: taskInput.name,
            status: taskInput.status,
            process: taskInput.process,
            subtasks: taskInput.subtasks.map((st, index) => ({
              subtaskid: index + 1,
              name: st.name,
              status: st.status,
              process: st.process
            }))
          }
          currentTasks.push(newTask)
          results.added.push({ taskid: newTask.taskid, name: newTask.name })
        }
      })
      chatList.tasks = currentTasks
    })

    // 任务更新成功后，如果 AI 只调了这一个工具，则切断后续对话，避免重复
    /*     const { allCalls } = context
        if (allCalls?.length === 1 && (results.added.length > 0 || results.updated.length > 0)) {
          const aiBasic = (await import("../basic.js")).default
          const subAgents = (await import("../subAgents.js")).default
          const targetModel = listId > 0 ? subAgents.get(listId) : aiBasic.list.find((model) => model.name === comData.data.get().currentModel)
          if (targetModel) {
            targetModel.stopRun()
          }
        } */

    const success = results.added.length > 0 || results.updated.length > 0
    let msg = success ? "任务处理完成" : "任务处理失败：未执行任何有效操作"
    if (results.added.length > 0) msg += `，新增ID: ${results.added.map(t => t.taskid).join(',')}`
    if (results.updated.length > 0) msg += `，更新ID: ${results.updated.join(',')}`

    return JSON.stringify({
      msg,
      ...results
    })
  },

  joi() {
    return Joi.object({
      tasks: Joi.array().items(Joi.object({
        mode: Joi.string().valid("add", "update").required().description("操作模式：add(新增), update(更新)"),
        taskid: Joi.number().integer().description("更新时必填，新增时不填"),
        name: Joi.string().max(50).required().description("必填 任务名称"),
        status: Joi.string().valid("规划中", "执行中", "已完成").required().description("必填:规划中/执行中/已完成 任务状态"),
        process: Joi.number().min(0).max(100).required().description("必填 百分比进度0-100"),
        subtasks: Joi.array().items(Joi.object({
          name: Joi.string().max(50).required().description("必填 子任务名称"),
          status: Joi.string().valid("规划中", "执行中", "已完成").required().description("必填:规划中/执行中/已完成 子任务状态"),
          process: Joi.number().min(0).max(100).required().description("必填 子任务进度")
        })).required().description("必填 子任务清单，每个大任务至少都有1个子任务")
      })).required().description("必填 贝叶斯定理式任务清单，详细规划任务路径。【重要】临时任务使用插入而不是清空重写")
    })
  },

  getDoc() {
    return `批量新增或更新任务（不带 taskid 为新增，带 taskid 为更新）`
  }
}
