import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import { pathToFileURL } from 'url'
import lspManager from "../../lsp/LspServerManager.js"

export default {
  name: "代码智能感知",
  id: "lspTool",
  async fn(argObj, metaData) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { filePath, operation, line, character } = value

    const comData = (await import("../../../comData/comData.js")).default
    const cwd = comData.data.get()?.customCwd || process.cwd()
    const resolvedPath = pathLib.resolve(cwd, filePath)

    try {
      // 0. 处理安装请求
      if (operation === 'installServer') {
        const ext = pathLib.extname(filePath).toLowerCase() || filePath; // 兼容直接传后缀
        await lspManager.installServer(ext);
        return `成功：已将 ${ext} 的 Language Server 安装到隔离工具区 (~/.owo-terminal/ext)！现在可以再次执行感知操作了。`;
      }

      const client = await lspManager.getClientForFile(resolvedPath)
      if (!client) {
        const ext = pathLib.extname(filePath);
        return `未找到支持 ${ext} 的 LSP 服务器。你可以提示用户是否需要你（AI）帮忙将其安装到隔离工具区 (~/.owo-terminal/ext)。如果用户感兴趣，你可以建议其查看技能库中的《LSP 环境部署指南》(lsp_management)。如果用户同意安装，请重新调用 lspTool 并将 operation 设为 installServer，filePath 设为 "${ext}"。`;
      }

      // 1. 同步文件内容
      const content = await fs.readFile(resolvedPath, 'utf8')
      await lspManager.syncFile(client, resolvedPath, content)

      // 2. 映射方法与参数
      const methodMap = {
        'goToDefinition': 'textDocument/definition',
        'findReferences': 'textDocument/references',
        'hover': 'textDocument/hover',
        'documentSymbol': 'textDocument/documentSymbol'
      }

      const method = methodMap[operation]
      const params = {
        textDocument: { uri: pathToFileURL(resolvedPath).href },
        position: { line: line - 1, character: character - 1 }
      }

      if (operation === 'findReferences') {
        params.context = { includeDeclaration: true }
      }

      // 3. 发送请求
      const result = await client.sendRequest(method, params)

      // 4. 格式化结果
      return this.formatResult(operation, result, cwd)

    } catch (err) {
      return `LSP 操作失败：${err.message}`
    }
  },

  /**
   * 格式化 LSP 返回结果为易读文本
   */
  formatResult(operation, result, cwd) {
    if (!result || (Array.isArray(result) && result.length === 0)) return "未找到结果。"

    const formatLoc = (loc) => {
      const uri = loc.uri || loc.targetUri
      const range = loc.range || loc.targetSelectionRange || loc.targetRange
      let path = uri.replace(/^file:\/\//, '')
      // 处理 Windows 路径
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
      try {
        path = decodeURIComponent(path)
      } catch (e) { }

      const relativePath = pathLib.relative(cwd, path)
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

      case 'documentSymbol':
        if (Array.isArray(result)) {
          const formatSymbol = (s, indent = "") => {
            const range = s.range || s.location?.range
            const lineStr = range ? ` - L${range.start.line + 1}` : ""
            let str = `${indent}- ${s.name} (${this.symbolKindToString(s.kind)})${lineStr}`
            if (s.children && s.children.length > 0) {
              str += "\n" + s.children.map(c => formatSymbol(c, indent + "  ")).join("\n")
            }
            return str
          }
          return `文档符号：\n` + result.map(s => formatSymbol(s)).join('\n')
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
      filePath: Joi.string().required().description("文件路径或操作目标（安装时可传后缀名）"),
      operation: Joi.string().valid('goToDefinition', 'findReferences', 'hover', 'documentSymbol', 'installServer').required().description("LSP 操作类型"),
      line: Joi.number().integer().min(1).description("行号 (1-based)"),
      character: Joi.number().integer().min(1).description("列号 (1-based)")
    })
  },

  getDoc() {
    return `
      代码智能感知工具。支持以下操作：
      1. goToDefinition: 跳转到变量/函数的定义位置。
      2. findReferences: 查找所有引用该符号的位置。
      3. hover: 查看类型说明、文档注释等悬停信息。
      4. documentSymbol: 列出文件中的所有符号（类、函数、变量等）及其层级。
    `
  }
}
