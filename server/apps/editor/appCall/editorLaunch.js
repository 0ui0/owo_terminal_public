import Joi from "joi"
import pathLib from "path"
import appManager from "../../appManager.js"
import waitConfirm from "../../../tools/waitConfirm.js"
import workDirTool from "../../../tools/workDirTool.js"

export default {
  name: "启动编辑器",
  id: "editorLaunch",

  async fn(argObj, metaData) {
    const { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const { filePath, content, line, singleInstance, args } = value
    const listId = metaData?.listId

    // 工作目录校验：与 fileOpener 等工具保持一致，工作目录外访问需用户确认
    const mainDir = workDirTool.getMainWorkDir(listId)
    if (!mainDir && !pathLib.isAbsolute(filePath)) {
      return "错误：当前会话未设置工作目录。请先要求用户配置工作目录，或者在使用工具时提供绝对路径。"
    }
    const resolvedPath = pathLib.isAbsolute(filePath) ? filePath : pathLib.resolve(mainDir, filePath)

    let commentSuffix = ""
    const workDirs = workDirTool.getWorkDirs(listId)
    const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
    if (!isInProject) {
      const userConfirm = await waitConfirm({
        type: "tip",
        content: `路径：${resolvedPath}`,
        title: "是否允许在工作目录外执行 editorLaunch 工具？",
        listId,
        ext: {
          identifier: `tool:${this.id}`,
          toolId: this.id
        }
      })
      if (!userConfirm.ok) {
        return `用户拒绝在工作目录外打开文件：${resolvedPath}。原因：${userConfirm.comment || "未提供"}`
      }
      if (userConfirm.comment) {
        commentSuffix = `。用户备注：${userConfirm.comment}`
      }
    }

    const launchRes = await appManager.launch("editor", {
      data: {
        ...args,
        filePath: resolvedPath,
        line,
        singleInstance,
        //content,
      }
    })

    if (launchRes && launchRes.ok) {
      return `已启动编辑器, 实例 ID: ${launchRes.app.id}${commentSuffix}`
    } else {
      return `启动失败: ${String(launchRes?.msg || "未知错误")}${commentSuffix}`
    }
  },

  joi() {
    return Joi.object({
      filePath: Joi.string().required().description("打开指定文件路径"),
      line: Joi.number().integer().min(1).description("打开文件后自动跳转居中并高亮定位的行号 (1-based)"),
      singleInstance: Joi.boolean().default(false).description("是否单例模式，已打开时直接激活旧窗口"),
      //取消使用content: Joi.string().optional().description("初始填充内容"),
      args: Joi.object({}).unknown().description("额外参数")
    })
  },

  getDoc() {
    return `启动编辑器打开指定文件`
  }
}
