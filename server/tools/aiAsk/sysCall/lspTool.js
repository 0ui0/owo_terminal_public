import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import { pathToFileURL } from 'url'
import fsSync from "fs"
import waitConfirm from "../../waitConfirm.js"
import workDirTool from "../../workDirTool.js"
import lspManager from "../../lsp/LspServerManager.js"

export default {
  name: "lsp代码感知搜索与语法诊断",
  id: "lspTool",
  async fn(argObj, metaData) {
    const validOps = [
      'get_errors',
      'hover',
      'goToDefinition',
      'findReferences',
      'documentSymbol',
      'workspaceSymbol',
      'signatureHelp',
      'installServer'
    ]

    // 1. 手动互斥检查（严格确保一次只传一个功能对象）
    const passedOps = Object.keys(argObj || {}).filter(k => validOps.includes(k) && argObj[k] !== undefined && argObj[k] !== null)

    if (passedOps.length === 0) {
      return `错误：未提供任何有效的 LSP 操作对象。请且仅在以下互斥功能中选择一个提供：\n` +
        validOps.map(op => `- { "${op}": { ... } }`).join('\n')
    }

    if (passedOps.length > 1) {
      return `错误：操作互斥！每次调用仅允许提供一个功能对象，当前检测到同时提供了多个：[${passedOps.join(', ')}]。请仅保留一个。`
    }

    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }

    const op = passedOps[0]
    const params = value[op] || {}
    const mainDir = workDirTool.getMainWorkDir(metaData.listId)

    // 拦截无工作区时的跨文件全局操作
    const globalOps = ['workspaceSymbol', 'findReferences', 'goToDefinition']
    if (!mainDir && globalOps.includes(op)) {
      return `错误：未设置工作目录，LSP 引擎当前处于“单文件游离模式”，无法执行跨文件的 ${op} 操作。请先要求用户在界面配置工作目录，然后再重试。`
    }

    // 处理 filePath
    let targetFilePath = params.filePath || ""
    if (!mainDir && targetFilePath && !pathLib.isAbsolute(targetFilePath)) {
      return "错误：当前会话未设置工作目录。请先要求用户配置工作目录，或者在使用工具时提供绝对路径。"
    }

    const resolvedPath = targetFilePath
      ? (pathLib.isAbsolute(targetFilePath) ? targetFilePath : (mainDir ? pathLib.resolve(mainDir, targetFilePath) : targetFilePath))
      : (mainDir || "")

    let commentSuffix = ""
    // 安全白名单校验
    if (resolvedPath) {
      const workDirs = workDirTool.getWorkDirs(metaData.listId)
      const isInProject = workDirs.some(dir => resolvedPath === dir.path || resolvedPath.startsWith(dir.path + pathLib.sep))
      if (!isInProject && (await fs.stat(resolvedPath).catch(() => null))) {
        const userConfirm = await waitConfirm({
          type: "tip",
          content: `路径：${resolvedPath}`,
          title: "是否允许在工作目录外执行 lspTool 工具？",
          listId: metaData.listId,
          ext: {
            identifier: `tool:${this.id}`,
            toolId: this.id
          }
        })
        if (!userConfirm.ok) return `用户拒绝访问项目外文件：${resolvedPath}。原因：${userConfirm.comment || "未提供"}`
        if (userConfirm.comment) commentSuffix = `用户备注：${userConfirm.comment}\n\n`
      }
    }

    try {
      // 0. 处理安装请求: { installServer: { ext: ".ts" } }
      if (op === 'installServer') {
        const ext = params.ext.startsWith('.') ? params.ext : `.${params.ext}`
        await lspManager.installServer(ext.toLowerCase())
        return `成功：已将 ${ext} 的 Language Server 安装到隔离工具区 (~/.owo-terminal/ext)！现在可以再次执行感知操作了。`
      }

      // 获取对应 Language Server Client (绑定主工作目录)
      const client = await lspManager.getClientForFile(resolvedPath, mainDir)
      if (!client) {
        const ext = pathLib.extname(targetFilePath || "")
        return `未找到支持 ${ext || "当前项目"} 的 LSP 服务器。你可以提示用户是否需要你（AI）帮忙将其安装到隔离工具区 (~/.owo-terminal/ext)。如果用户同意安装，请重新调用 lspTool 并传入 { "installServer": { "ext": "${ext || '.ts'}" } }。`
      }

      // 同步文件内容
      if (targetFilePath && await fs.stat(resolvedPath).then(s => s.isFile()).catch(() => false)) {
        const content = await fs.readFile(resolvedPath, 'utf8')
        await lspManager.syncFile(client, resolvedPath, content)
      }

      // 1. 语法诊断检查 (get_errors)
      if (op === 'get_errors') {
        const fileTarget = targetFilePath ? resolvedPath : null
        let rawDiags = lspManager.getDiagnostics(mainDir, fileTarget)

        // 轮询等待 LSP 异步分析推送 (最多等 1200ms)
        for (let i = 0; i < 12; i++) {
          await new Promise(resolve => setTimeout(resolve, 100))
          rawDiags = lspManager.getDiagnostics(mainDir, fileTarget)
          if (rawDiags && rawDiags.length > 0) break
        }

        const formatted = this.formatDiagnostics(rawDiags, mainDir)
        return commentSuffix ? commentSuffix + formatted : formatted
      }

      // 【不死鸟防御机制】安全的语义查询包装器
      const safeSemanticRequest = async (method, req) => {
        try {
          return await client.sendRequest(method, req);
        } catch (err) {
          const isSemanticOp = ['workspace/symbol', 'textDocument/references', 'textDocument/definition'].includes(method);
          if (isSemanticOp && err.message && err.message.includes('No Project')) {
            console.log(`[LSP 防御] 捕获到底层失忆 Bug (No Project)，触发不死鸟重启重试...`);
            await lspManager.disposeWorkspace(mainDir);
            const newClient = await lspManager.getClientForFile(resolvedPath, mainDir);
            if (!newClient) throw new Error("重建 LSP 进程失败");
            return await newClient.sendRequest(method, req);
          }
          throw err;
        }
      };

      // 2. 全项目符号模糊搜索 (workspaceSymbol)
      if (op === 'workspaceSymbol') {
        const result = await safeSemanticRequest('workspace/symbol', { query: params.query || "" })
        const finalOutput = this.formatResult('workspaceSymbol', result, mainDir)
        return commentSuffix ? commentSuffix + finalOutput : finalOutput
      }

      // 3. 映射其余标准 LSP 方法
      const methodMap = {
        'goToDefinition': 'textDocument/definition',
        'findReferences': 'textDocument/references',
        'hover': 'textDocument/hover',
        'documentSymbol': 'textDocument/documentSymbol',
        'signatureHelp': 'textDocument/signatureHelp'
      }

      const method = methodMap[op]
      if (!method) {
        return `不支持的操作类型: ${op}`
      }

      const requestParams = {
        textDocument: { uri: pathToFileURL(resolvedPath).href }
      }

      if (params.line !== undefined && params.character !== undefined) {
        requestParams.position = { line: params.line - 1, character: params.character - 1 }
      }

      if (op === 'findReferences') {
        requestParams.context = { includeDeclaration: true }
      }

      const result = await safeSemanticRequest(method, requestParams)
      const finalOutput = this.formatResult(op, result, mainDir)
      return commentSuffix ? commentSuffix + finalOutput : finalOutput

    } catch (err) {
      return `LSP 操作失败：${err.message}`
    }
  },

  /**
   * 格式化语法诊断与错误列表 (对齐 get_errors)
   */
  formatDiagnostics(allFileDiags, mainDir) {
    if (!allFileDiags || allFileDiags.length === 0) {
      return "✅ 未发现任何代码语法错误或警告。"
    }

    const errorLines = []
    let totalErrors = 0
    let totalWarnings = 0

    for (const item of allFileDiags) {
      const uri = item.uri
      const diags = item.diagnostics || []
      let filePath = uri.replace(/^file:\/\//, '')
      if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)
      try { filePath = decodeURIComponent(filePath) } catch (e) { }
      const relPath = mainDir ? pathLib.relative(mainDir, filePath) : filePath

      for (const d of diags) {
        const sevNum = d.severity || 1
        if (sevNum > 2) continue // 仅关注 Error 和 Warning

        const isError = sevNum === 1
        if (isError) totalErrors++
        else totalWarnings++

        const startLine = (d.range?.start?.line ?? 0) + 1
        const startChar = (d.range?.start?.character ?? 0) + 1
        const codeStr = d.code ? ` (${d.code})` : ""
        const sourceStr = d.source ? `[${d.source}] ` : ""
        const tag = isError ? "🔴 Error" : "🟡 Warning"

        errorLines.push(`- ${tag} ${relPath}:${startLine}:${startChar} - ${sourceStr}${d.message}${codeStr}`)
      }
    }

    if (errorLines.length === 0) {
      return "✅ 未发现任何代码语法错误或警告。"
    }

    const summary = `发现 ${totalErrors} 个错误，${totalWarnings} 个警告：`
    return `${summary}\n` + errorLines.join('\n')
  },

  /**
   * 格式化 LSP 返回结果为易读文本
   */
  formatResult(operation, result, mainDir) {
    if (!result || (Array.isArray(result) && result.length === 0)) return "未找到结果。"

    const formatLoc = (loc) => {
      const uri = loc.uri || loc.targetUri
      const range = loc.range || loc.targetSelectionRange || loc.targetRange
      let path = uri.replace(/^file:\/\//, '')
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
      try { path = decodeURIComponent(path) } catch (e) { }

      const relativePath = mainDir ? pathLib.relative(mainDir, path) : path
      return `${relativePath}:${range.start.line + 1}:${range.start.character + 1}`
    }

    switch (operation) {
      case 'goToDefinition':
        if (Array.isArray(result)) {
          return `找到 ${result.length} 个定义：\n` + result.map(loc => `- ${formatLoc(loc)}`).join('\n')
        }
        return `定义位置：${formatLoc(result)}`

      case 'findReferences':
        if (Array.isArray(result)) {
          return `找到 ${result.length} 个引用：\n` + result.map(loc => `- ${formatLoc(loc)}`).join('\n')
        }
        return "未找到引用。"

      case 'hover':
        let hoverContent = ""
        if (result.contents) {
          if (typeof result.contents === 'string') {
            hoverContent = result.contents
          } else if (Array.isArray(result.contents)) {
            hoverContent = result.contents.map(c => typeof c === 'string' ? c : c.value).join('\n\n')
          } else {
            hoverContent = result.contents.value
          }
        }
        return `悬停信息：\n${hoverContent}`

      case 'signatureHelp':
        if (result.signatures && result.signatures.length > 0) {
          const sigs = result.signatures.map(s => {
            const doc = s.documentation ? (typeof s.documentation === 'string' ? s.documentation : s.documentation.value) : ""
            return `签名: ${s.label}${doc ? `\n文档: ${doc}` : ""}`
          })
          return sigs.join('\n\n')
        }
        return "未找到函数签名信息。"

      case 'workspaceSymbol':
      case 'documentSymbol':
        if (Array.isArray(result)) {
          const formatSymbol = (s, indent = "") => {
            const range = s.range || s.location?.range
            const lineStr = range ? ` - L${range.start.line + 1}` : ""
            const locPath = s.location?.uri ? ` (${mainDir ? pathLib.relative(mainDir, s.location.uri.replace(/^file:\/\//, '')) : s.location.uri})` : ""
            let str = `${indent}- ${s.name} [${this.symbolKindToString(s.kind)}]${locPath}${lineStr}`
            if (s.children && s.children.length > 0) {
              str += "\n" + s.children.map(c => formatSymbol(c, indent + "  ")).join("\n")
            }
            return str
          }
          return `找到符号：\n` + result.map(s => formatSymbol(s)).join('\n')
        }
        return "未找到符号。"

      default:
        return JSON.stringify(result, null, 2)
    }
  },

  symbolKindToString(kind) {
    const kinds = {
      1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
      6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
      11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant',
      15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object',
      20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
      25: 'Operator', 26: 'TypeParameter'
    }
    return kinds[kind] || 'Unknown'
  },

  joi() {
    return Joi.object({
      get_errors: Joi.object({
        filePath: Joi.string().description("目标文件路径（可选，缺省则检查当前项目全部文件）")
      }).description("检查代码的语法错误与类型报错 (对齐 VSCode get_errors)"),

      hover: Joi.object({
        filePath: Joi.string().required().description("文件路径"),
        line: Joi.number().integer().min(1).required().description("行号 (1-based)"),
        character: Joi.number().integer().min(1).required().description("列号 (1-based)")
      }).description("悬停查看变量/函数的类型签名与文档注释"),

      goToDefinition: Joi.object({
        filePath: Joi.string().required().description("调用点所在文件路径"),
        line: Joi.number().integer().min(1).required().description("调用点行号 (1-based)"),
        character: Joi.number().integer().min(1).required().description("调用点列号 (1-based)")
      }).description("跳转到变量/函数的定义位置"),

      findReferences: Joi.object({
        filePath: Joi.string().required().description("符号所在文件路径"),
        line: Joi.number().integer().min(1).required().description("行号 (1-based)"),
        character: Joi.number().integer().min(1).required().description("列号 (1-based)")
      }).description("查找全项目中所有引用该符号的位置"),

      documentSymbol: Joi.object({
        filePath: Joi.string().required().description("文件路径")
      }).description("提取单文件内的所有函数、类、属性等大纲符号"),

      workspaceSymbol: Joi.object({
        query: Joi.string().required().description("要搜索的函数名/类名/符号关键字")
      }).description("在全项目中模糊搜索符号定义"),

      signatureHelp: Joi.object({
        filePath: Joi.string().required().description("文件路径"),
        line: Joi.number().integer().min(1).required().description("行号 (1-based)"),
        character: Joi.number().integer().min(1).required().description("列号 (1-based)")
      }).description("查看函数调用时的参数签名与重载提示"),

      installServer: Joi.object({
        ext: Joi.string().required().description("语言扩展名（如 '.ts', '.py', '.js'）")
      }).description("一键将对应语言的 Language Server 安装到隔离工具区")
    })
  },

  getDoc() {
    return `
      【重要使用规则】：每次调用必须且仅能传入一个互斥的功能对象：
      1. get_errors: { filePath?: "路径" } - 语法与类型报错检查（写完代码后必调）。
      2. hover: { filePath: "路径", line: 10, character: 5 } - 悬停查看类型。
      3. goToDefinition: { filePath: "路径", line: 10, character: 5 } - 跳转定义。
      4. findReferences: { filePath: "路径", line: 10, character: 5 } - 全局查找引用。
      5. workspaceSymbol: { query: "函数名" } - 全项目模糊搜索符号。
      6. documentSymbol: { filePath: "路径" } - 单文件大纲结构。
      7. signatureHelp: { filePath: "路径", line: 10, character: 5 } - 参数签名。
      8. installServer: { ext: ".ts" } - 自动安装 LSP 语言服务器。
    `
  }
}
