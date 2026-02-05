import Joi from "joi"
import fs from "fs/promises"
import pathLib from "path"
import { parse } from "@babel/parser"

export default {
  name: "获取文件大纲",
  id: "fileOutline",
  async fn(argObj) {
    let { value, error } = this.joi().validate(argObj)
    if (error) {
      return "错误：" + error.details[0].message
    }
    let { path } = value
    const resolvedPath = pathLib.resolve(path)
    const ext = pathLib.extname(resolvedPath).toLowerCase()

    try {
      const content = await fs.readFile(resolvedPath, 'utf8')

      // 如果不是 JS/TS，回退到正则匹配
      if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
        return this.regexFallback(content)
      }

      // 使用 Babel Parser
      // 开启 tolerant 模式，忽略部分语法错误
      // 开启 typescript / jsx 插件支持
      try {
        const ast = parse(content, {
          sourceType: "module",
          plugins: ["typescript", "jsx", "classProperties", "decorators-legacy", "dynamicImport"],
          attachComment: false
        })

        const items = []

        // 遍历 AST 提取顶级定义
        // 只关注 Program 下的 body
        for (const node of ast.program.body) {
          this.processNode(node, items, content)
        }

        if (items.length === 0) {
          return "未解析到明显的函数或类定义。文件看起来是脚本或配置。"
        }

        return items.join("\n")

      } catch (parseErr) {
        // 解析失败（可能是语法太新或太乱），回退到正则
        // console.log("Babel Parse Failed, fallback to regex:", parseErr.message)
        return this.regexFallback(content)
      }

    } catch (err) {
      return `读取失败：${err.message}`
    }
  },

  processNode(node, items, sourceCode) {
    // 处理 Function
    if (node.type === "FunctionDeclaration") {
      const name = node.id ? node.id.name : "(anonymous)"
      items.push(`Line ${node.loc.start.line}: function ${name}()`)
    }
    // 处理 Class
    else if (node.type === "ClassDeclaration") {
      const name = node.id ? node.id.name : "(anonymous)"
      items.push(`Line ${node.loc.start.line}: class ${name}`)
      // 提取类方法
      if (node.body && node.body.body) {
        for (const method of node.body.body) {
          if (method.type === "ClassMethod" || method.type === "ClassProperty") {
            if (method.key && method.key.name) {
              items.push(`  Line ${method.loc.start.line}: method ${method.key.name}`)
            }
          }
        }
      }
    }
    // 处理 Export Named
    else if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) {
        this.processNode(node.declaration, items, sourceCode)
      }
    }
    // 处理 Export Default
    else if (node.type === "ExportDefaultDeclaration") {
      if (node.declaration) {
        // 如果 default导出的是类或函数，递归处理以提取方法
        if (node.declaration.type === "ClassDeclaration" || node.declaration.type === "FunctionDeclaration") {
          this.processNode(node.declaration, items, sourceCode)
        } else {
          // 其他情况只标记 export default
          items.push(`Line ${node.loc.start.line}: export default`)
        }
      }
    }
    // 处理 Variable (const foo = () => {})
    else if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (decl.init && (decl.init.type === "ArrowFunctionExpression" || decl.init.type === "FunctionExpression")) {
          if (decl.id && decl.id.name) {
            items.push(`Line ${decl.loc.start.line}: const ${decl.id.name} = function/arrow`)
          }
        }
      }
    }
  },

  regexFallback(content) {
    const lines = content.split(/\r?\n/)
    const patterns = [
      /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/,
      /^\s*(?:export\s+)?(?:default\s+)?class\s+([a-zA-Z0-9_$]+)/,
      /^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\(.*?\)\s*=>)/,
      /^\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\(.*?\)\s*\{/,
      /^(\s*)(?:[a-zA-Z0-9_$]+)\s*:\s*(?:async\s*)?(?:function|\(.*?\)\s*=>)/
    ]
    const outline = []
    lines.forEach((line, index) => {
      if (line.length > 200) return
      for (let pattern of patterns) {
        if (pattern.test(line)) {
          let cleanLine = line.trim()
          if (cleanLine.endsWith("{")) cleanLine = cleanLine.slice(0, -1)
          outline.push(`Line ${index + 1}: ${cleanLine}`)
          break
        }
      }
    })
    if (outline.length === 0) return "未解析到定义 (Regex Fallback)。"
    return outline.join("\n")
  },

  joi() {
    return Joi.object({
      path: Joi.string().required().description("文件绝对路径")
    })
  },
  getDoc() {
    return `
      使用 Babel AST 解析器生成精确的 JS/TS 文件大纲。
      非 JS 文件自动回退到正则匹配。
    `
  }
}
